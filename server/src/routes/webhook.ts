import express, { Router } from 'express';
import { env } from '../env.js';
import { one, q } from '../db.js';
import { HttpError } from '../http.js';
import { getOrder, getOrderByCode, transition, type Actor } from '../orders.js';
import { LABEL, type Status } from '../status.js';
import { logWa, sendText, verifySignature } from '../whatsapp.js';

export const webhook = Router();

// Meta calls this once when you set up the webhook.
webhook.get('/', (req, res) => {
  const ok = req.query['hub.mode'] === 'subscribe' && env.WA_VERIFY_TOKEN && req.query['hub.verify_token'] === env.WA_VERIFY_TOKEN;
  if (ok) return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  res.sendStatus(403);
});

webhook.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body as Buffer;
  if (!verifySignature(raw, req.header('x-hub-signature-256'))) return res.sendStatus(401);
  let body: any;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  try {
    await processWebhook(body);
  } catch (e) {
    console.error('webhook processing failed', e);
  }
  res.sendStatus(200); // always 200 once verified, or Meta retries for days
});

export async function processWebhook(body: any) {
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      for (const st of v.statuses ?? []) {
        await q(`update wa_messages set status = $2, error = $3, updated_at = now() where wa_message_id = $1`, [
          st.id,
          st.status,
          st.errors?.[0]?.title ?? null,
        ]);
      }
      for (const m of v.messages ?? []) await handleInbound(m);
    }
  }
}

const WORDS: Record<string, Status> = {
  ok: 'ack',
  received: 'ack',
  mila: 'ack',
  start: 'production',
  started: 'production',
  making: 'production',
  ready: 'ready',
  done: 'ready',
  taiyar: 'ready',
  tayyar: 'ready',
};
const CODE_RE = /\b(\d{4}-[A-Z0-9]{3})\b/i;

/** Read what the factory sent back: a button tap ("ACK:<id>") or a text like "OK 0311-K7Q" / "READY 0311-K7Q". */
export function parseReply(text: string): { to?: Status; code?: string } {
  const t = text.trim();
  const code = t.match(CODE_RE)?.[1]?.toUpperCase();
  const word = t.toLowerCase().match(/[a-z]+/g)?.find((w) => WORDS[w]);
  return { to: word ? WORDS[word] : undefined, code };
}

async function handleInbound(m: any) {
  const from = String(m.from ?? '');
  const text: string = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? '';
  const payload: string = m.button?.payload ?? m.interactive?.button_reply?.id ?? '';
  await logWa({ direction: 'in', id: m.id, phone: from, kind: m.type ?? 'text', body: payload ? `${text} [${payload}]` : text });

  const sender = await one<{ id: string; name: string; role: 'owner' | 'factory' | 'staff' }>(
    `select id, name, role from users where phone = $1 and active and role in ('factory', 'owner')`,
    [from],
  );
  if (!sender) return; // customers or unknown numbers: logged only

  const actor: Actor = { id: sender.id, role: sender.role, name: sender.name };
  let orderId: string | undefined;
  let to: Status | undefined;

  if (payload.startsWith('ACK:')) {
    orderId = payload.slice(4);
    to = 'ack';
  } else {
    const p = parseReply(text);
    to = p.to;
    if (p.code) orderId = (await getOrderByCode(p.code))?.id;
    else if (to === 'ack') {
      // "OK" with no number: only safe if exactly one order is waiting for confirmation
      const waiting = await q<{ id: string }>(`select id from orders where status = 'sent'`);
      if (waiting.length === 1) orderId = waiting[0].id;
      else if (waiting.length > 1) {
        return sendText(from, `${waiting.length} orders are waiting. Please reply with the order number, for example: OK ${(await getOrder(waiting[0].id)).code}`);
      }
    }
    if (p.code && !orderId) return sendText(from, `I couldn't find order ${p.code}. Please check the number.`);
  }
  if (!orderId || !to) {
    return sendText(from, 'To update an order, reply: OK <order no.> when received, START <order no.> when you begin, READY <order no.> when it is ready.');
  }

  try {
    const o = await transition(orderId, to, actor, 'whatsapp_reply', text || payload);
    await sendText(from, `✅ ${o.code} (${o.customer_name}): ${LABEL[o.status]}`, o.id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) {
      const o = await getOrder(orderId).catch(() => undefined);
      return sendText(from, o ? `${o.code} is already "${LABEL[o.status]}". Nothing changed.` : 'Order not found.', orderId);
    }
    if (e instanceof HttpError && e.status === 404) return sendText(from, 'Order not found.');
    throw e;
  }
}

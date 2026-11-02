import crypto from 'node:crypto';
import { env, waEnabled } from './env.js';
import { q } from './db.js';
import { HttpError } from './http.js';
import type { OrderView } from './orders.js';

export class WaError extends Error {}

/** WhatsApp template parameters may not contain newlines, tabs or 4+ spaces in a row. */
export function cleanParam(s: string, max = 900): string {
  const t = String(s ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!t) return '-';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

async function call(payload: Record<string, unknown>): Promise<string> {
  const r = await fetch(`https://graph.facebook.com/${env.WA_API_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new WaError(j?.error?.message ?? `WhatsApp API error ${r.status}`);
  return j?.messages?.[0]?.id ?? '';
}

async function log(m: { direction: 'out' | 'in'; id?: string; phone: string; orderId?: string | null; kind: string; body: string; status?: string; error?: string }) {
  await q(
    `insert into wa_messages(direction, wa_message_id, phone, order_id, kind, body, status, error)
     values ($1, nullif($2, ''), $3, $4, $5, $6, $7, $8) on conflict (wa_message_id) do nothing`,
    [m.direction, m.id ?? '', m.phone, m.orderId ?? null, m.kind, m.body, m.status ?? null, m.error ?? null],
  );
}

export async function sendText(to: string, text: string, orderId?: string | null) {
  if (!waEnabled()) return;
  try {
    const id = await call({ to, type: 'text', text: { body: text } });
    await log({ direction: 'out', id, phone: to, orderId, kind: 'reply', body: text, status: 'sent' });
  } catch (e) {
    await log({ direction: 'out', phone: to, orderId, kind: 'reply', body: text, status: 'failed', error: (e as Error).message });
  }
}

async function sendTemplate(to: string, name: string, params: string[], kind: string, orderId: string, buttonPayload?: string) {
  const components: any[] = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: cleanParam(text) })) }];
  if (buttonPayload) components.push({ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: buttonPayload }] });
  const body = `[template ${name}] ${params.join(' | ')}`;
  try {
    const id = await call({ to, type: 'template', template: { name, language: { code: env.WA_TEMPLATE_LANG }, components } });
    await log({ direction: 'out', id, phone: to, orderId, kind, body, status: 'sent' });
    return id;
  } catch (e) {
    await log({ direction: 'out', phone: to, orderId, kind, body, status: 'failed', error: (e as Error).message });
    throw new HttpError(502, `WhatsApp didn't accept the message: ${(e as Error).message}`);
  }
}

export const itemsLine = (o: OrderView) => o.items.map((it, i) => `${i + 1}) ${it.name} - ${it.qty} ${it.unit}`).join(' | ');

/** Template "new_order_factory": {{1}} order no, {{2}} customer, {{3}} due date, {{4}} items. Quick-reply button "Received". */
export function sendFactoryOrder(to: string, o: OrderView) {
  return sendTemplate(
    to,
    env.WA_TEMPLATE_FACTORY,
    [o.code, o.customer_name, o.due_date ?? 'not set', itemsLine(o)],
    'factory_order',
    o.id,
    env.WA_TEMPLATE_FACTORY_BUTTON ? `ACK:${o.id}` : undefined,
  );
}

/** Template "order_ready_customer": {{1}} customer name, {{2}} order no, {{3}} business name. */
export function sendCustomerReady(to: string, o: OrderView, businessName: string) {
  return sendTemplate(to, env.WA_TEMPLATE_CUSTOMER, [o.customer_name, o.code, businessName || 'us'], 'customer_ready', o.id);
}

/** Plain-text versions used for tap-to-send wa.me links when the Cloud API isn't configured. */
export function factoryText(o: OrderView) {
  const lines = o.items.map((it, i) => `${i + 1}. ${it.name} — ${it.qty} ${it.unit}`).join('\n');
  return `*New order ${o.code}*\nCustomer: ${o.customer_name}\nDue: ${o.due_date ?? 'not set'}\n\n${lines}${o.note ? `\n\nNote: ${o.note}` : ''}\n\nReply "OK ${o.code}" when you receive this.`;
}
export function customerText(o: OrderView, businessName: string) {
  return `Namaste ${o.customer_name}, your order ${o.code} (${o.items.length} item${o.items.length > 1 ? 's' : ''}) is ready.${businessName ? `\n– ${businessName}` : ''}`;
}
export const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

export function verifySignature(raw: Buffer, header: string | undefined): boolean {
  if (!env.WA_APP_SECRET) return true; // not configured: accept (dev only)
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', env.WA_APP_SECRET).update(raw).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export { log as logWa };

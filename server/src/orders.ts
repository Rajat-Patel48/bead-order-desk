import { one, q, tx, type Db } from './db.js';
import { HttpError } from './http.js';
import { canTransition, computeAlerts, LABEL, skippedStages, type Alert, type Role, type Status } from './status.js';
import { getSettings } from './settings.js';
import { pushToRoles, pushToUser } from './push.js';
import { waEnabled } from './env.js';
import { sendCustomerReady } from './whatsapp.js';

export interface OrderEvent {
  status: Status;
  at: string;
  via: string;
  detail: string | null;
  actor: string | null;
  actorRole: Role | null;
}
export interface OrderView {
  id: string;
  code: string;
  customer_name: string;
  customer_phone: string;
  due_date: string | null;
  note: string;
  status: Status;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  items: { id: number; name: string; unit: string; qty: number }[];
  events: OrderEvent[];
  status_at: string;
  alerts: Alert[];
  factory_msg_status: string | null;
  customer_msg_status: string | null;
}

const SELECT = `
  select o.*, u.name as created_by_name,
    (select coalesce(json_agg(json_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'qty', i.qty) order by i.id), '[]')
       from order_items i where i.order_id = o.id) as items,
    (select coalesce(json_agg(json_build_object('status', e.status, 'at', e.at, 'via', e.via, 'detail', e.detail,
              'actor', a.name, 'actorRole', a.role) order by e.at, e.id), '[]')
       from order_events e left join users a on a.id = e.actor_id where e.order_id = o.id) as events,
    (select w.status from wa_messages w where w.order_id = o.id and w.kind = 'factory_order' order by w.id desc limit 1) as factory_msg_status,
    (select w.status from wa_messages w where w.order_id = o.id and w.kind = 'customer_ready' order by w.id desc limit 1) as customer_msg_status
  from orders o left join users u on u.id = o.created_by`;

export async function hydrate(rows: any[]): Promise<OrderView[]> {
  const s = await getSettings();
  const now = Date.now();
  return rows.map((r) => {
    const last = [...r.events].reverse().find((e: OrderEvent) => e.status === r.status);
    const status_at = last?.at ?? r.updated_at;
    return { ...r, status_at, alerts: computeAlerts({ status: r.status, due_date: r.due_date, status_at }, s, now) };
  });
}

export async function getOrder(id: string, db?: Db): Promise<OrderView> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Order not found.');
  const rows = await q(`${SELECT} where o.id = $1`, [id], db);
  if (!rows.length) throw new HttpError(404, 'Order not found.');
  return (await hydrate(rows))[0];
}

export async function getOrderByCode(code: string): Promise<OrderView | undefined> {
  const rows = await q(`${SELECT} where upper(o.code) = upper($1)`, [code]);
  return rows.length ? (await hydrate(rows))[0] : undefined;
}

export async function listOrders(opts: { scope: 'open' | 'done' | 'all' | 'factory'; search?: string; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.scope === 'open') where.push(`o.status in ('created','sent','ack','production','ready','notified')`);
  if (opts.scope === 'done') where.push(`o.status in ('delivered','cancelled')`);
  if (opts.scope === 'factory')
    where.push(`(o.status in ('sent','ack','production') or (o.status in ('ready','notified','delivered') and o.updated_at > now() - interval '3 days'))`);
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(o.code ilike ${p} or o.customer_name ilike ${p} or o.customer_phone ilike ${p}
      or exists (select 1 from order_items i where i.order_id = o.id and i.name ilike ${p}))`);
  }
  params.push(Math.min(opts.limit ?? 200, 500));
  const sql = `${SELECT} ${where.length ? 'where ' + where.join(' and ') : ''} order by o.updated_at desc limit $${params.length}`;
  return hydrate(await q(sql, params));
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  const d = new Date(Date.now() + 5.5 * 3600e3); // IST date
  let r = '';
  for (let i = 0; i < 3; i++) r += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}-${r}`;
}

export async function createOrder(
  input: { customerName: string; customerPhone: string; dueDate: string | null; note: string; items: { itemId?: number; name?: string; qty: number }[] },
  actor: { id: string },
): Promise<OrderView> {
  const id = await tx(async (c) => {
    const lines: { itemId: number | null; name: string; unit: string; qty: number }[] = [];
    for (const it of input.items) {
      if (it.itemId) {
        const row = await one<{ id: number; name: string; unit: string }>(`select id, name, unit from items where id = $1`, [it.itemId], c);
        if (!row) throw new HttpError(400, `Item ${it.itemId} not found in the item list.`);
        lines.push({ itemId: row.id, name: row.name, unit: row.unit, qty: it.qty });
      } else if (it.name?.trim()) {
        lines.push({ itemId: null, name: it.name.trim(), unit: 'Pcs', qty: it.qty });
      } else throw new HttpError(400, 'Each item needs an item from the list or a name.');
    }
    let orderId = '';
    for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
      const row = await one<{ id: string }>(
        `insert into orders(code, customer_name, customer_phone, due_date, note, status, created_by)
         values ($1, $2, $3, $4, $5, 'created', $6) on conflict (code) do nothing returning id`,
        [newCode(), input.customerName.trim(), input.customerPhone, input.dueDate, input.note.trim(), actor.id],
        c,
      );
      if (row) orderId = row.id;
    }
    if (!orderId) throw new HttpError(500, 'Could not create an order number. Try again.');
    for (const l of lines)
      await q(`insert into order_items(order_id, item_id, name, unit, qty) values ($1, $2, $3, $4, $5)`, [orderId, l.itemId, l.name, l.unit, l.qty], c);
    await q(`insert into order_events(order_id, status, actor_id, via) values ($1, 'created', $2, 'app')`, [orderId, actor.id], c);
    return orderId;
  });
  return getOrder(id);
}

export interface Actor {
  id: string | null;
  role: Role | 'system';
  name?: string;
}

/** The single place an order's status changes. Validates who may do it and records the event(s). */
export async function transition(orderId: string, to: Status, actor: Actor, via: string, detail?: string): Promise<OrderView> {
  const { before } = await tx(async (c) => {
    const row = await one<{ status: Status }>(`select status from orders where id = $1 for update`, [orderId], c);
    if (!row) throw new HttpError(404, 'Order not found.');
    if (!canTransition(actor.role, row.status, to)) {
      throw new HttpError(409, `Can't change this order from "${LABEL[row.status]}" to "${LABEL[to]}".`, { status: row.status });
    }
    for (const s of skippedStages(row.status, to))
      await q(`insert into order_events(order_id, status, actor_id, via, detail) values ($1, $2, $3, $4, 'skipped')`, [orderId, s, actor.id, via], c);
    await q(`insert into order_events(order_id, status, actor_id, via, detail) values ($1, $2, $3, $4, $5)`, [orderId, to, actor.id, via, detail ?? null], c);
    await q(`update orders set status = $2, updated_at = now() where id = $1`, [orderId, to], c);
    return { before: row.status };
  });
  const order = await getOrder(orderId);
  afterTransition(order, before, actor).catch((e) => console.error('afterTransition', e));
  return order;
}

/** Notifications and automatic follow-ups. Never throws into the request. */
async function afterTransition(o: OrderView, _before: Status, actor: Actor) {
  const ref = `${o.code} · ${o.customer_name}`;
  const data = { orderId: o.id };
  if (o.status === 'sent') await pushToRoles(['factory'], 'New order', `${ref} · ${o.items.length} items`, data);
  if (o.status === 'ack') await pushToUser(o.created_by, 'Factory confirmed', ref, data);
  if (o.status === 'ready') {
    await pushToRoles(['owner'], 'Order ready', ref, data, actor.id ?? undefined);
    await pushToUser(o.created_by, 'Order ready: tell the customer', ref, data);
    const s = await getSettings();
    if (waEnabled() && s.autoNotifyCustomer && o.customer_phone) {
      try {
        await sendCustomerReady(o.customer_phone, o, s.businessName);
        await transition(o.id, 'notified', { id: null, role: 'system' }, 'whatsapp_api', 'sent automatically');
      } catch (e) {
        await pushToUser(o.created_by, "Couldn't message the customer", `${ref}: ${(e as Error).message}`, data);
      }
    }
  }
  if (o.status === 'cancelled') await pushToRoles(['owner', 'factory'], 'Order cancelled', ref, data, actor.id ?? undefined);
}

import fs from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashPin } from '../src/auth.js';
import { pool, q } from '../src/db.js';
import { migrate } from '../src/scripts/migrate.js';
import { processWebhook, parseReply } from '../src/routes/webhook.js';
import { canTransition, computeAlerts, DEFAULT_SETTINGS } from '../src/status.js';

const app = buildApp();
const tok: Record<string, string> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

async function addUser(name: string, phone: string, role: string, pin = '1234') {
  await q(`insert into users(name, phone, role, pin_hash) values ($1, $2, $3, $4)`, [name, phone, role, await hashPin(pin)]);
}
async function loginAs(who: string, phone: string, pin = '1234') {
  const r = await request(app).post('/auth/login').send({ phone, pin });
  expect(r.status).toBe(200);
  tok[who] = r.body.token;
}
const waMsg = (from: string, body: { text?: string; payload?: string }) => ({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              body.payload
                ? { from, id: 'wamid.' + Math.random(), type: 'button', button: { text: 'Received', payload: body.payload } }
                : { from, id: 'wamid.' + Math.random(), type: 'text', text: { body: body.text } },
            ],
          },
        },
      ],
    },
  ],
});

beforeAll(async () => {
  await q(`drop schema public cascade; create schema public;`);
  await migrate();
  const items: { name: string; unit: string }[] = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url), 'utf8'));
  await q(`insert into items(name, unit) select * from unnest($1::text[], $2::text[])`, [items.map((i) => i.name), items.map((i) => i.unit)]);
  await addUser('Mehta (owner)', '919800000000', 'owner');
  await addUser('Ramesh', '919800000001', 'staff');
  await addUser('Factory Raju', '919800000002', 'factory');
  await loginAs('owner', '9800000000');
  await loginAs('staff', '98000 00001');
  await loginAs('factory', '+91 98000-00002');
});
afterAll(async () => {
  await pool.end();
});

describe('rules', () => {
  it('staff can never confirm for the factory; factory can never deliver', () => {
    expect(canTransition('staff', 'sent', 'ack')).toBe(false);
    expect(canTransition('staff', 'created', 'sent')).toBe(true);
    expect(canTransition('factory', 'sent', 'ready')).toBe(true);
    expect(canTransition('factory', 'ready', 'delivered')).toBe(false);
    expect(canTransition('factory', 'created', 'ack')).toBe(false);
    expect(canTransition('owner', 'delivered', 'cancelled')).toBe(false);
  });
  it('alerts fire on time limits', () => {
    const h = 3600e3;
    const now = Date.now();
    expect(computeAlerts({ status: 'sent', due_date: null, status_at: new Date(now - 5 * h) }, DEFAULT_SETTINGS, now)[0]?.type).toBe('not_confirmed');
    expect(computeAlerts({ status: 'sent', due_date: null, status_at: new Date(now - 1 * h) }, DEFAULT_SETTINGS, now)).toHaveLength(0);
    expect(computeAlerts({ status: 'production', due_date: '2020-01-01', status_at: new Date(now) }, DEFAULT_SETTINGS, now)[0]?.type).toBe('past_due');
  });
  it('reads factory replies', () => {
    expect(parseReply('OK 0311-k7q')).toEqual({ to: 'ack', code: '0311-K7Q' });
    expect(parseReply('ready 0311-K7Q')).toEqual({ to: 'ready', code: '0311-K7Q' });
    expect(parseReply('ok')).toEqual({ to: 'ack', code: undefined });
    expect(parseReply('hello')).toEqual({ to: undefined, code: undefined });
  });
});

describe('auth', () => {
  it('locks after 5 wrong PINs', async () => {
    await addUser('Locky', '919811111111', 'staff', '4321');
    for (let i = 0; i < 5; i++) expect((await request(app).post('/auth/login').send({ phone: '9811111111', pin: '0000' })).status).toBe(401);
    const r = await request(app).post('/auth/login').send({ phone: '9811111111', pin: '4321' });
    expect(r.status).toBe(429);
  });
  it('rejects requests without a login', async () => {
    expect((await request(app).get('/orders')).status).toBe(401);
  });
  it('resetting a PIN logs the person out everywhere', async () => {
    const r = await request(app).post('/users').set(auth('owner')).send({ name: 'Temp', phone: '9822222222', role: 'staff', pin: '1111' });
    expect(r.status).toBe(201);
    await loginAs('temp', '9822222222', '1111');
    await request(app).patch(`/users/${r.body.user.id}`).set(auth('owner')).send({ pin: '2222' }).expect(200);
    expect((await request(app).get('/me').set(auth('temp'))).status).toBe(401);
  });
  it('only the owner manages the team', async () => {
    expect((await request(app).get('/users').set(auth('staff'))).status).toBe(403);
  });
});

describe('items keep their exact names', () => {
  it('finds "T R 216" for "tr216" and returns the name untouched', async () => {
    const r = await request(app).get('/items').query({ q: 'tr216' }).set(auth('staff'));
    expect(r.body.items.map((i: any) => i.name)).toContain('T R 216');
  });
  it('keeps the misspelling', async () => {
    const r = await request(app).get('/items').query({ q: '10/14 ovel kun' }).set(auth('staff'));
    expect(r.body.items[0]).toMatchObject({ name: '10/14 Ovel Kun Plastic Beads', unit: 'Gross' });
  });
});

describe('order lifecycle', () => {
  let id = '';
  let code = '';
  it('staff takes an order', async () => {
    const items = (await request(app).get('/items').query({ q: '1001' }).set(auth('staff'))).body.items;
    const r = await request(app)
      .post('/orders')
      .set(auth('staff'))
      .send({ customerName: 'Laxmi Bangles', customerPhone: '9876543210', dueDate: '2030-01-10', items: [{ itemId: items[0].id, qty: 12 }, { name: 'Gold thread', qty: 3 }] });
    expect(r.status).toBe(201);
    id = r.body.order.id;
    code = r.body.order.code;
    expect(code).toMatch(/^\d{4}-[A-Z0-9]{3}$/);
    expect(r.body.order.items[0]).toMatchObject({ name: '1001 Plastic Beads', unit: 'Gross', qty: 12 });
    expect(r.body.order.customer_phone).toBe('919876543210');
  });
  it('factory cannot see an order that was never sent', async () => {
    expect((await request(app).get(`/orders/${id}`).set(auth('factory'))).status).toBe(404);
  });
  it('factory cannot take orders', async () => {
    expect((await request(app).post('/orders').set(auth('factory')).send({ customerName: 'x', items: [{ name: 'a', qty: 1 }] })).status).toBe(403);
  });
  it('staff sends it (no Cloud API -> link mode)', async () => {
    const r = await request(app).post(`/orders/${id}/send`).set(auth('staff')).send({ method: 'whatsapp' });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('link');
    expect(r.body.url).toContain('https://wa.me/919800000002?text=');
    expect(decodeURIComponent(r.body.url)).toContain('1001 Plastic Beads — 12 Gross');
    expect(r.body.order.status).toBe('sent');
  });
  it('staff cannot fake the factory confirmation', async () => {
    const r = await request(app).post(`/orders/${id}/status`).set(auth('staff')).send({ to: 'ack' });
    expect(r.status).toBe(409);
  });
  it('factory sees it without the customer phone', async () => {
    const r = await request(app).get('/orders').set(auth('factory'));
    const o = r.body.orders.find((x: any) => x.id === id);
    expect(o.customer_phone).toBe('');
  });
  it('factory confirms by WhatsApp reply from its own number', async () => {
    await processWebhook(waMsg('919800000002', { text: `ok ${code.toLowerCase()}` }));
    const o = (await request(app).get(`/orders/${id}`).set(auth('owner'))).body.order;
    expect(o.status).toBe('ack');
    const ev = o.events.find((e: any) => e.status === 'ack');
    expect(ev).toMatchObject({ via: 'whatsapp_reply', actor: 'Factory Raju', actorRole: 'factory' });
  });
  it('a reply from an unknown number changes nothing', async () => {
    await processWebhook(waMsg('919999999999', { text: `READY ${code}` }));
    const o = (await request(app).get(`/orders/${id}`).set(auth('owner'))).body.order;
    expect(o.status).toBe('ack');
  });
  it('factory jumps straight to ready in the app; skipped stage is recorded', async () => {
    const r = await request(app).post(`/orders/${id}/status`).set(auth('factory')).send({ to: 'ready' });
    expect(r.body.order.status).toBe('ready');
    expect(r.body.order.events.map((e: any) => e.status)).toEqual(['created', 'sent', 'ack', 'production', 'ready']);
  });
  it('factory cannot tell the customer or deliver', async () => {
    expect((await request(app).post(`/orders/${id}/notify`).set(auth('factory')).send({ method: 'phone' })).status).toBe(403);
    expect((await request(app).post(`/orders/${id}/status`).set(auth('factory')).send({ to: 'delivered' })).status).toBe(409);
  });
  it('staff tells the customer, then delivers', async () => {
    const n = await request(app).post(`/orders/${id}/notify`).set(auth('staff')).send({ method: 'whatsapp' });
    expect(n.body.mode).toBe('link');
    expect(n.body.url).toContain('https://wa.me/919876543210');
    const d = await request(app).post(`/orders/${id}/status`).set(auth('staff')).send({ to: 'delivered' });
    expect(d.body.order.status).toBe('delivered');
  });
  it('button tap ACK:<id> confirms a second order', async () => {
    const r = await request(app).post('/orders').set(auth('staff')).send({ customerName: 'Om Sai', items: [{ name: 'X', qty: 1 }] });
    await request(app).post(`/orders/${r.body.order.id}/send`).set(auth('staff')).send({ method: 'phone' }).expect(200);
    await processWebhook(waMsg('919800000002', { payload: `ACK:${r.body.order.id}` }));
    const o = (await request(app).get(`/orders/${r.body.order.id}`).set(auth('owner'))).body.order;
    expect(o.status).toBe('ack');
    expect(o.events.find((e: any) => e.status === 'sent').via).toBe('phone');
  });
  it('owner dashboard and search', async () => {
    const d = await request(app).get('/dashboard').set(auth('owner'));
    expect(d.status).toBe(200);
    expect(d.body.counts.open).toBe(1);
    expect(d.body.staff[0]).toMatchObject({ name: 'Ramesh', taken: 2 });
    const s = await request(app).get('/orders').query({ scope: 'all', q: '1001 plastic' }).set(auth('owner'));
    expect(s.body.orders).toHaveLength(1);
    expect((await request(app).get('/dashboard').set(auth('staff'))).status).toBe(403);
  });
  it('validates input with readable errors', async () => {
    const r = await request(app).post('/orders').set(auth('staff')).send({ customerName: '', items: [] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Customer name is required/);
  });
});

describe('webhook endpoint', () => {
  it('verifies with Meta', async () => {
    const r = await request(app).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' });
    expect(r.text).toBe('42');
    expect((await request(app).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope' })).status).toBe(403);
  });
  it('accepts a POST and records delivery receipts', async () => {
    await q(`insert into wa_messages(direction, wa_message_id, phone, kind, status) values ('out', 'wamid.X1', '919800000002', 'factory_order', 'sent')`);
    const r = await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X1', status: 'read' }] } }] }] }));
    expect(r.status).toBe(200);
    expect((await q(`select status from wa_messages where wa_message_id = 'wamid.X1'`))[0].status).toBe('read');
  });
});

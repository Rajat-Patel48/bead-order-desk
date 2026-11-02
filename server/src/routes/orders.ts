import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { q } from '../db.js';
import { waEnabled } from '../env.js';
import { HttpError, normPhone, wrap } from '../http.js';
import { createOrder, getOrder, listOrders, transition, type OrderView } from '../orders.js';
import { getSettings } from '../settings.js';
import { ALL_STATUSES, type Status } from '../status.js';
import { customerText, factoryText, sendCustomerReady, sendFactoryOrder, waLink } from '../whatsapp.js';

export const orders = Router();

/** Factory workers don't need customers' phone numbers. */
function forRole(o: OrderView, role: string): OrderView {
  return role === 'factory' ? { ...o, customer_phone: '' } : o;
}

orders.get(
  '/',
  wrap(async (req, res) => {
    const scope = z.enum(['open', 'done', 'all']).catch('open').parse(req.query.scope);
    const search = typeof req.query.q === 'string' ? req.query.q : undefined;
    const role = req.user!.role;
    const list = await listOrders({ scope: role === 'factory' ? 'factory' : scope, search });
    res.json({ orders: list.map((o) => forRole(o, role)), whatsappApi: waEnabled() });
  }),
);

orders.get(
  '/:id',
  wrap(async (req, res) => {
    const o = await getOrder(req.params.id);
    if (req.user!.role === 'factory' && o.status === 'created') throw new HttpError(404, 'Order not found.');
    res.json({ order: forRole(o, req.user!.role) });
  }),
);

const createSchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  customerPhone: z.string().max(20).optional().default(''),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional()
    .transform((v) => v || null),
  note: z.string().max(1000).optional().default(''),
  items: z
    .array(z.object({ itemId: z.number().int().positive().optional(), name: z.string().max(200).optional(), qty: z.number().positive('Quantity must be more than 0').max(1e7) }))
    .min(1, 'Add at least one item')
    .max(100),
});

orders.post(
  '/',
  requireRole('owner', 'staff'),
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    const o = await createOrder({ ...body, customerPhone: normPhone(body.customerPhone) }, req.user!);
    res.status(201).json({ order: o });
  }),
);

orders.post(
  '/:id/status',
  wrap(async (req, res) => {
    const { to, via, detail } = z
      .object({ to: z.enum(ALL_STATUSES as [Status, ...Status[]]), via: z.enum(['app', 'phone', 'in_person']).default('app'), detail: z.string().max(300).optional() })
      .parse(req.body);
    const o = await transition(req.params.id, to, req.user!, via, detail);
    res.json({ order: forRole(o, req.user!.role) });
  }),
);

async function factoryPhones(): Promise<string[]> {
  const rows = await q<{ phone: string }>(`select phone from users where role = 'factory' and active order by created_at`);
  return rows.map((r) => r.phone);
}

/**
 * Send to factory.
 *  method=whatsapp + Cloud API configured -> server sends the template, order marked sent (proof: delivery receipts)
 *  method=whatsapp, no Cloud API          -> returns a wa.me link for the app to open, order marked sent via link
 *  method=phone                           -> staff says they called; recorded as such
 */
orders.post(
  '/:id/send',
  requireRole('owner', 'staff'),
  wrap(async (req, res) => {
    const { method } = z.object({ method: z.enum(['whatsapp', 'phone']) }).parse(req.body);
    const o = await getOrder(req.params.id);
    if (o.status !== 'created' && !(o.status === 'sent' && method === 'whatsapp'))
      throw new HttpError(409, 'This order has already been sent to the factory.');
    if (method === 'phone') return res.json({ mode: 'phone', order: await transition(o.id, 'sent', req.user!, 'phone') });

    const phones = await factoryPhones();
    if (waEnabled()) {
      if (!phones.length) throw new HttpError(400, 'Add a factory worker in Team first, so the app knows where to send orders.');
      for (const p of phones) await sendFactoryOrder(p, o);
      const order = o.status === 'created' ? await transition(o.id, 'sent', req.user!, 'whatsapp_api') : await getOrder(o.id);
      return res.json({ mode: 'api', order });
    }
    const url = waLink(phones[0] ?? '', factoryText(o));
    const order = o.status === 'created' ? await transition(o.id, 'sent', req.user!, 'whatsapp_link') : o;
    res.json({ mode: 'link', url, order });
  }),
);

orders.post(
  '/:id/notify',
  requireRole('owner', 'staff'),
  wrap(async (req, res) => {
    const { method } = z.object({ method: z.enum(['whatsapp', 'phone']) }).parse(req.body);
    const o = await getOrder(req.params.id);
    if (o.status !== 'ready') throw new HttpError(409, 'You can tell the customer once the factory marks the order ready.');
    if (method === 'phone') return res.json({ mode: 'phone', order: await transition(o.id, 'notified', req.user!, 'phone') });
    const s = await getSettings();
    if (waEnabled()) {
      if (!o.customer_phone) throw new HttpError(400, "This order has no customer WhatsApp number.");
      await sendCustomerReady(o.customer_phone, o, s.businessName);
      return res.json({ mode: 'api', order: await transition(o.id, 'notified', req.user!, 'whatsapp_api') });
    }
    const url = waLink(o.customer_phone, customerText(o, s.businessName));
    res.json({ mode: 'link', url, order: await transition(o.id, 'notified', req.user!, 'whatsapp_link') });
  }),
);

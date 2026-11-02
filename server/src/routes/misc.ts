import { Router } from 'express';
import { z } from 'zod';
import { hashPin, login, requireRole, validPin } from '../auth.js';
import { one, q } from '../db.js';
import { waEnabled } from '../env.js';
import { HttpError, normPhone, wrap } from '../http.js';
import { listOrders } from '../orders.js';
import { getSettings, saveSettings } from '../settings.js';
import { OPEN } from '../status.js';

/* ---------- auth ---------- */
export const authRoutes = Router();
authRoutes.post(
  '/login',
  wrap(async (req, res) => {
    const { phone, pin } = z.object({ phone: z.string().min(1, 'Enter your mobile number'), pin: z.string().min(1, 'Enter your PIN') }).parse(req.body);
    res.json(await login(phone, pin));
  }),
);

/* ---------- me ---------- */
export const meRoutes = Router();
meRoutes.get(
  '/',
  wrap(async (req, res) => {
    const s = await getSettings();
    res.json({ user: req.user, businessName: s.businessName, whatsappApi: waEnabled() });
  }),
);
meRoutes.put(
  '/push-token',
  wrap(async (req, res) => {
    const { token } = z.object({ token: z.string().max(200).nullable() }).parse(req.body);
    await q(`update users set push_token = $2 where id = $1`, [req.user!.id, token]);
    res.json({ ok: true });
  }),
);

/* ---------- items (exact names from the stock list) ---------- */
export const itemRoutes = Router();
itemRoutes.get(
  '/',
  wrap(async (req, res) => {
    const raw = String(req.query.q ?? '').trim();
    if (!raw) return res.json({ items: [] });
    // Match on letters/digits only so "tr216" finds "T R 216" and "TR 216"; names are returned untouched.
    const tokens = raw
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9/]/g, ''))
      .filter(Boolean)
      .slice(0, 6);
    if (!tokens.length) return res.json({ items: [] });
    const conds = tokens.map((_, i) => `regexp_replace(lower(name), '[^a-z0-9/]', '', 'g') like $${i + 1}`);
    const rows = await q(
      `select id, name, unit from items where active and ${conds.join(' and ')}
       order by (regexp_replace(lower(name), '[^a-z0-9/]', '', 'g') like $${tokens.length + 1}) desc, length(name), name limit 40`,
      [...tokens.map((t) => `%${t}%`), `${tokens[0]}%`],
    );
    res.json({ items: rows });
  }),
);

/* ---------- settings ---------- */
export const settingsRoutes = Router();
const settingsSchema = z.object({
  businessName: z.string().trim().max(80),
  sendHours: z.number().min(0.25).max(240),
  ackHours: z.number().min(0.25).max(240),
  notifyHours: z.number().min(0.25).max(240),
  autoNotifyCustomer: z.boolean(),
});
settingsRoutes.get(
  '/',
  wrap(async (_req, res) => res.json({ settings: await getSettings(), whatsappApi: waEnabled() })),
);
settingsRoutes.put(
  '/',
  requireRole('owner'),
  wrap(async (req, res) => res.json({ settings: await saveSettings(settingsSchema.parse(req.body)) })),
);

/* ---------- team (owner only) ---------- */
export const userRoutes = Router();
userRoutes.use(requireRole('owner'));
userRoutes.get(
  '/',
  wrap(async (_req, res) => {
    res.json({ users: await q(`select id, name, phone, role, active, (push_token is not null) as has_push, created_at from users order by role, name`) });
  }),
);
const pinField = z.string().refine(validPin, 'PIN must be 4 to 6 digits');
userRoutes.post(
  '/',
  wrap(async (req, res) => {
    const b = z
      .object({ name: z.string().trim().min(1).max(80), phone: z.string().min(10), role: z.enum(['owner', 'staff', 'factory']), pin: pinField })
      .parse(req.body);
    const phone = normPhone(b.phone);
    if (phone.length < 11) throw new HttpError(400, 'Enter a full mobile number.');
    if (await one(`select 1 from users where phone = $1`, [phone])) throw new HttpError(409, 'Someone with this mobile number already exists.');
    const u = await one(
      `insert into users(name, phone, role, pin_hash) values ($1, $2, $3, $4) returning id, name, phone, role, active`,
      [b.name, phone, b.role, await hashPin(b.pin)],
    );
    res.status(201).json({ user: u });
  }),
);
userRoutes.patch(
  '/:id',
  wrap(async (req, res) => {
    const b = z
      .object({ name: z.string().trim().min(1).max(80).optional(), role: z.enum(['owner', 'staff', 'factory']).optional(), active: z.boolean().optional(), pin: pinField.optional() })
      .parse(req.body);
    if (req.params.id === req.user!.id && (b.active === false || (b.role && b.role !== 'owner')))
      throw new HttpError(400, "You can't deactivate yourself or remove your own owner access.");
    const u = await one(`select * from users where id = $1`, [req.params.id]);
    if (!u) throw new HttpError(404, 'User not found.');
    const revoke = b.pin !== undefined || b.active === false || (b.role && b.role !== u.role);
    const updated = await one(
      `update users set name = coalesce($2, name), role = coalesce($3, role), active = coalesce($4, active),
         pin_hash = coalesce($5, pin_hash), token_version = token_version + $6, failed_attempts = 0, locked_until = null
       where id = $1 returning id, name, phone, role, active`,
      [u.id, b.name ?? null, b.role ?? null, b.active ?? null, b.pin ? await hashPin(b.pin) : null, revoke ? 1 : 0],
    );
    res.json({ user: updated });
  }),
);

/* ---------- owner dashboard ---------- */
export const dashboardRoutes = Router();
dashboardRoutes.get(
  '/',
  requireRole('owner'),
  wrap(async (_req, res) => {
    const all = await listOrders({ scope: 'all', limit: 500 });
    const now = Date.now();
    const open = all.filter((o) => OPEN.includes(o.status));
    const recent = all.filter((o) => now - new Date(o.created_at).getTime() < 30 * 86400e3);
    const at = (o: (typeof all)[number], s: string) => {
      const e = [...o.events].reverse().find((x) => x.status === s);
      return e ? new Date(e.at).getTime() : null;
    };
    const span = (o: (typeof all)[number], a: string, b: string) => {
      const x = at(o, a);
      const y = at(o, b);
      return x != null && y != null && y >= x ? y - x : null;
    };
    const steps = [
      { label: 'Taken → sent to factory', from: 'created', to: 'sent', owner: 'staff' },
      { label: 'Sent → factory confirmed', from: 'sent', to: 'ack', owner: 'factory' },
      { label: 'Confirmed → ready', from: 'ack', to: 'ready', owner: 'factory' },
      { label: 'Ready → customer told', from: 'ready', to: 'notified', owner: 'staff' },
    ].map((s) => {
      const v = recent.map((o) => span(o, s.from, s.to)).filter((x): x is number => x != null);
      return { ...s, count: v.length, avgMs: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, maxMs: v.length ? Math.max(...v) : null };
    });
    const staff = new Map<string, { name: string; taken: number; sendMs: number[]; notSent: number; late: number }>();
    for (const o of recent) {
      const k = o.created_by ?? '?';
      const row = staff.get(k) ?? { name: o.created_by_name ?? 'Unknown', taken: 0, sendMs: [], notSent: 0, late: 0 };
      row.taken++;
      const s = span(o, 'created', 'sent');
      if (s != null) row.sendMs.push(s);
      if (o.status === 'created') {
        row.notSent++;
        if (o.alerts.length) row.late++;
      }
      staff.set(k, row);
    }
    res.json({
      counts: {
        open: open.length,
        notSent: open.filter((o) => o.status === 'created').length,
        unconfirmed: open.filter((o) => o.status === 'sent').length,
        atFactory: open.filter((o) => ['ack', 'production'].includes(o.status)).length,
        readyNotTold: open.filter((o) => o.status === 'ready').length,
        attention: open.filter((o) => o.alerts.length).length,
      },
      steps,
      staff: [...staff.values()].map((s) => ({
        name: s.name,
        taken: s.taken,
        avgSendMs: s.sendMs.length ? s.sendMs.reduce((a, b) => a + b, 0) / s.sendMs.length : null,
        notSent: s.notSent,
        late: s.late,
      })),
    });
  }),
);

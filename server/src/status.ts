export type Role = 'owner' | 'staff' | 'factory';
export const STAGES = ['created', 'sent', 'ack', 'production', 'ready', 'notified', 'delivered'] as const;
export type Stage = (typeof STAGES)[number];
export type Status = Stage | 'cancelled';
export const ALL_STATUSES: Status[] = [...STAGES, 'cancelled'];
export const OPEN: Status[] = ['created', 'sent', 'ack', 'production', 'ready', 'notified'];

export const LABEL: Record<Status, string> = {
  created: 'Not sent to factory',
  sent: 'Sent to factory',
  ack: 'Factory confirmed',
  production: 'In production',
  ready: 'Ready',
  notified: 'Customer informed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const idx = (s: Status) => STAGES.indexOf(s as Stage);

/**
 * Who may move an order from one status to another.
 * Staff can never confirm on the factory's behalf; the factory can never mark an order delivered.
 */
export function canTransition(role: Role | 'system', from: Status, to: Status): boolean {
  if (from === to || from === 'delivered' || from === 'cancelled') return false;
  if (role === 'system') return to === 'cancelled' || idx(to) > idx(from);
  if (role === 'owner') return to === 'cancelled' || idx(to) > idx(from);
  if (role === 'staff') {
    if (to === 'cancelled') return ['created', 'sent', 'ack', 'production', 'ready'].includes(from);
    return (from === 'created' && to === 'sent') || (from === 'ready' && (to === 'notified' || to === 'delivered')) || (from === 'notified' && to === 'delivered');
  }
  if (role === 'factory') {
    const f = idx(from);
    const t = idx(to);
    return f >= idx('sent') && f < idx('ready') && t > f && t <= idx('ready');
  }
  return false;
}

/** Stages skipped by a jump, e.g. sent -> ready also records ack and production. */
export function skippedStages(from: Status, to: Status): Stage[] {
  if (to === 'cancelled') return [];
  return STAGES.slice(idx(from) + 1, idx(to)) as Stage[];
}

export interface Settings {
  businessName: string;
  sendHours: number;
  ackHours: number;
  notifyHours: number;
  autoNotifyCustomer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  businessName: '',
  sendHours: 2,
  ackHours: 4,
  notifyHours: 2,
  autoNotifyCustomer: true,
};

export interface Alert {
  type: 'not_sent' | 'not_confirmed' | 'past_due' | 'customer_not_told';
  level: 'warn' | 'crit';
  text: string;
  /** whose job it is to fix it */
  owner: 'staff' | 'factory';
}

const H = 3600e3;

export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export function computeAlerts(
  o: { status: Status; due_date: string | null; status_at: string | Date },
  s: Settings,
  now = Date.now(),
): Alert[] {
  const out: Alert[] = [];
  const age = now - new Date(o.status_at).getTime();
  if (o.status === 'created' && age > s.sendHours * H)
    out.push({ type: 'not_sent', level: 'warn', owner: 'staff', text: `Not sent to factory for ${fmtDur(age)}` });
  if (o.status === 'sent' && age > s.ackHours * H)
    out.push({ type: 'not_confirmed', level: 'crit', owner: 'factory', text: `Factory hasn't confirmed in ${fmtDur(age)}` });
  if (['created', 'sent', 'ack', 'production'].includes(o.status) && o.due_date) {
    const end = new Date(`${o.due_date}T23:59:59+05:30`).getTime();
    if (end < now)
      out.push({ type: 'past_due', level: 'crit', owner: o.status === 'created' ? 'staff' : 'factory', text: `Past due date (${o.due_date})` });
  }
  if (o.status === 'ready' && age > s.notifyHours * H)
    out.push({ type: 'customer_not_told', level: 'warn', owner: 'staff', text: `Ready ${fmtDur(age)} ago, customer not told` });
  return out;
}

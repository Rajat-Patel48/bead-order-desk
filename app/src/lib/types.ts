export type Role = 'owner' | 'staff' | 'factory';
export type Status = 'created' | 'sent' | 'ack' | 'production' | 'ready' | 'notified' | 'delivered' | 'cancelled';

export const STAGES: Status[] = ['created', 'sent', 'ack', 'production', 'ready', 'notified', 'delivered'];
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

export const VIA_LABEL: Record<string, string> = {
  app: 'in the app',
  phone: 'by phone call',
  in_person: 'in person',
  whatsapp_api: 'WhatsApp (sent by the app)',
  whatsapp_link: 'WhatsApp',
  whatsapp_reply: 'WhatsApp reply',
};

export interface User {
  id: string;
  name: string;
  phone: string;
  role: Role;
}

export interface Alert {
  type: string;
  level: 'warn' | 'crit';
  text: string;
  owner: 'staff' | 'factory';
}

export interface OrderEvent {
  status: Status;
  at: string;
  via: string;
  detail: string | null;
  actor: string | null;
  actorRole: Role | null;
}

export interface Order {
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

export interface Item {
  id: number;
  name: string;
  unit: string;
}

export interface Settings {
  businessName: string;
  sendHours: number;
  ackHours: number;
  notifyHours: number;
  autoNotifyCustomer: boolean;
}

export interface TeamMember extends User {
  active: boolean;
  has_push: boolean;
}

export interface Dashboard {
  counts: { open: number; notSent: number; unconfirmed: number; atFactory: number; readyNotTold: number; attention: number };
  steps: { label: string; owner: string; count: number; avgMs: number | null; maxMs: number | null }[];
  staff: { name: string; taken: number; avgSendMs: number | null; notSent: number; late: number }[];
}

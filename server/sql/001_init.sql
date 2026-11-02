create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,          -- digits with country code, e.g. 919800000001
  pin_hash text not null,
  role text not null check (role in ('owner', 'staff', 'factory')),
  active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  token_version int not null default 0,
  push_token text,
  created_at timestamptz not null default now()
);

-- Item names are stored exactly as staff write them in the stock list. Never "clean" them.
create table items (
  id serial primary key,
  name text not null unique,
  unit text not null,
  active boolean not null default true
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_name text not null,
  customer_phone text not null default '',
  due_date date,
  note text not null default '',
  status text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_idx on orders(status);
create index orders_created_idx on orders(created_at desc);

create table order_items (
  id serial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  item_id int references items(id),
  name text not null,
  unit text not null,
  qty numeric not null check (qty > 0)
);
create index order_items_order_idx on order_items(order_id);

-- Every status change: who did it, when, and how (app, phone call, WhatsApp reply...)
create table order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  actor_id uuid references users(id),
  via text not null default 'app',
  detail text,
  at timestamptz not null default now()
);
create index order_events_order_idx on order_events(order_id, at);

create table settings (
  key text primary key,
  value jsonb not null
);

create table wa_messages (
  id bigserial primary key,
  direction text not null check (direction in ('out', 'in')),
  wa_message_id text unique,
  phone text not null,
  order_id uuid references orders(id) on delete set null,
  kind text,
  body text,
  status text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wa_messages_order_idx on wa_messages(order_id);

create table alert_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

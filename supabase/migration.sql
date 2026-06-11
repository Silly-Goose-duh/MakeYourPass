-- ============================================
-- MakeYourPass — Database Schema
-- Run this in Supabase SQL Editor (Ctrl+Enter)
-- ============================================

-- 0. Extensions
create extension if not exists "pgcrypto";

-- 1. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Organization Members
create table if not exists org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  invited_email text,
  status text not null check (status in ('active', 'invited', 'declined')) default 'invited',
  created_at timestamptz not null default now()
);

-- 3. Events
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text not null default '',
  short_description text,
  cover_image_url text,
  venue_name text,
  venue_address text,
  city text,
  state text,
  start_date date not null,
  end_date date not null,
  start_time text not null,
  end_time text not null,
  timezone text not null default 'Asia/Kolkata',
  category text not null check (category in ('conference', 'workshop', 'meetup', 'festival', 'concert', 'sports', 'networking', 'college_fest', 'webinar', 'other')) default 'other',
  status text not null check (status in ('draft', 'published', 'cancelled', 'completed', 'archived')) default 'draft',
  visibility text not null check (visibility in ('public', 'private', 'unlisted')) default 'public',
  max_attendees int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Ticket Types
create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  description text,
  price int not null default 0,
  currency text not null default 'INR',
  quantity int not null default 0,
  quantity_sold int not null default 0,
  max_per_order int not null default 5,
  sales_start timestamptz,
  sales_end timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 5. Orders
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete restrict,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  quantity int not null default 1,
  total_amount int not null,
  currency text not null default 'INR',
  status text not null check (status in ('pending', 'confirmed', 'cancelled', 'refunded')) default 'pending',
  payment_method text not null check (payment_method in ('razorpay', 'slice', 'free')) default 'free',
  payment_id text,
  promo_code text,
  discount_amount int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Tickets (issued)
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete restrict,
  attendee_name text,
  attendee_email text,
  attendee_phone text,
  qr_code text not null,
  qr_code_url text not null,
  status text not null check (status in ('active', 'used', 'cancelled', 'refunded')) default 'active',
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 7. Check-ins
create table if not exists check_ins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  checked_in_by uuid not null references auth.users(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('scan', 'manual')) default 'scan',
  notes text
);

-- 8. Coupons / Promo Codes
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value int not null,
  max_uses int,
  current_uses int not null default 0,
  min_order_amount int,
  max_discount_amount int,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(event_id, code)
);

-- 9. Notification Templates
create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('email', 'whatsapp')),
  trigger text not null check (trigger in ('registration', 'check_in', 'reminder', 'cancellation')),
  subject text,
  body text not null,
  is_active boolean not null default true
);

-- 10. Integrations (Payment Gateways)
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'slice', 'stripe')),
  api_key text,
  webhook_secret text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================
-- Indexes for performance
-- ============================================
create index idx_events_org_id on events(org_id);
create index idx_events_slug on events(slug);
create index idx_events_status on events(status);
create index idx_ticket_types_event_id on ticket_types(event_id);
create index idx_orders_event_id on orders(event_id);
create index idx_orders_buyer_email on orders(buyer_email);
create index idx_tickets_event_id on tickets(event_id);
create index idx_tickets_order_id on tickets(order_id);
create index idx_tickets_qr_code on tickets(qr_code);
create index idx_tickets_status on tickets(status);
create index idx_check_ins_event_id on check_ins(event_id);
create index idx_coupons_event_id on coupons(event_id);
create index idx_org_members_org_id on org_members(org_id);
create index idx_org_members_user_id on org_members(user_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table events enable row level security;
alter table ticket_types enable row level security;
alter table orders enable row level security;
alter table tickets enable row level security;
alter table check_ins enable row level security;
alter table coupons enable row level security;
alter table notification_templates enable row level security;
alter table integrations enable row level security;

-- Organizations: owner has full access
create policy "Users can view their own organizations"
  on organizations for select
  using (owner_id = auth.uid());

create policy "Users can insert their own organizations"
  on organizations for insert
  with check (owner_id = auth.uid());

create policy "Users can update their own organizations"
  on organizations for update
  using (owner_id = auth.uid());

-- Events: org members can view, owner can manage
create policy "Anyone can view published events"
  on events for select
  using (status = 'published' or org_id in (
    select org_id from org_members where user_id = auth.uid()
  ));

create policy "Org members can create events"
  on events for insert
  with check (org_id in (
    select org_id from org_members where user_id = auth.uid() and status = 'active'
  ));

create policy "Org members can update events"
  on events for update
  using (org_id in (
    select org_id from org_members where user_id = auth.uid() and status = 'active'
  ));

-- Ticket Types: public for published events
create policy "Anyone can view ticket types for published events"
  on ticket_types for select
  using (event_id in (
    select id from events where status = 'published'
  ) or event_id in (
    select id from events where org_id in (
      select org_id from org_members where user_id = auth.uid()
    )
  ));

-- Orders: buyer can view own, org can view all
create policy "Users can view their own orders"
  on orders for select
  using (buyer_email = (select email from auth.users where id = auth.uid()) or event_id in (
    select id from events where org_id in (
      select org_id from org_members where user_id = auth.uid()
    )
  ));

create policy "Anyone can insert orders"
  on orders for insert
  with check (true);

-- Tickets: buyer can view own, org can view all
create policy "Users can view their own tickets"
  on tickets for select
  using (order_id in (
    select id from orders where buyer_email = (select email from auth.users where id = auth.uid())
  ) or event_id in (
    select id from events where org_id in (
      select org_id from org_members where user_id = auth.uid()
    )
  ));

create policy "Tickets can be created from orders"
  on tickets for insert
  with check (true);

-- ============================================
-- Auto-update updated_at trigger
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_organizations_updated_at
  before update on organizations for each row execute function update_updated_at();

create trigger update_events_updated_at
  before update on events for each row execute function update_updated_at();

create trigger update_orders_updated_at
  before update on orders for each row execute function update_updated_at();

-- ============================================
-- MAKEYOURPASS — SUPER FIX
-- Run ENTIRE script in Supabase SQL Editor
-- (select all, Ctrl+Enter)
-- This is IDEMPOTENT — safe to run multiple times
-- ============================================

-- ============================================
-- PART 1: RLS policies
-- ============================================

-- Safe drop + recreate for events INSERT policy
drop policy if exists "Org members can create events" on events;

create policy "Org members can create events"
  on events for insert
  with check (
    -- User is an active member of the org
    (org_id in (
      select org_id from org_members where user_id = auth.uid() and status = 'active'
    ))
    or
    -- OR user owns the org directly
    (org_id in (
      select id from organizations where owner_id = auth.uid()
    ))
  );

-- Ensure org_members INSERT policy exists
drop policy if exists "Org creators can add themselves as members" on org_members;

create policy "Org creators can add themselves as members"
  on org_members for insert
  with check (user_id = auth.uid() and role = 'owner');

-- ============================================
-- PART 2: RPC — ensure org membership exists
-- Called by frontend fallback path when the
-- big RPC doesn't exist yet.
-- ============================================

drop function if exists ensure_org_member;

create or replace function ensure_org_member(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  insert into org_members (org_id, user_id, role, status)
  values (p_org_id, v_user_id, 'owner', 'active')
  on conflict do nothing;

  return jsonb_build_object('success', true);
end;
$$;

-- ============================================
-- PART 3: RPC — create event + ticket type
-- Called by frontend as the primary path.
-- Handles org lookup/creation, membership,
-- event insert, and ticket type insert in one
-- transaction.
-- ============================================

drop function if exists create_event_with_ticket_type;

create or replace function create_event_with_ticket_type(
  p_title text,
  p_slug text,
  p_description text,
  p_short_description text,
  p_venue_name text,
  p_venue_address text,
  p_city text,
  p_state text,
  p_start_date date,
  p_end_date date,
  p_start_time text,
  p_end_time text,
  p_category text,
  p_visibility text,
  p_max_attendees int,
  p_use_external_form boolean,
  p_form_link text,
  p_ticket_name text,
  p_ticket_price int,
  p_ticket_quantity int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_event_id uuid;
  v_event record;
  v_ticket_type record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  -- Find or create organization
  select id into v_org_id
  from organizations
  where owner_id = v_user_id
  limit 1;

  if v_org_id is null then
    insert into organizations (name, slug, owner_id)
    values (
      coalesce(
        (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id),
        'My'
      ) || ' Organization',
      coalesce(
        regexp_replace(
          lower(
            coalesce(
              (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id),
              'user'
            )
          ),
          '[^a-z0-9]+', '-', 'g'
        ),
        'user'
      ) || '-' || substr(md5(random()::text), 1, 6),
      v_user_id
    )
    returning id into v_org_id;
  end if;

  -- Ensure org_members row exists (idempotent)
  insert into org_members (org_id, user_id, role, status)
  values (v_org_id, v_user_id, 'owner', 'active')
  on conflict do nothing;

  -- Create the event
  insert into events (
    org_id, title, slug, description, short_description,
    venue_name, venue_address, city, state,
    start_date, end_date, start_time, end_time,
    category, visibility, max_attendees,
    use_external_form, form_link, status
  ) values (
    v_org_id, p_title, p_slug, p_description, p_short_description,
    p_venue_name, p_venue_address, p_city, p_state,
    p_start_date, p_end_date, p_start_time, p_end_time,
    p_category, p_visibility, p_max_attendees,
    p_use_external_form, p_form_link, 'published'
  )
  returning * into v_event;

  v_event_id := v_event.id;

  -- Create the ticket type
  insert into ticket_types (
    event_id, name, price, quantity,
    max_per_order, is_active, sort_order
  ) values (
    v_event_id, p_ticket_name, p_ticket_price, p_ticket_quantity,
    5, true, 0
  )
  returning * into v_ticket_type;

  return jsonb_build_object(
    'event_id', v_event_id,
    'org_id', v_org_id,
    'ticket_type_id', v_ticket_type.id
  );
end;
$$;

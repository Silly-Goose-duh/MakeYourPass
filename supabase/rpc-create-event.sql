-- ============================================
-- Create a SECURITY DEFINER function that
-- bypasses RLS for event + ticket type creation.
-- The function handles org lookup/creation,
-- org_members sync, event insert, and ticket
-- type insert in a single transaction.
-- Run this in Supabase SQL Editor.
-- ============================================

drop function if exists create_event_with_ticket_type;

create or replace function create_event_with_ticket_type(
  p_title text,
  p_slug text,
  p_description text default '',
  p_short_description text default null,
  p_venue_name text default null,
  p_venue_address text default null,
  p_city text default null,
  p_state text default null,
  p_start_date date,
  p_end_date date,
  p_start_time text,
  p_end_time text,
  p_category text default 'other',
  p_visibility text default 'public',
  p_max_attendees int default null,
  p_use_external_form boolean default false,
  p_form_link text default null,
  p_ticket_name text default 'General Admission',
  p_ticket_price int default 0,
  p_ticket_quantity int default 0
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
  -- Get the calling user
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
    -- Create new org
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

  -- Ensure org_members row exists with active status
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

  -- Return the result
  return jsonb_build_object(
    'event_id', v_event_id,
    'org_id', v_org_id,
    'ticket_type_id', v_ticket_type.id
  );
end;
$$;

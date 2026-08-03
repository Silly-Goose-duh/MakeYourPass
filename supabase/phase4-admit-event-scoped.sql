-- Phase4 (event-scoped) — scan-to-admit RPC
-- Prevents a host from admitting a ticket belonging to a DIFFERENT event.
-- Run in Supabase SQL Editor. Idempotent (create or replace).

create or replace function admit_registration(p_qr_token uuid, p_event_id uuid default null)
returns table(name text, unique_code text, already_admitted boolean, status text)
language plpgsql
security definer
as $$
declare
  r record;
begin
  select er.id, er.respondent_name, er.unique_code, er.admitted_at, er.status, er.event_id
  into r
  from event_responses er
  where er.qr_token = p_qr_token;

  if r.id is null then
    return query select null::text, null::text, false, 'not_found';
    return;
  end if;

  -- Event scoping: if caller supplies an event id, the ticket must belong to it.
  if p_event_id is not null and r.event_id is distinct from p_event_id then
    return query select r.respondent_name, r.unique_code, false, 'wrong_event';
    return;
  end if;

  if r.status = 'waitlisted' then
    return query select r.respondent_name, r.unique_code, false, 'waitlisted';
    return;
  end if;

  if r.admitted_at is not null then
    return query select r.respondent_name, r.unique_code, true, 'already_admitted';
    return;
  end if;

  update event_responses
    set admitted_at = now(), admitted_by = auth.uid()
    where id = r.id;

  return query select r.respondent_name, r.unique_code, false, 'admitted';
end;
$$;

-- Flexible admit (token UUID OR human unique_code) with the same event scoping.
create or replace function admit_by_code_or_token(p_input text, p_event_id uuid default null)
returns table(name text, unique_code text, already_admitted boolean, status text)
language plpgsql
security definer
as $$
declare
  r record;
begin
  -- Try unique_code first
  select er.id, er.respondent_name, er.unique_code, er.admitted_at, er.status, er.event_id
  into r
  from event_responses er
  where er.unique_code = p_input;

  -- Fall back to qr_token
  if r.id is null then
    select er.id, er.respondent_name, er.unique_code, er.admitted_at, er.status, er.event_id
    into r
    from event_responses er
    where er.qr_token::text = p_input;
  end if;

  if r.id is null then
    return query select null::text, null::text, false, 'not_found';
    return;
  end if;

  if p_event_id is not null and r.event_id is distinct from p_event_id then
    return query select r.respondent_name, r.unique_code, false, 'wrong_event';
    return;
  end if;

  if r.status = 'waitlisted' then
    return query select r.respondent_name, r.unique_code, false, 'waitlisted';
    return;
  end if;

  if r.admitted_at is not null then
    return query select r.respondent_name, r.unique_code, true, 'already_admitted';
    return;
  end if;

  update event_responses
    set admitted_at = now(), admitted_by = auth.uid()
    where id = r.id;

  return query select r.respondent_name, r.unique_code, false, 'admitted';
end;
$$;

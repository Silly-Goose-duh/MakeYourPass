-- ============================================================================
--  Phase 4 — Scan-to-admit RPC (adapted to event_responses)
--  Run in Supabase → SQL Editor. Idempotent.
-- ============================================================================

create or replace function admit_registration(p_qr_token uuid)
returns table(name text, unique_code text, already_admitted boolean, status text)
language plpgsql
security definer
as $$
declare
  r record;
begin
  select id, respondent_name, unique_code, admitted_at, status
  into r
  from event_responses
  where qr_token = p_qr_token;

  if r.id is null then
    return query select null::text, null::text, false, 'not_found';
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

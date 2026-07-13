-- Phase 4 — Scan-to-admit RPC (FIXED: qualify columns to avoid ambiguous unique_code)
create or replace function admit_registration(p_qr_token uuid)
returns table(name text, unique_code text, already_admitted boolean, status text)
language plpgsql
security definer
as $$
declare
  r record;
begin
  select er.id, er.respondent_name, er.unique_code, er.admitted_at, er.status
  into r
  from event_responses er
  where er.qr_token = p_qr_token;

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

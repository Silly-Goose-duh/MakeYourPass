-- ============================================================================
-- Finish polish: reminder stamp + flexible admit by unique_code OR qr_token
-- Run in Supabase SQL Editor (or Management API). Idempotent.
-- ============================================================================

ALTER TABLE event_responses
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Flexible admit: accepts qr_token UUID string OR unique_code (e.g. EVT-0001)
CREATE OR REPLACE FUNCTION admit_by_code_or_token(p_input text)
RETURNS TABLE(name text, unique_code text, already_admitted boolean, status text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r record;
  v_token uuid;
BEGIN
  -- Try as UUID first
  BEGIN
    v_token := p_input::uuid;
  EXCEPTION WHEN others THEN
    v_token := NULL;
  END;

  IF v_token IS NOT NULL THEN
    SELECT er.id, er.respondent_name, er.unique_code, er.admitted_at, er.status
    INTO r
    FROM event_responses er
    WHERE er.qr_token = v_token;
  ELSE
    SELECT er.id, er.respondent_name, er.unique_code, er.admitted_at, er.status
    INTO r
    FROM event_responses er
    WHERE upper(er.unique_code) = upper(trim(p_input))
    LIMIT 1;
  END IF;

  IF r.id IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, false, 'not_found';
    RETURN;
  END IF;

  IF r.status = 'waitlisted' THEN
    RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'waitlisted';
    RETURN;
  END IF;

  IF r.admitted_at IS NOT NULL THEN
    RETURN QUERY SELECT r.respondent_name, r.unique_code, true, 'already_admitted';
    RETURN;
  END IF;

  UPDATE event_responses
    SET admitted_at = now(), admitted_by = auth.uid()
    WHERE id = r.id;

  RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'admitted';
END;
$$;

GRANT EXECUTE ON FUNCTION admit_by_code_or_token(text) TO anon, authenticated;

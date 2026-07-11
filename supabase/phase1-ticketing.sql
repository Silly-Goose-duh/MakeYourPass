-- ============================================================================
--  Phase 1 — Ticketing schema for MakeYourPass
--  Adapted from spec: uses event_responses (the live registration table) instead
--  of a separate `registrations` table, so existing dashboards + RPCs keep working.
--  Idempotent (safe to re-run). Run in Supabase → SQL Editor.
-- ============================================================================

-- ── events: prefix + counter (capacity already added in event-setup-fix) ──
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS id_prefix text,
  ADD COLUMN IF NOT EXISTS registration_counter integer NOT NULL DEFAULT 0;

-- ── event_responses: ticketing columns ──
ALTER TABLE event_responses
  ADD COLUMN IF NOT EXISTS unique_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS qr_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','waitlisted','cancelled')),
  ADD COLUMN IF NOT EXISTS admitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS admitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS ticket_url text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- One registration per email per event (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_response_event_email
  ON event_responses (event_id, lower(respondent_email));

-- ── Atomic, race-safe code assignment (BEFORE INSERT trigger) ──
CREATE OR REPLACE FUNCTION assign_response_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_n integer;
  prefix text;
  cap integer;
BEGIN
  SELECT id_prefix, capacity INTO prefix, cap FROM events WHERE id = NEW.event_id;

  UPDATE events
    SET registration_counter = registration_counter + 1
    WHERE id = NEW.event_id
    RETURNING registration_counter INTO next_n;

  prefix := COALESCE(NULLIF(btrim(prefix), ''), 'EVT');
  NEW.unique_code := prefix || '-' || lpad(next_n::text, 4, '0');

  -- capacity check AFTER incrementing so the counter is the source of truth
  IF cap IS NOT NULL AND cap > 0 AND next_n > cap THEN
    NEW.status := 'waitlisted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_response_code ON event_responses;
CREATE TRIGGER trg_assign_response_code
  BEFORE INSERT ON event_responses
  FOR EACH ROW EXECUTE FUNCTION assign_response_code();

-- ── Live seat status view (capacity aware) ──
CREATE OR REPLACE VIEW event_seat_status AS
SELECT
  e.id,
  e.capacity,
  count(r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed_count,
  CASE WHEN e.capacity IS NULL OR e.capacity = 0 THEN NULL
       ELSE greatest(e.capacity - count(r.id) FILTER (WHERE r.status = 'confirmed'), 0)
  END AS seats_left
FROM events e
LEFT JOIN event_responses r ON r.event_id = e.id
GROUP BY e.id, e.capacity;

-- ── Storage bucket for ticket PNGs ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('tickets', 'tickets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read of ticket images; authenticated write (service role bypasses anyway).
DROP POLICY IF EXISTS "Tickets are publicly readable" ON storage.objects;
CREATE POLICY "Tickets are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tickets');

DROP POLICY IF EXISTS "Tickets writable by authenticated" ON storage.objects;
CREATE POLICY "Tickets writable by authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tickets');

-- ============================================================================
--  Fix: event_responses / response_answers RLS + auto-seed per-event questions
--  Run ONCE in Supabase → SQL Editor. Idempotent (safe to re-run).
--
--  Problems this solves:
--   1. "new row violates row-level security policy for table event_responses"
--      -> the anon INSERT policy was never applied to the live DB. We (re)create
--         it so public form submissions work without auth.
--   2. Automate per-event setup: whenever an event is created, a default
--      "Email" question is auto-inserted into event_questions (SECURITY DEFINER,
--      so it bypasses RLS). This is the "separate setup per event, automated
--      at creation" behaviour — done as per-event ROWS (not literal per-event
--      tables, which is a Postgres anti-pattern; responses are already isolated
--      per event via event_id).
-- ============================================================================

-- ── 1. INSERT policies for responses (anon submissions) ──
DROP POLICY IF EXISTS "Anyone can submit a response" ON event_responses;
CREATE POLICY "Anyone can submit a response"
  ON event_responses FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can submit answers" ON response_answers;
CREATE POLICY "Anyone can submit answers"
  ON response_answers FOR INSERT
  WITH CHECK (true);

-- ── 2. Auto-seed default questions for every new event ──
CREATE OR REPLACE FUNCTION public.seed_event_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Default "Email" question so the public form always has at least one field.
  INSERT INTO public.event_questions (event_id, title, description, question_type, options, required, sort_order)
  VALUES (NEW.id, 'Email', 'Your email address', 'short_text', '[]', true, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_created ON public.events;
CREATE TRIGGER trg_event_created
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_event_defaults();

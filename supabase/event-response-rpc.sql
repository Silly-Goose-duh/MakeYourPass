-- ============================================================================
--  Bulletproof fix: SECURITY DEFINER RPCs for public event-response submission.
--  RLS on event_responses / response_answers is bypassed inside these functions,
--  so anonymous (anon) form submissions always succeed regardless of policy roles.
--  Run ONCE in Supabase → SQL Editor. Idempotent (CREATE OR REPLACE).
-- ============================================================================

-- Insert a response + return its id (anon-safe).
CREATE OR REPLACE FUNCTION public.submit_event_response(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.event_responses (event_id, respondent_name, respondent_email, respondent_phone)
  VALUES (p_event_id, p_name, p_email, p_phone)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Insert answer rows for a response (anon-safe).
CREATE OR REPLACE FUNCTION public.submit_response_answers(
  p_response_id uuid,
  p_answers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.response_answers (response_id, question_id, value)
  SELECT
    p_response_id,
    (a->>'question_id')::uuid,
    a->>'value'
  FROM jsonb_array_elements(p_answers) AS a;
END;
$$;

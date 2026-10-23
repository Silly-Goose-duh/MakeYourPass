-- ==========================================================================
-- 003 — attendee accounts, one-click registration, and seat cancellation
-- ==========================================================================
-- Additive migration. Existing anonymous registrations remain valid; all new
-- attendee registrations use auth.uid() and are linked to the attendee.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

-- Preserve the attendee phone collected before email confirmation. The
-- existing trigger creates profiles for new auth users, so extend it rather
-- than requiring a second profile write after the first login.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, is_superadmin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.event_responses
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (refund_status IN ('not_applicable', 'pending', 'completed', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_event_responses_user_event
  ON public.event_responses (user_id, event_id);

DROP INDEX IF EXISTS uniq_event_response_user_event;
CREATE UNIQUE INDEX uniq_event_response_user_event
  ON public.event_responses (user_id, event_id)
  WHERE user_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.event_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.event_responses(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected')),
  club_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_cancellation_request
  ON public.event_cancellation_requests (registration_id)
  WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_event_status
  ON public.event_cancellation_requests (event_id, status, requested_at);

ALTER TABLE public.event_cancellation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendees can create own cancellation requests"
  ON public.event_cancellation_requests;
CREATE POLICY "Attendees can create own cancellation requests"
  ON public.event_cancellation_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Attendees can read own cancellation requests"
  ON public.event_cancellation_requests;
CREATE POLICY "Attendees can read own cancellation requests"
  ON public.event_cancellation_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Staff access is deliberately provided through SECURITY DEFINER RPCs below;
-- there is no broad direct SELECT/UPDATE policy for club members.

DROP FUNCTION IF EXISTS public.get_my_event_registration(uuid);
CREATE FUNCTION public.get_my_event_registration(p_event_id uuid)
RETURNS SETOF public.event_responses
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT er.*
  FROM public.event_responses er
  WHERE er.event_id = p_event_id
    AND er.user_id = auth.uid()
  ORDER BY er.submitted_at DESC
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.get_my_cancellation_request(uuid);
CREATE FUNCTION public.get_my_cancellation_request(p_registration_id uuid)
RETURNS SETOF public.event_cancellation_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.*
  FROM public.event_cancellation_requests cr
  WHERE cr.registration_id = p_registration_id
    AND cr.user_id = auth.uid()
  ORDER BY cr.requested_at DESC
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.submit_authenticated_event_response(uuid, text, text, text, jsonb);
CREATE FUNCTION public.submit_authenticated_event_response(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text DEFAULT '',
  p_answers jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text := btrim(COALESCE(p_name, ''));
  v_phone text := btrim(COALESCE(p_phone, ''));
  v_registration uuid;
  v_event_price numeric;
  v_event_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to register';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_name !~ '^.{2,120}$' THEN
    RAISE EXCEPTION 'Name must be between 2 and 120 characters';
  END IF;
  IF v_phone <> '' AND v_phone !~ '^[0-9+() \-]{5,32}$' THEN
    RAISE EXCEPTION 'Invalid phone number';
  END IF;

  SELECT COALESCE(e.price, 0), e.status
    INTO v_event_price, v_event_status
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_event_status IS NULL OR v_event_status <> 'published' THEN
    RAISE EXCEPTION 'Event is not available for registration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_responses er
    WHERE er.event_id = p_event_id
      AND (er.user_id = v_user_id OR lower(er.respondent_email) = v_email)
      AND er.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'You are already registered for this event';
  END IF;

  -- Keep the profile current so future event forms can be one-click.
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (v_user_id, v_name, v_email, v_phone)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    updated_at = now();

  INSERT INTO public.event_responses (
    event_id, user_id, respondent_name, respondent_email, respondent_phone,
    payment_status
  )
  VALUES (
    p_event_id, v_user_id, v_name, v_email, v_phone,
    CASE WHEN v_event_price > 0 THEN 'pending' ELSE 'na' END
  )
  RETURNING id INTO v_registration;

  IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) = 'array' THEN
    IF jsonb_array_length(p_answers) > 100 THEN
      RAISE EXCEPTION 'Too many answers (max 100)';
    END IF;

    INSERT INTO public.response_answers (response_id, question_id, value)
    SELECT DISTINCT v_registration, (item->>'question_id')::uuid,
           left(COALESCE(item->>'value', ''), 1000)
    FROM jsonb_array_elements(p_answers) item
    WHERE (item->>'question_id') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.event_questions q
        WHERE q.id = (item->>'question_id')::uuid
          AND q.event_id = p_event_id
      );
  ELSIF p_answers IS NOT NULL THEN
    RAISE EXCEPTION 'Answers must be a JSON array';
  END IF;

  RETURN v_registration;
END;
$$;

DROP FUNCTION IF EXISTS public.request_event_cancellation(uuid, text);
CREATE FUNCTION public.request_event_cancellation(
  p_registration_id uuid,
  p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_status text;
  v_request_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;

  SELECT event_id, status INTO v_event_id, v_status
  FROM public.event_responses
  WHERE id = p_registration_id AND user_id = v_user_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Registration is already cancelled'; END IF;

  SELECT id INTO v_request_id
  FROM public.event_cancellation_requests
  WHERE registration_id = p_registration_id AND status = 'requested'
  LIMIT 1;
  IF v_request_id IS NOT NULL THEN RETURN v_request_id; END IF;

  INSERT INTO public.event_cancellation_requests
    (registration_id, event_id, user_id, reason)
  VALUES
    (p_registration_id, v_event_id, v_user_id, left(btrim(COALESCE(p_reason, '')), 500))
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

DROP FUNCTION IF EXISTS public.list_event_cancellation_requests(uuid);
CREATE FUNCTION public.list_event_cancellation_requests(p_event_id uuid)
RETURNS SETOF public.event_cancellation_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_event_staff(p_event_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT cr.* FROM public.event_cancellation_requests cr
    WHERE cr.event_id = p_event_id
    ORDER BY CASE WHEN cr.status = 'requested' THEN 0 ELSE 1 END, cr.requested_at ASC;
END;
$$;

DROP FUNCTION IF EXISTS public.review_event_cancellation(uuid, boolean, text);
CREATE FUNCTION public.review_event_cancellation(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT ''
)
RETURNS TABLE (request_status text, promoted_registration_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_request public.event_cancellation_requests;
  v_registration public.event_responses;
  v_next uuid;
BEGIN
  SELECT * INTO v_request
  FROM public.event_cancellation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Cancellation request not found'; END IF;
  IF NOT public.is_event_staff(v_request.event_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF v_request.status <> 'requested' THEN
    RETURN QUERY SELECT v_request.status, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_registration
  FROM public.event_responses
  WHERE id = v_request.registration_id
  FOR UPDATE;

  IF NOT p_approve THEN
    UPDATE public.event_cancellation_requests
    SET status = 'rejected', club_note = left(btrim(COALESCE(p_note, '')), 500),
        reviewed_by = v_actor, reviewed_at = now()
    WHERE id = p_request_id;
    RETURN QUERY SELECT 'rejected'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Lock the event before changing occupancy, matching the payment/waitlist
  -- critical section and preventing two clubs actions from taking one seat.
  PERFORM 1 FROM public.events WHERE id = v_request.event_id FOR UPDATE;

  -- The existing cancellation trigger promotes the oldest waitlisted row in
  -- this same transaction. Capture its id for the response, then let the
  -- trigger perform the actual transition exactly once.
  SELECT id INTO v_next
  FROM public.event_responses
  WHERE event_id = v_request.event_id AND status = 'waitlisted'
  ORDER BY submitted_at ASC NULLS LAST, id ASC
  LIMIT 1
  FOR UPDATE;

  UPDATE public.event_responses
  SET status = 'cancelled',
      hold_expires_at = NULL,
      refund_status = CASE
        WHEN COALESCE(payment_status, 'na') IN ('pending', 'verified') THEN 'pending'
        ELSE 'not_applicable'
      END
  WHERE id = v_registration.id
    AND status <> 'cancelled';

  UPDATE public.event_cancellation_requests
  SET status = 'approved', club_note = left(btrim(COALESCE(p_note, '')), 500),
      reviewed_by = v_actor, reviewed_at = now()
  WHERE id = p_request_id;

  RETURN QUERY SELECT 'approved'::text, v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_event_registration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_event_registration(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_cancellation_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_cancellation_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_authenticated_event_response(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_authenticated_event_response(uuid, text, text, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.request_event_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_event_cancellation(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_event_cancellation_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_event_cancellation_requests(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.review_event_cancellation(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_event_cancellation(uuid, boolean, text) TO authenticated;

-- ==========================================================================
-- 005 — attendee account hardening, realtime, ticket list, response counts
-- ==========================================================================
-- Additive migration. Fixes the gaps found in the attendee-account audit:
--   * cancellation requests can no longer be inserted/edited directly; all
--     writes go through the SECURITY DEFINER RPCs (which check ownership);
--   * legacy anonymous registrations are linked to accounts by email, and the
--     lookup/cancellation RPCs fall back to email matching;
--   * club staff can read their event's cancellation queue (needed by both
--     the review screen and Supabase Realtime RLS);
--   * realtime is enabled for registrations and cancellation requests;
--   * attendees get list_my_event_registrations() for the My Tickets page;
--   * events.response_count is maintained by a trigger and backfilled;
--   * registration is refused for events whose date has already passed.

-- --------------------------------------------------------------------------
-- 1. Link legacy anonymous registrations to the matching auth account
-- --------------------------------------------------------------------------
-- Only when the account has no other active registration for that event, so
-- the partial unique index uniq_event_response_user_event cannot be violated.
UPDATE public.event_responses er
SET user_id = u.id
FROM auth.users u
WHERE er.user_id IS NULL
  AND u.email IS NOT NULL
  AND er.respondent_email <> ''
  AND lower(er.respondent_email) = lower(u.email)
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_responses other
    WHERE other.user_id = u.id
      AND other.event_id = er.event_id
      AND other.status <> 'cancelled'
      AND other.id <> er.id
  );

CREATE INDEX IF NOT EXISTS idx_event_responses_email_lower
  ON public.event_responses (lower(respondent_email));

-- --------------------------------------------------------------------------
-- 2. Cancellation table: RPC-only writes, staff reads, safe grants
-- --------------------------------------------------------------------------
-- The RPCs are SECURITY DEFINER and therefore unaffected by these revokes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.event_cancellation_requests FROM anon, authenticated;

DROP POLICY IF EXISTS "Attendees can create own cancellation requests"
  ON public.event_cancellation_requests;

DROP POLICY IF EXISTS "Attendees can read own cancellation requests"
  ON public.event_cancellation_requests;
CREATE POLICY "Attendees can read own cancellation requests"
  ON public.event_cancellation_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Club staff need this policy for the review screen and for Realtime to
-- deliver postgres_changes rows to their authenticated session.
DROP POLICY IF EXISTS "Event staff can read cancellation requests"
  ON public.event_cancellation_requests;
CREATE POLICY "Event staff can read cancellation requests"
  ON public.event_cancellation_requests FOR SELECT
  TO authenticated
  USING (public.is_event_staff(event_id));

-- --------------------------------------------------------------------------
-- 3. Registration lookup: account id OR the verified account email
-- --------------------------------------------------------------------------
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
    AND (
      er.user_id = auth.uid()
      OR (
        er.user_id IS NULL
        AND lower(er.respondent_email) = lower(COALESCE(
          (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), ''
        ))
      )
    )
  ORDER BY er.submitted_at DESC
  LIMIT 1;
$$;

-- --------------------------------------------------------------------------
-- 4. Cancellation request: adopt legacy rows, no direct-table writes needed
-- --------------------------------------------------------------------------
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
  v_email text;
  v_event_id uuid;
  v_status text;
  v_owner uuid;
  v_request_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT event_id, status, user_id
    INTO v_event_id, v_status, v_owner
  FROM public.event_responses
  WHERE id = p_registration_id
    AND (
      user_id = v_user_id
      OR (user_id IS NULL AND lower(respondent_email) = COALESCE(v_email, ''))
    )
  FOR UPDATE;

  IF v_event_id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'Registration is already cancelled'; END IF;

  -- Claim the legacy row for this account so future lookups stop relying on
  -- the email fallback.
  IF v_owner IS NULL THEN
    UPDATE public.event_responses
    SET user_id = v_user_id
    WHERE id = p_registration_id AND user_id IS NULL;
  END IF;

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

-- --------------------------------------------------------------------------
-- 5. Club review: reject requests that do not match the registration owner
-- --------------------------------------------------------------------------
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
  v_owner_email text;
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

  IF v_registration.id IS NULL OR v_registration.event_id <> v_request.event_id THEN
    RAISE EXCEPTION 'Cancellation request does not match a registration for this event';
  END IF;

  SELECT lower(email) INTO v_owner_email
  FROM auth.users WHERE id = v_request.user_id;

  IF NOT (
    v_registration.user_id = v_request.user_id
    OR (
      v_registration.user_id IS NULL
      AND v_owner_email IS NOT NULL
      AND lower(v_registration.respondent_email) = v_owner_email
    )
  ) THEN
    RAISE EXCEPTION 'Cancellation request does not belong to this registration';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.event_cancellation_requests
    SET status = 'rejected', club_note = left(btrim(COALESCE(p_note, '')), 500),
        reviewed_by = v_actor, reviewed_at = now()
    WHERE id = p_request_id;
    RETURN QUERY SELECT 'rejected'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Lock the event before changing occupancy, matching the payment/waitlist
  -- critical section and preventing two club actions from taking one seat.
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

-- --------------------------------------------------------------------------
-- 6. Attendee ticket list
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_my_event_registrations();
CREATE FUNCTION public.list_my_event_registrations()
RETURNS TABLE (
  registration_id uuid,
  event_id uuid,
  unique_code text,
  status text,
  payment_status text,
  refund_status text,
  ticket_url text,
  submitted_at timestamptz,
  event_title text,
  event_slug text,
  event_date date,
  event_time time,
  event_venue text,
  event_poster_url text,
  org_name text,
  org_slug text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user;

  RETURN QUERY
    SELECT
      er.id, er.event_id, er.unique_code, er.status, er.payment_status,
      er.refund_status, er.ticket_url, er.submitted_at,
      e.title, e.slug, e.date, e.time, e.venue, e.poster_url,
      o.name, o.slug
    FROM public.event_responses er
    JOIN public.events e ON e.id = er.event_id
    LEFT JOIN public.organizations o ON o.id = e.organization_id
    WHERE er.user_id = v_user
       OR (
         er.user_id IS NULL
         AND v_email IS NOT NULL
         AND lower(er.respondent_email) = v_email
       )
    ORDER BY e.date DESC NULLS LAST, er.submitted_at DESC;
END;
$$;

-- --------------------------------------------------------------------------
-- 7. Realtime for registrations and cancellation requests
-- --------------------------------------------------------------------------
-- REPLICA IDENTITY FULL lets Supabase Realtime apply the event_id filter to
-- UPDATE/DELETE payloads (the default identity only carries the primary key).
ALTER TABLE public.event_responses REPLICA IDENTITY FULL;
ALTER TABLE public.event_cancellation_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_responses'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.event_responses';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_cancellation_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.event_cancellation_requests';
  END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- 8. Maintain events.response_count
-- --------------------------------------------------------------------------
-- Counts active seat holders (confirmed + unexpired/permanent holds), which is
-- what the "Full" badge and the MC response totals expect. Cancelled and
-- waitlisted rows do not consume capacity.
CREATE OR REPLACE FUNCTION public.sync_event_response_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_ids := ARRAY[NEW.event_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_event_ids := ARRAY[OLD.event_id];
  ELSE
    v_event_ids := ARRAY[OLD.event_id, NEW.event_id];
  END IF;

  UPDATE public.events e
  SET response_count = (
    SELECT count(*)
    FROM public.event_responses er
    WHERE er.event_id = e.id
      AND er.status IN ('confirmed', 'pending')
  )
  WHERE e.id = ANY(v_event_ids);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_response_count ON public.event_responses;
CREATE TRIGGER trg_sync_response_count
  AFTER INSERT OR DELETE OR UPDATE OF status
  ON public.event_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_event_response_count();

UPDATE public.events e
SET response_count = COALESCE((
  SELECT count(*)
  FROM public.event_responses er
  WHERE er.event_id = e.id
    AND er.status IN ('confirmed', 'pending')
), 0);

-- --------------------------------------------------------------------------
-- 9. Registration RPC: close past events, release expired holds first
-- --------------------------------------------------------------------------
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
  v_event_date date;
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

  SELECT COALESCE(e.price, 0), e.status, e.date
    INTO v_event_price, v_event_status, v_event_date
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_event_status IS NULL OR v_event_status <> 'published' THEN
    RAISE EXCEPTION 'Event is not available for registration';
  END IF;

  IF v_event_date IS NOT NULL AND v_event_date < current_date THEN
    RAISE EXCEPTION 'Registration for this event has closed';
  END IF;

  -- Release this attendee's own lapsed paid hold so they can register again
  -- without waiting for the lazy sweep on a future insert.
  UPDATE public.event_responses er
  SET status = 'cancelled', hold_expires_at = NULL
  WHERE er.event_id = p_event_id
    AND er.status = 'pending'
    AND er.hold_expires_at IS NOT NULL
    AND er.hold_expires_at < now()
    AND (er.user_id = v_user_id OR lower(er.respondent_email) = v_email);

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

-- --------------------------------------------------------------------------
-- 10. Function grants
-- --------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_my_event_registration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_event_registration(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.request_event_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_event_cancellation(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_event_cancellation(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_event_cancellation(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_event_registrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_event_registrations() TO authenticated;
REVOKE ALL ON FUNCTION public.submit_authenticated_event_response(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_authenticated_event_response(uuid, text, text, text, jsonb) TO authenticated;

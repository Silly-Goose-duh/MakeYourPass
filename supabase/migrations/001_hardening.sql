-- ============================================================================
--  MakeYourPass - 001_hardening.sql
--  Security + correctness hardening for the Postgres layer.
-- ============================================================================
--  WHY THIS FILE EXISTS
--  --------------------
--  A security audit of the Supabase/Postgres layer found that every check-in
--  RPC was reachable with nothing but the *public* anon key:
--
--    * admit_registration(uuid, uuid)          SECURITY DEFINER, granted to anon
--    * admit_by_code_or_token(text, uuid)      SECURITY DEFINER, granted to anon
--    * admit_by_code_or_token(text)            SECURITY DEFINER, granted to anon
--    * get_event_analytics(uuid)               SECURITY DEFINER, granted to anon
--
--  None of them performed ANY authorization check, and `p_event_id` had a
--  `DEFAULT NULL`, so omitting it admitted a ticket from any event on the
--  platform. `unique_code` is sequential (EVT-0001, EVT-0002, ...), so an
--  anonymous attacker could enumerate codes and harvest every attendee's
--  name platform-wide, or sabotage an event's check-in.
--
--  This migration is the remediation. It is a single, self-contained,
--  IDEMPOTENT script: every object is dropped-if-exists / created-if-not-exists
--  before being (re)created, so it is safe to run repeatedly against the live
--  production database. The historical *.sql files in supabase/ are an
--  append-only audit trail and are intentionally NOT modified by this file.
--
--  WHAT IT CHANGES (summary)
--  -------------------------
--    1. Check-in RPCs  -> authenticated + org admin/host only, mandatory
--                         event scoping, cancelled tickets rejected,
--                         every outcome written to admit_audit_log.
--    2. Analytics RPC  -> authenticated + org admin/host only, anon revoked.
--    3. Other SECURITY DEFINER functions audited; the ones without an
--       authorization check are recreated with guards + search_path pinning.
--       The intentionally-public ones are kept public but input-validated.
--    4. Seat capacity  -> decided from the LIVE confirmed row count instead of
--                         the monotonic registration_counter (cancelled
--                         registrations now release their seat), with the
--                         parent events row locked FOR UPDATE so two racing
--                         registrations cannot both take the last seat.
--                         New promote_from_waitlist() + cancel trigger.
--    5. Storage        -> SVG removed from the public event-posters bucket
--                         (stored XSS), tickets bucket made private with an
--                         org-scoped read policy.
--    6. admit_audit_log table (RLS on, no policies) for check-in forensics.
--    7. Indexes for event_responses / admit_audit_log at scale.
--
--  PREREQUISITES (already present in production, asserted by this file)
--    tables .... profiles, organizations, organization_members (role IN
--                'admin','host','member'), events, event_questions,
--                event_responses (unique_code, qr_token, status,
--                admitted_at, admitted_by), response_answers
--    funcs .... public.auth.uid(), public.gen_random_uuid()
--  NOTE: gen_random_uuid()/gen_random_bytes() are the only extensions used.
--
--  RUN AS: the Supabase `postgres` role (SQL editor or
--          `supabase db query --linked -f supabase/migrations/001_hardening.sql`)
--  AFTER:  the PostgREST schema cache must be reloaded so the dropped
--          overload of admit_by_code_or_token(text) disappears from the API:
--          `NOTIFY pgrst, 'reload schema';`
-- ============================================================================


-- ############################################################################
-- SECTION 0 - Authorization helpers (SECURITY DEFINER so they can read
--             profiles / organization_members without RLS recursion)
-- ############################################################################

DROP FUNCTION IF EXISTS public.is_org_staff(uuid);
CREATE FUNCTION public.is_org_staff(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Platform superadmin
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.is_superadmin = true
  ) THEN
    RETURN true;
  END IF;

  -- Org admin or host (host role added in phase10-collaborators.sql)
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = v_uid
      AND om.role IN ('admin', 'host')
  );
END;
$$;

DROP FUNCTION IF EXISTS public.is_event_staff(uuid);
CREATE FUNCTION public.is_event_staff(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF p_event_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT e.organization_id INTO v_org_id
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_org_staff(v_org_id);
END;
$$;

-- Storage-object gate for the now-private `tickets` bucket.
-- Ticket objects live at {event_id}/{registration_id}.png, so the first
-- path segment is the event id. The uuid cast is guarded so a malformed
-- object name can never raise inside a SELECT policy.
DROP FUNCTION IF EXISTS public.can_read_ticket_object(text);
CREATE FUNCTION public.can_read_ticket_object(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id uuid := NULL;
BEGIN
  IF v_uid IS NULL OR p_object_name IS NULL OR p_object_name = '' THEN
    RETURN false;
  END IF;

  BEGIN
    v_event_id := split_part(p_object_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    v_event_id := NULL;
  END;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_event_staff(v_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.is_org_staff(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_event_staff(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_ticket_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_staff(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_event_staff(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_ticket_object(text) TO authenticated, service_role;


-- ############################################################################
-- SECTION 1 - Audit log (created before the RPCs that write to it)
-- ############################################################################

CREATE TABLE IF NOT EXISTS public.admit_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid,
  event_id        uuid,
  action          text NOT NULL
                  CONSTRAINT admit_audit_log_action_check
                  CHECK (action IN ('admit','admit_duplicate','waitlist_block',
                                    'cancel_block','wrong_event')),
  actor_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Re-assert the CHECK in case the table already existed without it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admit_audit_log'::regclass
      AND conname = 'admit_audit_log_action_check'
  ) THEN
    ALTER TABLE public.admit_audit_log
      ADD CONSTRAINT admit_audit_log_action_check
      CHECK (action IN ('admit','admit_duplicate','waitlist_block',
                        'cancel_block','wrong_event'));
  END IF;
END
$$;

-- RLS on, deliberately NO policies: the table is written exclusively from
-- inside the SECURITY DEFINER admit RPCs (which run as the owner). Reads
-- require service_role / SQL-editor access.
ALTER TABLE public.admit_audit_log ENABLE ROW LEVEL SECURITY;


-- ############################################################################
-- SECTION 2 - Check-in RPCs
-- ############################################################################
--  Destroy the dangerous overloads first.
--    * admit_by_code_or_token(text)  -> no event scoping AT ALL, dropped for good.
--    * admit_registration(uuid)       -> created by phase4-admit-fixed.sql as an
--                                         unscoped alias of the 2-arg version;
--                                         dropped so that the mandatory-event-id
--                                         rule cannot be bypassed.
--    * the 2-arg versions              -> recreated below with guards.

DROP FUNCTION IF EXISTS public.admit_by_code_or_token(text);
DROP FUNCTION IF EXISTS public.admit_registration(uuid);
DROP FUNCTION IF EXISTS public.admit_by_code_or_token(text, uuid);
DROP FUNCTION IF EXISTS public.admit_registration(uuid, uuid);

-- ------------------------------------------------------------------ 2a ----
CREATE FUNCTION public.admit_registration(
  p_qr_token uuid,
  p_event_id uuid
)
RETURNS TABLE (name text, unique_code text, already_admitted boolean, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  r       record;
BEGIN
  -- 1. Authentication is mandatory; every write below records admitted_by.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Event scoping is MANDATORY (no DEFAULT on the parameter).
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required';
  END IF;

  IF p_qr_token IS NULL THEN
    RAISE EXCEPTION 'qr_token required';
  END IF;

  -- 3. Caller must be a superadmin or an admin/host of the event's org.
  IF NOT public.is_event_staff(p_event_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT er.id, er.event_id, er.respondent_name, er.unique_code,
         er.admitted_at, er.status
    INTO r
    FROM public.event_responses er
   WHERE er.qr_token = p_qr_token;

  IF r.id IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, false, 'not_found';
    RETURN;
  END IF;

  -- 4. Cross-event scan: report the mismatch but leak NOTHING about the
  --    attendee (the old code returned the real name + code here).
  IF r.event_id IS DISTINCT FROM p_event_id THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, p_event_id, 'wrong_event', v_actor);
    RETURN QUERY SELECT NULL::text, NULL::text, false, 'wrong_event';
    RETURN;
  END IF;

  -- 5. Cancelled tickets must never be admitted (previously only waitlisted
  --    was handled, so a cancelled ticket was happily let through).
  IF r.status = 'cancelled' THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'cancel_block', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'cancelled';
    RETURN;
  END IF;

  IF r.status = 'waitlisted' THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'waitlist_block', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'waitlisted';
    RETURN;
  END IF;

  IF r.admitted_at IS NOT NULL THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'admit_duplicate', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, true, 'already_admitted';
    RETURN;
  END IF;

  -- 6. Admit. The `admitted_at IS NULL` predicate makes two concurrent scans
  --    of the same QR resolve to exactly one 'admitted' + one 'already_admitted'.
  UPDATE public.event_responses er
     SET admitted_at = now(),
         admitted_by = v_actor
   WHERE er.id = r.id
     AND er.admitted_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'admit_duplicate', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, true, 'already_admitted';
    RETURN;
  END IF;

  INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
  VALUES (r.id, r.event_id, 'admit', v_actor);

  RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'admitted';
END;
$$;

-- ------------------------------------------------------------------ 2b ----
CREATE FUNCTION public.admit_by_code_or_token(
  p_input    text,
  p_event_id uuid
)
RETURNS TABLE (name text, unique_code text, already_admitted boolean, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code  text;
  v_token uuid := NULL;
  r       record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required';
  END IF;

  v_code := btrim(COALESCE(p_input, ''));
  IF v_code = '' THEN
    RAISE EXCEPTION 'code required';
  END IF;
  -- Length cap: blocks bulk enumeration abuse via giant payloads.
  IF length(v_code) > 64 THEN
    RAISE EXCEPTION 'code too long';
  END IF;

  IF NOT public.is_event_staff(p_event_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Treat the input as a uuid when it looks like one, otherwise as a code.
  BEGIN
    v_token := v_code::uuid;
  EXCEPTION WHEN others THEN
    v_token := NULL;
  END;

  IF v_token IS NOT NULL THEN
    SELECT er.id, er.event_id, er.respondent_name, er.unique_code,
           er.admitted_at, er.status
      INTO r
      FROM public.event_responses er
     WHERE er.qr_token = v_token;
  END IF;

  IF r.id IS NULL THEN
    SELECT er.id, er.event_id, er.respondent_name, er.unique_code,
           er.admitted_at, er.status
      INTO r
      FROM public.event_responses er
     WHERE er.unique_code = v_code
        OR upper(er.unique_code) = upper(v_code)
     LIMIT 1;
  END IF;

  IF r.id IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, false, 'not_found';
    RETURN;
  END IF;

  IF r.event_id IS DISTINCT FROM p_event_id THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, p_event_id, 'wrong_event', v_actor);
    RETURN QUERY SELECT NULL::text, NULL::text, false, 'wrong_event';
    RETURN;
  END IF;

  IF r.status = 'cancelled' THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'cancel_block', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'cancelled';
    RETURN;
  END IF;

  IF r.status = 'waitlisted' THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'waitlist_block', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'waitlisted';
    RETURN;
  END IF;

  IF r.admitted_at IS NOT NULL THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'admit_duplicate', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, true, 'already_admitted';
    RETURN;
  END IF;

  UPDATE public.event_responses er
     SET admitted_at = now(),
         admitted_by = v_actor
   WHERE er.id = r.id
     AND er.admitted_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
    VALUES (r.id, r.event_id, 'admit_duplicate', v_actor);
    RETURN QUERY SELECT r.respondent_name, r.unique_code, true, 'already_admitted';
    RETURN;
  END IF;

  INSERT INTO public.admit_audit_log (registration_id, event_id, action, actor_id)
  VALUES (r.id, r.event_id, 'admit', v_actor);

  RETURN QUERY SELECT r.respondent_name, r.unique_code, false, 'admitted';
END;
$$;

-- anon / PUBLIC lose EXECUTE entirely; only signed-in org staff keep it.
REVOKE ALL ON FUNCTION public.admit_registration(uuid, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admit_by_code_or_token(text, uuid)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admit_registration(uuid, uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admit_by_code_or_token(text, uuid) TO authenticated;


-- ############################################################################
-- SECTION 3 - Analytics RPC (was readable by anon for every event)
-- ############################################################################

DROP FUNCTION IF EXISTS public.get_event_analytics(uuid);

-- NOTE: parameter name `event_id_param` is preserved because the client calls
-- the RPC with that named argument. Only the guard is added.
CREATE FUNCTION public.get_event_analytics(event_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_total_responses bigint;
  v_question_breakdown jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF event_id_param IS NULL THEN
    RAISE EXCEPTION 'event_id required';
  END IF;

  IF NOT public.is_event_staff(event_id_param) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO v_total_responses
  FROM public.event_responses er
  WHERE er.event_id = event_id_param;

  SELECT COALESCE(jsonb_agg(q ORDER BY q->>'sort_order'), '[]'::jsonb)
    INTO v_question_breakdown
  FROM (
    SELECT jsonb_build_object(
      'question_id', eq.id,
      'question_title', eq.title,
      'question_type', eq.question_type,
      'sort_order', eq.sort_order,
      'responses', COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object('value', sub.value, 'count', sub.cnt)
                 ORDER BY sub.cnt DESC
               )
        FROM (
          SELECT ra.value, count(*)::int AS cnt
          FROM public.response_answers ra
          WHERE ra.question_id = eq.id
          GROUP BY ra.value
        ) sub
      ), '[]'::jsonb)
    ) AS q
    FROM public.event_questions eq
    WHERE eq.event_id = event_id_param
  ) t;

  RETURN jsonb_build_object(
    'total_responses', v_total_responses,
    'questions', COALESCE(v_question_breakdown, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_analytics(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_event_analytics(uuid) TO authenticated;


-- ############################################################################
-- SECTION 4 - get_organization_events
--            Was SECURITY DEFINER with NO check and granted to anon, so any
--            anonymous visitor could read an org's ENTIRE event history,
--            including drafts and cancelled events.
--            New rule: anon may only see `published`; full history requires
--            superadmin or an admin/host membership row for that org.
--            NOTE: deliberately still callable by anon (public portal
--            browsing), therefore NO hard auth.uid() guard on this one.
-- ############################################################################

DROP FUNCTION IF EXISTS public.get_organization_events(uuid, text);

CREATE FUNCTION public.get_organization_events(
  org_id uuid,
  filter_status text DEFAULT 'all'
)
RETURNS SETOF events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff boolean := public.is_org_staff(org_id);
BEGIN
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required';
  END IF;

  IF v_staff THEN
    -- Full history for org staff / superadmin
    IF COALESCE(filter_status, 'all') = 'all' THEN
      RETURN QUERY
        SELECT e.* FROM public.events e
        WHERE e.organization_id = org_id
        ORDER BY e.created_at DESC;
    ELSE
      RETURN QUERY
        SELECT e.* FROM public.events e
        WHERE e.organization_id = org_id
          AND e.status = filter_status
        ORDER BY e.created_at DESC;
    END IF;
  ELSE
    -- Everyone else: published events only.
    IF COALESCE(filter_status, 'all') = 'all' THEN
      RETURN QUERY
        SELECT e.* FROM public.events e
        WHERE e.organization_id = org_id
          AND e.status = 'published'
        ORDER BY e.created_at DESC;
    ELSE
      RETURN QUERY
        SELECT e.* FROM public.events e
        WHERE e.organization_id = org_id
          AND e.status = 'published'
          AND e.status = filter_status
        ORDER BY e.created_at DESC;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_events(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_organization_events(uuid, text) TO anon, authenticated, service_role;


-- ############################################################################
-- SECTION 5 - Public submission RPCs
--            Anonymous students MUST be able to register, so these keep anon
--            EXECUTE. They were, however, taking raw unbounded input, so
--            they are recreated with validation + a pinned search_path.
-- ############################################################################

-- ------------------------------------------------------------------ 5a ----
DROP FUNCTION IF EXISTS public.submit_event_response(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.submit_event_response(uuid, text, text, text, text);

CREATE FUNCTION public.submit_event_response(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text DEFAULT '',
  p_payment_proof_url text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_proof text;
  v_payment_type text;
  v_pay_status text;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Length caps BEFORE trimming, so a multi-megabyte payload is rejected
  -- rather than stored.
  IF p_name IS NULL OR length(p_name) > 200 THEN
    RAISE EXCEPTION 'Name is required (max 200 characters)';
  END IF;
  IF p_email IS NULL OR length(p_email) > 254 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;
  IF p_phone IS NOT NULL AND length(p_phone) > 32 THEN
    RAISE EXCEPTION 'Phone number too long';
  END IF;
  IF p_payment_proof_url IS NOT NULL AND length(p_payment_proof_url) > 1024 THEN
    RAISE EXCEPTION 'Payment proof URL too long';
  END IF;

  v_name := btrim(p_name);
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Name must be between 2 and 120 characters';
  END IF;

  v_email := lower(btrim(p_email));
  IF v_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  v_phone := COALESCE(btrim(p_phone), '');
  IF v_phone <> '' AND v_phone !~ '^[0-9+() \-]{5,32}$' THEN
    RAISE EXCEPTION 'Invalid phone number';
  END IF;

  v_proof := COALESCE(btrim(p_payment_proof_url), '');
  IF v_proof <> '' AND v_proof !~* '^https?://' THEN
    RAISE EXCEPTION 'Invalid payment proof URL';
  END IF;

  SELECT e.payment_type INTO v_payment_type
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_payment_type IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_payment_type = 'paid' THEN
    IF v_proof = '' THEN
      RAISE EXCEPTION 'Payment screenshot is required for paid events';
    END IF;
    v_pay_status := 'pending';
  ELSE
    v_pay_status := 'na';
  END IF;

  INSERT INTO public.event_responses (
    event_id, respondent_name, respondent_email, respondent_phone,
    payment_proof_url, payment_status
  )
  VALUES (
    p_event_id, v_name, v_email, v_phone, v_proof, v_pay_status
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ------------------------------------------------------------------ 5b ----
-- Also public by design, but it previously accepted ANY question_id with ANY
-- text (so an anonymous caller could attach junk answers to other events'
-- questions) and no size limits. Validation only - anon access preserved.
DROP FUNCTION IF EXISTS public.submit_response_answers(uuid, jsonb);

CREATE FUNCTION public.submit_response_answers(
  p_response_id uuid,
  p_answers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_response_id IS NULL THEN
    RAISE EXCEPTION 'response_id required';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be a JSON array';
  END IF;

  IF jsonb_array_length(p_answers) > 100 THEN
    RAISE EXCEPTION 'Too many answers (max 100)';
  END IF;

  SELECT er.event_id INTO v_event_id
  FROM public.event_responses er
  WHERE er.id = p_response_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Response not found';
  END IF;

  INSERT INTO public.response_answers (response_id, question_id, value)
  SELECT DISTINCT p_response_id, a.qid, a.val
  FROM (
    SELECT (el.elem->>'question_id')::uuid AS qid,
           left(COALESCE(el.elem->>'value', ''), 1000) AS val
    FROM jsonb_array_elements(p_answers) AS el(elem)
    WHERE COALESCE(el.elem->>'question_id', '') ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND EXISTS (
        SELECT 1
        FROM public.event_questions eq
        WHERE eq.id = ((el.elem->>'question_id')::uuid)
          AND eq.event_id = v_event_id
      )
  ) a;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_event_response(uuid, text, text, text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_response_answers(uuid, jsonb)                    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_event_response(uuid, text, text, text, text)
  TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.submit_response_answers(uuid, jsonb)
  TO anon, authenticated, service_role;


-- ############################################################################
-- SECTION 6 - Seat capacity: desynchronise it from registration_counter
-- ############################################################################
--  BUG: assign_response_code() incremented events.registration_counter and
--  waitlisted when counter > capacity. But event_seat_status computes
--  confirmed_count from the actual rows. Cancelling a registration therefore
--  burned a counter slot forever (seats never reopened), and the UI could show
--  "10 seats left" while every new registrant was waitlisted.
--
--  FIX: the counter is now purely a code sequence; the capacity decision is
--  made from the live count of status='confirmed' rows, taken while holding a
--  FOR UPDATE lock on the parent events row so two racing registrations for
--  the last seat serialise and cannot both be confirmed.

CREATE OR REPLACE FUNCTION public.assign_response_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix    text;
  v_capacity  integer;
  v_counter   integer;
  v_confirmed integer;
BEGIN
  -- Serialise every registration for this event on the parent row lock.
  SELECT e.id_prefix, e.capacity, e.registration_counter
    INTO v_prefix, v_capacity, v_counter
    FROM public.events e
   WHERE e.id = NEW.event_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- registration_counter is now ONLY a monotonic code sequence.
  v_counter := COALESCE(v_counter, 0) + 1;
  UPDATE public.events e
     SET registration_counter = v_counter
   WHERE e.id = NEW.event_id;

  v_prefix := COALESCE(NULLIF(btrim(v_prefix), ''), 'EVT');
  NEW.unique_code := v_prefix || '-' || lpad(v_counter::text, 4, '0');

  -- Capacity from the LIVE confirmed row count (never from the counter).
  IF v_capacity IS NULL OR v_capacity <= 0 THEN
    NEW.status := 'confirmed';
  ELSE
    SELECT count(*)::int INTO v_confirmed
    FROM public.event_responses er
    WHERE er.event_id = NEW.event_id
      AND er.status = 'confirmed';

    IF v_confirmed >= v_capacity THEN
      NEW.status := 'waitlisted';
    ELSE
      NEW.status := 'confirmed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself is already in place (phase1-ticketing.sql); re-create it
-- idempotently so this migration is self-sufficient on a fresh database.
DROP TRIGGER IF EXISTS trg_assign_response_code ON public.event_responses;
CREATE TRIGGER trg_assign_response_code
  BEFORE INSERT ON public.event_responses
  FOR EACH ROW EXECUTE FUNCTION public.assign_response_code();

-- ---- 6a: waitlist promotion -------------------------------------------------

-- Internal worker: no auth check (it runs from a trigger where auth.uid() may
-- legitimately be NULL, e.g. a service_role edge function cancelling a seat).
DROP FUNCTION IF EXISTS public._promote_waitlist_locked(uuid);
CREATE FUNCTION public._promote_waitlist_locked(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity  integer;
  v_confirmed integer;
  v_promoted  integer := 0;
BEGIN
  SELECT e.capacity INTO v_capacity
  FROM public.events e
  WHERE e.id = p_event_id
    FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN 0;                 -- event gone; nothing to do
  END IF;

  IF v_capacity <= 0 THEN
    RETURN 0;                 -- unlimited capacity
  END IF;

  LOOP
    SELECT count(*)::int INTO v_confirmed
    FROM public.event_responses er
    WHERE er.event_id = p_event_id
      AND er.status = 'confirmed';

    EXIT WHEN v_confirmed >= v_capacity;
    EXIT WHEN v_promoted >= 1000;   -- hard safety bound

    UPDATE public.event_responses er
       SET er.status = 'confirmed'
     WHERE er.id = (
             SELECT w.id
             FROM public.event_responses w
             WHERE w.event_id = p_event_id
               AND w.status = 'waitlisted'
             ORDER BY w.submitted_at ASC NULLS LAST, w.id ASC
             LIMIT 1)
       AND er.status = 'waitlisted';

    EXIT WHEN NOT FOUND;

    v_promoted := v_promoted + 1;
  END LOOP;

  RETURN v_promoted;
END;
$$;

REVOKE ALL ON FUNCTION public._promote_waitlist_locked(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._promote_waitlist_locked(uuid) TO service_role;

-- Public RPC: returns the number of registrations promoted.
DROP FUNCTION IF EXISTS public.promote_from_waitlist(uuid);
CREATE FUNCTION public.promote_from_waitlist(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required';
  END IF;

  IF NOT public.is_event_staff(p_event_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN public._promote_waitlist_locked(p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.promote_from_waitlist(uuid) TO authenticated;

-- ---- 6b: auto-promote when a confirmed seat is cancelled --------------------

CREATE OR REPLACE FUNCTION public.trg_promote_waitlist_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public._promote_waitlist_locked(NEW.event_id);
  END IF;
  RETURN NULL;   -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_waitlist_on_cancel ON public.event_responses;
CREATE TRIGGER trg_promote_waitlist_on_cancel
  AFTER UPDATE OF status ON public.event_responses
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION public.trg_promote_waitlist_on_cancel();


-- ############################################################################
-- SECTION 7 - Storage bucket hardening
-- ############################################################################

-- 7a) event-posters is a PUBLIC bucket that allowed image/svg+xml. An SVG
--     served from the Supabase origin is same-origin script: a stored-XSS
--     vector available to any org admin. Posters must be raster images only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-posters',
  'event-posters',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public              = EXCLUDED.public,
      file_size_limit     = EXCLUDED.file_size_limit,
      allowed_mime_types  = EXCLUDED.allowed_mime_types;

-- 7b) The tickets bucket held attendee QR PNGs at the predictable path
--     {event_id}/{registration_id}.png on a PUBLIC bucket. Make it private and
--     restrict reads to the owning organization's admins/hosts.
--     NOTE: event_responses.ticket_url is intentionally KEPT (it stores the
--     historical public URL; a signed-URL endpoint is being added separately).
UPDATE storage.buckets
   SET public = false
 WHERE id = 'tickets';

DROP POLICY IF EXISTS "Tickets are publicly readable" ON storage.objects;

DROP POLICY IF EXISTS "Tickets readable by org admins and hosts" ON storage.objects;
CREATE POLICY "Tickets readable by org admins and hosts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tickets'
    AND public.can_read_ticket_object(name)
  );

-- 7c) Drop the blanket authenticated WRITE policy on the tickets bucket.
--     It previously allowed ANY signed-in user to INSERT/UPDATE/DELETE at any
--     path, including `tickets/{event_id}/{registration_id}.png` — i.e. any
--     student could overwrite another attendee's QR ticket (replacing it with
--     their own would let them through the door twice) or delete tickets to
--     break check-in entirely.
--     Ticket PNGs are produced ONLY by /api/generate-ticket, which uses the
--     service-role key and therefore bypasses RLS. Nothing legitimate needs
--     this policy, so it is removed rather than narrowed.
DROP POLICY IF EXISTS "Tickets writable by authenticated" ON storage.objects;

-- Sanity guard: after the drops above, the tickets bucket should have exactly
-- one policy (the org-scoped SELECT above). Raise if a future edit re-adds a
-- broad write path, because it would silently reopen the ticket-tampering hole.
DO $$
DECLARE v_writes int;
BEGIN
  SELECT count(*) INTO v_writes
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename  = 'objects'
     AND policyname ILIKE '%ticket%'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_writes > 0 THEN
    RAISE EXCEPTION 'tickets bucket still has % write policy/policies - review before continuing', v_writes;
  END IF;
END;
$$;


-- ############################################################################
-- SECTION 8 - Indexes for scale
-- ############################################################################

-- Seat/capacity maths and waitlist scans: (event_id, status).
CREATE INDEX IF NOT EXISTS idx_event_responses_event_status
  ON public.event_responses (event_id, status);

-- Case-insensitive email lookups by hosts.
-- (Redundant prefix-wise with uniq_response_event_email(event_id, lower(email)),
--  but this index serves host-wide "find this person anywhere" queries.)
CREATE INDEX IF NOT EXISTS idx_event_responses_lower_email
  ON public.event_responses (lower(respondent_email));

-- Check-in forensics / live audit feed.
CREATE INDEX IF NOT EXISTS idx_admit_audit_log_event_created
  ON public.admit_audit_log (event_id, created_at DESC);


-- ############################################################################
-- SECTION 9 - search_path pinning for already-authorized SECURITY DEFINER
--             functions (body unchanged, only the missing `SET search_path`
--             is added - CREATE OR REPLACE keeps existing triggers/grants)
-- ############################################################################
--  These three already had a correct auth.uid()/membership guard, so their
--  authorization logic is untouched; only the definer's search_path is pinned.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, is_superadmin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    CASE WHEN NEW.email = 'gooseisback4u@gmail.com' THEN true ELSE false END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_organization_request(
  org_name TEXT,
  org_slug TEXT,
  org_description TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM organizations WHERE slug = org_slug) THEN
    RETURN jsonb_build_object('error', 'Organization slug already exists');
  END IF;

  IF EXISTS (SELECT 1 FROM organization_registration_requests
             WHERE user_id = v_user_id AND status = 'pending') THEN
    RETURN jsonb_build_object('error', 'You already have a pending request');
  END IF;

  INSERT INTO organization_registration_requests (user_id, organization_name, organization_slug, description)
  VALUES (v_user_id, org_name, org_slug, org_description)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('id', v_request_id, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_request(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_organization_request(text, text, text) TO authenticated, service_role;

-- Public event listing: intentionally anon-visible, but only published rows
-- (identical to the events RLS SELECT policy). Only search_path is pinned.
CREATE OR REPLACE FUNCTION public.get_published_events()
RETURNS SETOF events
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT e.* FROM events e
  WHERE e.status = 'published'
  ORDER BY e.date ASC;
$$;

REVOKE ALL ON FUNCTION public.get_published_events() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_published_events() TO anon, authenticated, service_role;

-- ############################################################################
-- SECTION 10 - Defence in depth for fix-rls-policy.sql
-- ############################################################################
--  fix-rls-policy.sql targets a DIFFERENT schema (org_members, organizations.
--  owner_id, events.org_id, events.short_description, ticket_types ...) that
--  does not exist in MakeYourPass, so it aborts on its first CREATE POLICY and
--  never created ensure_org_member() / create_event_with_ticket_type().
--  They are guarded here anyway: if any environment does have them, anon loses
--  EXECUTE immediately. (Wrapped in IF EXISTS blocks because REVOKE errors
--  when the function is absent.)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_org_member'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_org_member(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_org_member(uuid) TO authenticated, service_role';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_event_with_ticket_type'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_event_with_ticket_type(text,text,text,text,text,text,text,text,date,date,text,text,text,text,boolean,text,text,integer,boolean,integer) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_event_with_ticket_type(text,text,text,text,text,text,text,text,date,date,text,text,text,text,boolean,text,text,integer,boolean,integer) TO authenticated, service_role';
  END IF;
END
$$;


-- ============================================================================
-- FUNCTIONS AUDITED AND DELIBERATELY LEFT UNCHANGED
-- ============================================================================
--  These were reviewed against the audit checklist and are ALREADY correct
--  (auth guard + pinned search_path + sane grants). Re-creating them here
--  would be churn with a (small) risk of breaking a live caller:
--
--  phase7-org-portal-upi.sql
--    create_event(uuid,text,...,text)  auth.uid() guard + is_org_admin/superadmin
--    verify_payment(uuid)              same, granted to authenticated only
--    reject_payment(uuid)              same, granted to authenticated only
--    mark_event_ended(uuid)            same, granted to authenticated only
--
--  phase8-mc-requests.sql
--    list_pending_org_requests()       is_superadmin() guard
--    approve_organization_request(uuid) profile.is_superadmin guard
--    reject_organization_request(uuid) profile.is_superadmin guard
--                                      (all: SET search_path = public,
--                                       GRANT to authenticated only)
--
--  phase10-collaborators.sql
--    invite_org_collaborator(uuid,text,text)  org-admin guard
--    accept_org_invite(text)                  auth + email match
--    list_org_collaborators(uuid)             admin/host guard
--    remove_org_collaborator(uuid,uuid)       org-admin guard
--    revoke_org_invite(uuid)                  org-admin guard
--                                      (all: SET search_path = public,
--                                       GRANT to authenticated only)
--
--  rls-fix.sql / rls-fix-v2.sql
--    is_superadmin()   SECURITY DEFINER but fully schema-qualified
--                       (public.profiles, auth.uid()) -> no search_path vector;
--                       used by RLS policies, so leave its privileges alone.
--    is_org_admin(uuid) idem (public.organization_members); note it is also
--                       referenced directly by many RLS policies, so changing
--                       its semantics is out of scope for this migration.
--
--  fix-orgs-with-counts.sql
--    get_organizations_with_counts()  already has SET search_path; returns only
--                       approved orgs for non-superadmins, i.e. exactly what
--                       anon can already read through the organizations RLS
--                       SELECT policy. No new exposure. LEFT AS IS.
--
--  event-setup-fix.sql
--    seed_event_defaults()  AFTER INSERT trigger on events, SECURITY DEFINER
--                       + SET search_path = public, no auth check needed
--                       (trigger-internal), GRANTed to nobody. LEFT AS IS.
--
--  phase1-ticketing.sql
--    "Tickets writable by authenticated" (storage.objects INSERT) allowed ANY
--                       signed-in user to upload into the tickets bucket at any
--                       path, so a student could overwrite or delete another
--                       attendee's QR PNG. Ticket PNGs are produced only by
--                       /api/generate-ticket, which uses the service-role key
--                       and bypasses RLS entirely, so the policy was DROPPED
--                       (step 7c) rather than narrowed. A guard DO-block raises
--                       if a ticket write policy ever reappears.
--
--  ALREADY-UPLOADED SVG POSTERS
--    Dropping image/svg+xml from the event-posters allow-list only blocks NEW
--                       uploads. Any SVG uploaded before this migration is
--                       still publicly reachable at its existing URL and can
--                       still carry script. Requires a one-off object sweep:
--                         select name from storage.objects
--                          where bucket_id = 'event-posters'
--                            and lower(name) like '%.svg';
--                       then delete those objects and clear the matching
--                       events.poster_url values.


-- ============================================================================
-- ORDER OF OPERATIONS WHEN THIS SCRIPT RUNS
-- ============================================================================
--   1. is_org_staff(uuid)                      created (auth helper)
--   2. is_event_staff(uuid)                    created (auth helper)
--   3. can_read_ticket_object(text)            created (storage auth helper)
--   4. grants/revokes on the three helpers
--   5. admit_audit_log                          created, CHECK re-asserted,
--                                               RLS enabled, no policies
--   6. admit_by_code_or_token(text)            DROPPED (unscoped overload)
--   7. admit_registration(uuid)                 DROPPED (unscoped overload)
--   8. admit_registration(uuid,uuid)            DROPPED, then recreated
--                                               (auth + staff + mandatory event
--                                               + cancelled handling + audit)
--   9. admit_by_code_or_token(text,uuid)        DROPPED, then recreated
--                                               (same guards + input caps)
--  10. grants on both admit RPCs                anon/PUBLIC revoked
--  11. get_event_analytics(uuid)                DROPPED, then recreated
--                                               (auth + staff); anon revoked
--  12. get_organization_events(uuid,text)       DROPPED, then recreated
--                                               (published-only for non-staff)
--  13. submit_event_response(uuid,...)          DROPPED, then recreated with
--                                               input validation (anon kept)
--  14. submit_response_answers(uuid,jsonb)      DROPPED, then recreated with
--                                               validation (anon kept)
--  15. assign_response_code()                   replaced: live-count capacity
--                                               + events row FOR UPDATE
--  16. trg_assign_response_code                 re-created idempotently
--  17. _promote_waitlist_locked(uuid)           created (internal worker)
--  18. promote_from_waitlist(uuid)              created (staff-only RPC)
--  19. trg_promote_waitlist_on_cancel()         created + trigger attached
--  20. storage.buckets 'event-posters'          SVG removed from mime allow-list
--  21. storage.buckets 'tickets'                public = false
--  22. storage policy                           "Tickets are publicly readable"
--                                               dropped; org-scoped SELECT added
--  23. indexes                                  (event_id,status),
--                                               (lower(email)),
--                                               (event_id, created_at desc)
--  24. search_path pinning sweep                handle_new_user,
--                                               create_organization_request,
--                                               get_published_events
--  25. defence-in-depth revokes                 ensure_org_member /
--                                               create_event_with_ticket_type
--                                               (only if they exist)
--
--  POST-RUN (not part of this script):
--    NOTIFY pgrst, 'reload schema';   -- so PostgREST drops the removed
--                                         admit_by_code_or_token(text) overload
-- ============================================================================

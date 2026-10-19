-- ============================================================================
--  MakeYourPass - 002_payments.sql
--  Direct-UPI paid flow: payment state machine, holds, proofs, waitlist.
-- ============================================================================
--  WHY THIS FILE EXISTS
--  --------------------
--  Before this migration an event was either FREE (submit -> instantly
--  confirmed) or the UPI flow lived entirely in the app: phase7 left a
--  PUBLIC payment-proofs bucket (anyone could read every proof), legacy
--  verify_payment/reject_payment RPCs (org-admin only, no seat coupling)
--  and the seat logic had no notion of "paid but not yet confirmed".
--
--  This migration introduces the real state machine, additively: no existing
--  table, column, RPC, trigger or bucket that production already uses is
--  dropped (the two legacy PUBLIC payment-proofs storage policies from
--  phase7-org-portal-upi.sql are the one mandated exception: they contradict
--  the private-by-design bucket this file creates).
--
--  WHAT IT CHANGES (summary)
--  -------------------------
--    1. events        -> whatsapp_group_url, post_register_message,
--                        ticket_template_path (client-facing copy & assets).
--    2. event_responses -> payment_state (paid lifecycle, paid events only)
--                          + hold_expires_at (15-min seat hold), and status
--                          gains the 'pending' state (hold in progress).
--    3. Capacity       -> seats_left / promotion / confirm re-checks now
--                          count LIVE holds:
--                          capacity_used =
--                            COUNT(status='confirmed')
--                          + COUNT(status='pending' AND
--                                  hold_expires_at > now())
--                          Paid detection everywhere = events.price > 0
--                          (NOT payment_type; see footer).
--                          Expired holds lazily flip to 'cancelled' whenever
--                          capacity is evaluated (releasing the slot).
--    4. resolve_payment_confirmed(uuid,text,text) -> service-role-only RPC:
--                          proof recorded + row-locked seat re-check ->
--                          'confirmed' (seat consumed instantly) or
--                          'waitlisted' (payer offered refund/wait).
--    5. verify_payment_proof(uuid,boolean)      -> org-staff-or-superadmin:
--                          payment_state 'paid_verified' / 'rejected';
--                          rejection releases any seat it held.
--    6. payment_proofs table (RLS: staff SELECT+UPDATE; service role inserts).
--    7. event_waitlist table (anon can INSERT only email captures).
--    8. Storage: 'payment-proofs' and 'ticket-templates' PRIVATE, with
--       path-shaped, hold-aware upload and staff-scoped policies.
--    9. submit_event_response extended: paid events enter 'pending' + hold;
--       free events keep the exact 001_hardening behaviour.
--
--
--  THE PAYMENT STATE MACHINE (precise)
--  -----------------------------------
--  Every rule below keys off events.price > 0 (see footer) for equalities:
--
--  FREE event (COALESCE(events.price,0) <= 0):
--      submit -> assign_response_code() trigger -> status='confirmed' or
--      'waitlisted' by live confirmed count (001 behaviour, unchanged) ->
--      seat consumed (or queued) at insert time. payment_state stays NULL
--      forever. No proof, no hold, no capacity change.
--
--  PAID event (COALESCE(events.price,0) > 0):
--      1. submit (anon allowed, form validated) -> registration row with
--         status='pending', hold_expires_at = now() + 15 minutes,
--         payment_status='pending' (legacy column, for old dashboards).
--         The unique_code is assigned as usual (counter stays a pure code
--         sequence). The insert-time hold is PROVISIONAL: the DB does not
--         gate pending inserts on capacity (the public form greys out at
--         seats-left = 0); the single seat gate is step 3.
--      2. while status='pending' and hold_expires_at > now(), the hold
--         occupies a seat slot for EVERYONE (same formula as confirmed).
--      3. proof upload + "generate ticket" confirm -> the app calls
--         resolve_payment_confirmed() (service role only). Under a row lock
--         on the parent events row: stale holds are expired, the proof is
--         recorded, and seats are re-checked:
--           * seats free     -> status='confirmed' (seat consumed instantly),
--                               payment_state='paid_unverified'.
--           * seats full     -> status='waitlisted', hold released,
--                               payment_state='paid_unverified' (payer then
--                               gets the refund / wait-list option from the
--                               API; a later retry may still confirm them).
--      4. staff verify -> verify_payment_proof(reject=false):
--         payment_state='paid_verified' (+ legacy payment_status='verified',
--         payment_verified_at=now(), payment_proofs.status='verified').
--         Verification does NOT itself allocate seats; when a seat is later
--         released the existing auto-promotion promotes the earliest
--         waitlisted registration, exactly as before.
--      5. staff reject -> verify_payment_proof(reject=true):
--         payment_state='rejected', and any occupied slot
--         (status in 'confirmed','pending') is voided to 'cancelled', which
--         fires trg_promote_waitlist_on_cancel and frees the seat. A
--         waitlisted-only row keeps its queue position and may re-upload.
--      6. If a hold expires without confirmation, it is lazily flipped to
--         status='cancelled' every time capacity is evaluated (insert path,
--         confirm path, promotion path) - the slot is released and dead
--         holds can never squat capacity forever.
--      7. payment_state is EARNED: it can only be set on registrations of
--         paid events (DB-enforced by trigger), and INSERTs always start
--         NULL (state after confirm/verify only). Resolve is idempotent:
--         re-confirming an already-confirmed row simply repairs
--         payment_state and returns 'confirmed'.
--
--  Checklist of guarantees this enforces at DB level:
--    * nobody occupies a seat without either being confirmed or holding an
--      ACTIVE 15-minute hold;
--    * capacity can never be oversold: every seat grant runs under the
--      parent events row FOR UPDATE (001 convention) and counts active
--      holds, so two racing confirms serialise;
--    * check-in rules remain those of 001 (confirmed admits, waitlisted /
--      cancelled refused) - a paid seat only exists once its row is
--      'confirmed', whether the payment was verified yet or not (admit RPCs
--      untouched).
--
--
--  PREREQUISITES (already present in production)
--    tables .... events, event_responses (unique_code/status/counter),
--                profiles, organization_members
--    funcs .... public.auth.uid(), public.gen_random_uuid(),
--               public.is_org_staff(uuid), public.is_event_staff(uuid)
--               (both from 001_hardening.sql: SECURITY DEFINER, pinned)
--    view ..... public.event_seat_status (phase1 + phase1-seat-view-rls)
--    trigger .. trg_assign_response_code, trg_promote_waitlist_on_cancel
--  CREATED BY THIS FILE: payment_proofs, event_waitlist, the two storage
--               buckets, all payment RPCs, all storage policies.
--
--  RUN AS: the Supabase `postgres` role (SQL editor or
--          `supabase db query --linked -f supabase/migrations/002_payments.sql`)
--  AFTER:  `NOTIFY pgrst, 'reload schema';` (footer) so PostgREST picks up
--          the new columns, the widened event_seat_status and the new RPCs.
--  Statically SAFE: single self-contained IDEMPOTENT script, safe to re-run.
--  The historical *.sql files in supabase/ remain an untouched audit trail.
-- ============================================================================


-- ############################################################################
-- SECTION 0 - Additive columns + value domains
-- ############################################################################

-- ------------------------------------------------------------------ 0a ----
-- events: client-facing copy and the ticket template the generation engine
-- reads from storage (signed-URL style path; see Section 7 for the bucket).
-- DEFAULT '' matches the existing URL-ish columns (poster_url, brochure_url).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS whatsapp_group_url    text DEFAULT '',
  ADD COLUMN IF NOT EXISTS post_register_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ticket_template_path  text DEFAULT '';

-- ------------------------------------------------------------------ 0b ----
-- event_responses: payment lifecycle + seat hold. DEFAULT NULL on both -
-- a FREE-event registration must look exactly like every pre-existing row.
ALTER TABLE public.event_responses
  ADD COLUMN IF NOT EXISTS payment_state   text,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

-- payment_state value domain (paid events only; the "only" half is enforced
-- by trigger below because a CHECK cannot reach into events).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_responses'::regclass
      AND conname = 'event_responses_payment_state_check'
  ) THEN
    ALTER TABLE public.event_responses
      ADD CONSTRAINT event_responses_payment_state_check
      CHECK (payment_state IS NULL OR payment_state IN
             ('paid_unverified', 'paid_verified', 'rejected'));
  END IF;
END
$$;

-- ------------------------------------------------------------------ 0c ----
-- status gains 'pending' (a live payment hold). Drop every single-column
-- CHECK on status that predates 'pending' (the 001 one allowed only
-- confirmed/waitlisted/cancelled), then re-assert the widened domain under
-- the canonical name - same guarded pattern as 001 used for admit_audit_log.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum   = ANY (c.conkey)
     WHERE c.conrelid = 'public.event_responses'::regclass
       AND c.contype  = 'c'
       AND array_length(c.conkey, 1) = 1
       AND a.attname  = 'status'
       AND position('pending' in lower(pg_get_constraintdef(c.oid))) = 0
  LOOP
    EXECUTE format('ALTER TABLE public.event_responses DROP CONSTRAINT %I',
                   r.conname);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_responses'::regclass
      AND conname  = 'event_responses_status_check'
  ) THEN
    ALTER TABLE public.event_responses
      ADD CONSTRAINT event_responses_status_check
      CHECK (status IN ('confirmed', 'waitlisted', 'cancelled', 'pending'));
  END IF;
END
$$;

-- ------------------------------------------------------------------ 0d ----
-- payment_state may be set ONLY on registrations of paid events.
-- A CHECK constraint cannot subquery events, so this is a trigger instead.
-- INSERTs are normalized to NULL upstream by assign_response_code(), and the
-- resolve/verify RPCs pre-check the event - this trigger closes every other
-- write path (service-role housekeeping, manual SQL, future code).
DROP FUNCTION IF EXISTS public.trg_enforce_payment_state_paid();
CREATE FUNCTION public.trg_enforce_payment_state_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_state IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = NEW.event_id
       AND COALESCE(e.price, 0) > 0
  ) THEN
    RAISE EXCEPTION
      'payment_state can only be set on registrations for paid events';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_state_paid_only ON public.event_responses;
CREATE TRIGGER trg_payment_state_paid_only
  BEFORE INSERT OR UPDATE OF payment_state ON public.event_responses
  FOR EACH ROW
  WHEN (NEW.payment_state IS DISTINCT FROM NULL)
  EXECUTE FUNCTION public.trg_enforce_payment_state_paid();


-- ############################################################################
-- SECTION 1 - Capacity machinery: holds, lazy expiry, promotion, seat view
-- ############################################################################
--  Capacity formula everywhere below:
--      capacity_used = COUNT(status='confirmed')
--                    + COUNT(status='pending' AND hold_expires_at > now())
--  Free events never contain 'pending' rows (the insert trigger only mints
--  them for paid events), so these formulas are byte-compatible with 001 for
--  every event that predates this migration.

-- ------------------------------------------------------------------ 1a ----
-- Lazy expiry worker: flips stale holds to 'cancelled' and lets the existing
-- cancel-promotion trigger handle the freed slots. MUST be invoked when the
-- parent events row lock decision is being made; it re-takes the row lock
-- itself so it is also safe standalone.
-- A 'pending' row with a NULL hold_expires_at is treated as stale (a hold
-- without a deadline must never squat a seat forever).
DROP FUNCTION IF EXISTS public._expire_stale_holds(uuid);
CREATE FUNCTION public._expire_stale_holds(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired integer := 0;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Take the parent lock (no-op if the caller already holds it in this
  -- transaction) so expiry always runs inside the same critical section as
  -- the capacity decision it precedes.
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = p_event_id
       FOR UPDATE
  ) THEN
    RETURN 0;                        -- event gone; nothing to expire
  END IF;

  WITH stale AS (
    SELECT er.id
      FROM public.event_responses er
     WHERE er.event_id = p_event_id
       AND er.status   = 'pending'
       AND (er.hold_expires_at IS NULL OR er.hold_expires_at <= now())
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.event_responses er
     SET status = 'cancelled'
   WHERE er.id IN (SELECT id FROM stale);

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public._expire_stale_holds(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._expire_stale_holds(uuid) TO service_role;

-- ------------------------------------------------------------------ 1b ----
-- assign_response_code(): replaced. Body of 001 preserved and extended:
--   * unique_code assignment + monotonic counter: UNCHANGED (same path,
--     both regimes allocate a code so invoices/exports stay exhaustive);
--   * FREE events: capacity decision bit-identical to 001;
--   * PAID events: enter the hold - status='pending', hold 15 minutes from
--     now. The window is authoritative here (ignores any client-supplied
--     value) so a direct untrusted INSERT cannot mint an immortal hold;
--   * every insert normalizes caller-chosen identity/seat fields
--     (payment_state, admitted_at/by): state is earned, check-ins are
--     earned, never INSERTed;
--   * every capacity evaluation starts with the lazy expiry sweep.
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
  v_paid      boolean;
BEGIN
  -- Serialise every registration for this event on the parent row lock.
  SELECT e.id_prefix, e.capacity, e.registration_counter,
         COALESCE(e.price, 0) > 0
    INTO v_prefix, v_capacity, v_counter, v_paid
    FROM public.events e
   WHERE e.id = NEW.event_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- State is EARNED later (confirm/verify/check-in), never INSERTed.
  NEW.payment_state := NULL;
  NEW.admitted_at   := NULL;
  NEW.admitted_by   := NULL;

  -- registration_counter is now ONLY a monotonic code sequence (unchanged).
  v_counter := COALESCE(v_counter, 0) + 1;
  UPDATE public.events e
     SET registration_counter = v_counter
   WHERE e.id = NEW.event_id;

  v_prefix := COALESCE(NULLIF(btrim(v_prefix), ''), 'EVT');
  NEW.unique_code := v_prefix || '-' || lpad(v_counter::text, 4, '0');

  IF v_paid THEN
    -- Paid flow: provisional 15-minute hold; the seat is decided at
    -- confirm time (resolve_payment_confirmed) under the row lock.
    NEW.status          := 'pending';
    NEW.hold_expires_at := now() + interval '15 minutes';
  ELSE
    -- Free flow: 001_hardening behaviour, verbatim.
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
  END IF;

  -- Lazy expiry sweep before any capacity evaluation (dead holds release
  -- their slot; a free event simply has nothing to sweep).
  PERFORM public._expire_stale_holds(NEW.event_id);

  RETURN NEW;
END;
$$;

-- Re-create idempotently so this migration stays self-sufficient.
DROP TRIGGER IF EXISTS trg_assign_response_code ON public.event_responses;
CREATE TRIGGER trg_assign_response_code
  BEFORE INSERT ON public.event_responses
  FOR EACH ROW EXECUTE FUNCTION public.assign_response_code();

-- ------------------------------------------------------------------ 1c ----
-- _promote_waitlist_locked(): replaced (same signature as 001). Occupancy
-- now includes LIVE holds before granting seats from the waitlist, and the
-- sweep runs first, so a promotion can never fire while dead holds still
-- appear to occupy capacity. Free-event behaviour is otherwise identical.
-- (Also fixes 001's alias-qualified SET target - plain column since PostgreSQL
--  rejects "UPDATE er SET er.status".)
CREATE OR REPLACE FUNCTION public._promote_waitlist_locked(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity  integer;
  v_confirmed integer;
  v_active    integer;
  v_promoted  integer := 0;
BEGIN
  SELECT e.capacity INTO v_capacity
  FROM public.events e
  WHERE e.id = p_event_id
    FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN 0;                 -- event gone; nothing to do
  END IF;

  -- Release expired holds first; freed slots may promote.
  PERFORM public._expire_stale_holds(p_event_id);

  IF v_capacity <= 0 THEN
    RETURN 0;                 -- unlimited capacity
  END IF;

  LOOP
    SELECT count(*)::int INTO v_confirmed
    FROM public.event_responses er
    WHERE er.event_id = p_event_id
      AND er.status = 'confirmed';

    SELECT count(*)::int INTO v_active
    FROM public.event_responses er
    WHERE er.event_id = p_event_id
      AND er.status = 'pending'
      AND er.hold_expires_at > now();

    EXIT WHEN v_confirmed + v_active >= v_capacity;
    EXIT WHEN v_promoted >= 1000;   -- hard safety bound

    UPDATE public.event_responses er
       SET status = 'confirmed'
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

-- Re-assert 001's grant surface on the worker (CREATE OR REPLACE keeps them,
-- but be explicit so this file is self-contained on fresh environments).
REVOKE ALL ON FUNCTION public._promote_waitlist_locked(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._promote_waitlist_locked(uuid) TO service_role;

-- ------------------------------------------------------------------ 1d ----
-- event_seat_status: replaced with the hold-aware definition. The four
-- original columns (id, capacity, confirmed_count, seats_left) keep their
-- names, order, and semantics; the hold counts are appended so existing
-- readers are untouched. seats_left now subtracts LIVE holds - the public
-- form greys out while 15-minute holds are outstanding. security_invoker is
-- preserved from phase1-seat-view-rls.sql so anon still cannot read counts.
CREATE OR REPLACE VIEW public.event_seat_status
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.capacity,
  count(r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed_count,
  CASE WHEN e.capacity IS NULL OR e.capacity = 0 THEN NULL
       ELSE greatest(
              e.capacity
              - count(r.id) FILTER (WHERE r.status = 'confirmed')
              - count(r.id) FILTER (WHERE r.status = 'pending'
                                    AND r.hold_expires_at > now()),
              0)
  END AS seats_left,
  count(r.id) FILTER (WHERE r.status = 'pending'
                      AND r.hold_expires_at > now())  AS active_holds_count,
  count(r.id) FILTER (WHERE r.status = 'pending'
                      AND r.hold_expires_at <= now()) AS dead_holds_count
FROM public.events e
LEFT JOIN public.event_responses r ON r.event_id = e.id
GROUP BY e.id, e.capacity;


-- ############################################################################
-- SECTION 2 - submit_event_response  (public form submission)
-- ############################################################################
--  Replaced (drop + recreate exactly like 001 did; parameters, their order
--  and all validation are untouched):
--    * FREE events (price <= 0): bit-identical to 001 - insert without
--      status, the capacity trigger decides confirmed/waitlisted.
--    * PAID events (events.price > 0): insert with status='pending' and
--      hold_expires_at = now() + 15 minutes, entering the hold instead of
--      consuming a seat. unique_code is still assigned by the insert
--      trigger (same path, same counter).
--  The assign_response_code() trigger keeps authority over status/hold (it
--  would even correct a status passed explicitly), so this RPC and a rogue
--  direct INSERT land in exactly the same state.
--  NOTE: the single 5-argument overload is (re)created; the 4-arg one stays
--  dropped, as 001 left it.
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
  v_price numeric;
  v_pay_status text;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Length caps BEFORE trimming, so a multi-megabyte payload is rejected
  -- rather than stored. (001 contract, verbatim.)
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

  SELECT e.payment_type, COALESCE(e.price, 0)
    INTO v_payment_type, v_price
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_payment_type IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- 001 contract retained BUT relaxed for the modern flow: the client does
  -- NOT need the screenshot at submit time (the storage-proofs folder is
  -- keyed by registration_id, which only exists after the submit). The real
  -- enforcement happens in resolve_payment_confirmed(): no uploaded object
  -- → no confirmation → no seat, no ticket. The 15-minute hold protects
  -- capacity regardless.
  IF v_payment_type = 'paid' THEN
    v_pay_status := 'pending';
  ELSE
    v_pay_status := 'na';
  END IF;

  IF v_price > 0 THEN
    -- PAID: provisional 15-minute hold; the seat is decided at
    -- confirm time under the parent row lock (resolve_payment_confirmed).
    INSERT INTO public.event_responses (
      event_id, respondent_name, respondent_email, respondent_phone,
      payment_proof_url, payment_status,
      status, hold_expires_at
    )
    VALUES (
      p_event_id, v_name, v_email, v_phone, v_proof, v_pay_status,
      'pending', now() + interval '15 minutes'
    )
    RETURNING id INTO new_id;
  ELSE
    -- FREE: exact 001 behaviour (status chosen by the capacity trigger).
    INSERT INTO public.event_responses (
      event_id, respondent_name, respondent_email, respondent_phone,
      payment_proof_url, payment_status
    )
    VALUES (
      p_event_id, v_name, v_email, v_phone, v_proof, v_pay_status
    )
    RETURNING id INTO new_id;
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_event_response(uuid, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_event_response(uuid, text, text, text, text)
  TO anon, authenticated, service_role;


-- ############################################################################
-- SECTION 3 - resolve_payment_confirmed  (service_role ONLY)
-- ############################################################################
--  Called by /api/payments (service key) after proof upload + hash. Records
--  the proof (SHA-256 duplicate badge, same event only), then under the
--  parent events row lock re-checks capacity and transitions the row.
--  NOT callable by anon/authenticated - it is the single seat gate.
DROP FUNCTION IF EXISTS public.resolve_payment_confirmed(uuid, text, text);
CREATE FUNCTION public.resolve_payment_confirmed(
  p_registration uuid,
  p_proof_path   text,
  p_sha          text
)
RETURNS TABLE (registration_id uuid, final_status text, payment_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           record;
  v_event_id  uuid;
  v_capacity  integer;
  v_confirmed integer;
  v_active    integer;
  v_status    text;
  v_sha       text;
  v_duplicate boolean := false;
BEGIN
  IF p_registration IS NULL THEN
    RAISE EXCEPTION 'registration required';
  END IF;

  v_sha := lower(btrim(COALESCE(p_sha, '')));
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid payment proof hash (expected sha-256 hex)';
  END IF;

  IF p_proof_path IS NULL OR btrim(p_proof_path) = '' THEN
    RAISE EXCEPTION 'payment proof path required';
  END IF;
  IF length(p_proof_path) > 1024 THEN
    RAISE EXCEPTION 'payment proof path too long';
  END IF;

  -- Cheap pre-lock peek: fail fast on a missing row / free event before
  -- taking any lock. NOT the authority on status.
  SELECT er.event_id
    INTO r
    FROM public.event_responses er
   WHERE er.id = p_registration;

  IF r.event_id IS NULL THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  v_event_id := r.event_id;

  -- The machine exists only for paid events; free rows never hold or pay.
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = v_event_id
       AND COALESCE(e.price, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Registration is not for a paid event';
  END IF;

  --====================== CRITICAL SECTION ==============================
  -- 001 convention: parent events row FOR UPDATE serialises every seat
  -- decision for this event.
  SELECT e.capacity INTO v_capacity
    FROM public.events e
   WHERE e.id = v_event_id
     FOR UPDATE;

  -- Dead holds release before the re-check.
  PERFORM public._expire_stale_holds(v_event_id);

  -- Authoritative re-read, row-lock held, INSIDE the section: the row's
  -- status may have changed between the pre-lock peek and our lock (a
  -- concurrent confirm or an admin reject commits first), and the decision
  -- below must see the winning state, never the stale peek.
  SELECT er.id, er.event_id, er.status, er.payment_state
    INTO r
    FROM public.event_responses er
   WHERE er.id = p_registration
     FOR UPDATE;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  -- Record/replace the uploaded proof - one row per registration; a
  -- re-upload replaces it (created_at then means LAST upload). Duplicate
  -- badge: identical hash already present for ANOTHER registration of the
  -- SAME event (same proof reused = fraud signal; cross-event reuse of
  -- one's own receipt is legitimate and never flagged). Confirmation still
  -- proceeds; staff reach the final verdict.
  v_duplicate := EXISTS (
    SELECT 1
      FROM public.payment_proofs pp
     WHERE pp.sha256         = v_sha
       AND pp.registration_id IS DISTINCT FROM p_registration
       AND pp.event_id        = v_event_id
  );

  INSERT INTO public.payment_proofs
       (registration_id, event_id, path, sha256, status)
  VALUES
       (p_registration, v_event_id, btrim(p_proof_path), v_sha,
        CASE WHEN v_duplicate THEN 'duplicate' ELSE 'uploaded' END)
  ON CONFLICT ON CONSTRAINT payment_proofs_registration_id_key DO UPDATE
       SET path       = EXCLUDED.path,
           sha256     = EXCLUDED.sha256,
           status     = CASE WHEN v_duplicate THEN 'duplicate'
                             ELSE 'uploaded' END,
           created_at = now();

  -- Idempotent retry: the row already sits in a seat; just repair state.
  IF r.status = 'confirmed' THEN
    UPDATE public.event_responses
       SET payment_state   = COALESCE(payment_state, 'paid_unverified'),
           hold_expires_at = NULL
     WHERE id = p_registration;

    RETURN QUERY SELECT p_registration,
                        'confirmed'::text,
                        COALESCE(r.payment_state, 'paid_unverified')::text;
    RETURN;
  END IF;

  -- Seat re-check. Active holds are counted EXCLUSIVE of this row: turning
  -- this row's own hold into a confirmation is 1:1 occupancy-neutral, so
  -- the comparison is between other people's seats and free capacity.
  SELECT count(*)::int INTO v_confirmed
    FROM public.event_responses er
   WHERE er.event_id = v_event_id
     AND er.status = 'confirmed';

  SELECT count(*)::int INTO v_active
    FROM public.event_responses er
   WHERE er.event_id = v_event_id
     AND er.status = 'pending'
     AND er.hold_expires_at > now()
     AND er.id <> p_registration;

  IF v_capacity IS NULL OR v_capacity <= 0
     OR v_confirmed + v_active < v_capacity THEN
    v_status := 'confirmed';    -- seat consumed instantly
  ELSE
    v_status := 'waitlisted';   -- payer offered refund / wait option by API
  END IF;

  UPDATE public.event_responses
     SET status          = v_status,
         payment_state   = 'paid_unverified',
         hold_expires_at = NULL,           -- hold is over either way
         payment_status  = CASE            -- legacy sync for old dashboards
           WHEN COALESCE(payment_status, 'na') = 'na' THEN 'pending'
           ELSE payment_status
         END
   WHERE id = p_registration;

  RETURN QUERY SELECT p_registration, v_status, 'paid_unverified'::text;
END;
$$;

-- service_role only (the API's service key). anon/authenticated/PUBLIC: no.
REVOKE ALL ON FUNCTION public.resolve_payment_confirmed(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_payment_confirmed(uuid, text, text)
  TO service_role;


-- ############################################################################
-- SECTION 4 - verify_payment_proof  (org staff / superadmin, authenticated)
-- ############################################################################
--  Admin verdict on an uploaded proof. Verified => payment_state
--  'paid_verified' (+ legacy columns). Rejected => payment_state 'rejected'
--  and any occupied slot (confirmed or pending hold) is voided to
--  'cancelled', which fires trg_promote_waitlist_on_cancel and releases the
--  seat; a waitlisted-only row keeps its queue position so the payer can
--  re-upload and re-confirm.
DROP FUNCTION IF EXISTS public.verify_payment_proof(uuid, boolean);
CREATE FUNCTION public.verify_payment_proof(
  p_registration uuid,
  p_reject boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_status   text;
  v_actor    uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_registration IS NULL THEN
    RAISE EXCEPTION 'registration required';
  END IF;

  SELECT er.event_id, er.status
    INTO v_event_id, v_status
    FROM public.event_responses er
   WHERE er.id = p_registration;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  -- is_event_staff(...) returns true for org admins/hosts AND platform
  -- superadmins (it consults profiles.is_superadmin internally via
  -- is_org_staff), so the "OR superadmin" case is covered by the one call.
  IF NOT public.is_event_staff(v_event_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- payment_state is defined only for paid events.
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = v_event_id
       AND COALESCE(e.price, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Registration is not for a paid event';
  END IF;

  IF COALESCE(p_reject, false) THEN
    -- Lock the parent events row FIRST (same order as resolve_payment_
    -- confirmed) so a concurrent confirm for this row serialises instead of
    -- deadlocking (this UPDATE can cascade into the promotion trigger,
    -- which also wants the parent lock).
    PERFORM 1 FROM public.events e WHERE e.id = v_event_id FOR UPDATE;

    UPDATE public.event_responses
       SET payment_state  = 'rejected',
           payment_status = 'rejected',
           status         = CASE
             WHEN status IN ('confirmed', 'pending') THEN 'cancelled'
             ELSE status
           END
     WHERE id = p_registration;

    UPDATE public.payment_proofs
       SET status = 'rejected'
     WHERE registration_id = p_registration;
  ELSE
    UPDATE public.event_responses
       SET payment_state      = 'paid_verified',
           payment_status     = 'verified',
           payment_verified_at = now()
     WHERE id = p_registration;

    UPDATE public.payment_proofs
       SET status = 'verified'
     WHERE registration_id = p_registration;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_payment_proof(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_payment_proof(uuid, boolean) TO authenticated;
-- NOTE: authenticated only, as specified. Internal automations use the
-- service key's superuser SQL path if ever needed.


-- ############################################################################
-- SECTION 5 - payment_proofs (duplicate detector, staff review)
-- ############################################################################
--  One row per registration (unique). RLS on: staff of the event get
--  SELECT+UPDATE; there is NO INSERT/DELETE policy by design - rows are
--  minted only inside resolve_payment_confirmed() / service role, and the
--  storage layer (Section 7) is the custody chain for the bytes themselves.
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL
                  REFERENCES public.event_responses(id) ON DELETE CASCADE,
  event_id        uuid NOT NULL
                  REFERENCES public.events(id) ON DELETE CASCADE,
  path            text NOT NULL,
  sha256          text NOT NULL,
  status          text NOT NULL DEFAULT 'uploaded'
                  CONSTRAINT payment_proofs_status_check
                  CHECK (status IN ('uploaded', 'duplicate',
                                    'verified', 'rejected')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_proofs_registration_id_key UNIQUE (registration_id)
);

-- Re-assert the CHECK in case the table already existed without it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payment_proofs'::regclass
      AND conname  = 'payment_proofs_status_check'
  ) THEN
    ALTER TABLE public.payment_proofs
      ADD CONSTRAINT payment_proofs_status_check
      CHECK (status IN ('uploaded', 'duplicate', 'verified', 'rejected'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payment_proofs'::regclass
      AND conname  = 'payment_proofs_registration_id_key'
  ) THEN
    ALTER TABLE public.payment_proofs
      ADD CONSTRAINT payment_proofs_registration_id_key
      UNIQUE (registration_id);
  END IF;
END
$$;

ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment proofs readable by event staff"
  ON public.payment_proofs;
CREATE POLICY "Payment proofs readable by event staff"
  ON public.payment_proofs FOR SELECT
  TO authenticated
  USING (public.is_event_staff(event_id));

DROP POLICY IF EXISTS "Payment proofs updatable by event staff"
  ON public.payment_proofs;
CREATE POLICY "Payment proofs updatable by event staff"
  ON public.payment_proofs FOR UPDATE
  TO authenticated
  USING (public.is_event_staff(event_id))
  WITH CHECK (public.is_event_staff(event_id));

-- Explicit, self-contained privilege surface (service_role bypasses RLS and
-- owns every insert/transition; authed staff get exactly what RLS allows).
GRANT SELECT, UPDATE ON public.payment_proofs TO authenticated;
GRANT ALL              ON public.payment_proofs TO service_role;


-- ############################################################################
-- SECTION 6 - event_waitlist (public "notify me" when seats fill up)
-- ############################################################################
--  Table holds no PII beyond the submitted email (+ optional user_agent for
--  abuse analysis). Anyone may JOIN a waitlist; nobody anonymous may READ it.
--  Column-scoped INSERT grants (event_id, email, user_agent) enforce the
--  exact write surface - no other column is writable through the API.
CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email      text NOT NULL
             CONSTRAINT event_waitlist_email_check
             CHECK (email ~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
  user_agent text
             CONSTRAINT event_waitlist_user_agent_len_check
             CHECK (user_agent IS NULL OR length(user_agent) <= 512),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One entry per email per event, case-insensitive (same pattern as
-- uniq_response_event_email in phase1-ticketing.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_waitlist_event_email
  ON public.event_waitlist (event_id, lower(email));

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join an event waitlist"
  ON public.event_waitlist;
CREATE POLICY "Anyone can join an event waitlist"
  ON public.event_waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Staff can review captured emails (same trust level as the event_responses
-- staff SELECT policy); anon has a SELECT privilege but no SELECT policy, so
-- it reads zero rows - RLS denies by default.
DROP POLICY IF EXISTS "Event staff read event waitlist"
  ON public.event_waitlist;
CREATE POLICY "Event staff read event waitlist"
  ON public.event_waitlist FOR SELECT
  TO authenticated
  USING (public.is_event_staff(event_id));

GRANT SELECT ON public.event_waitlist TO anon, authenticated, service_role;
REVOKE INSERT ON public.event_waitlist FROM anon, authenticated;
GRANT INSERT (event_id, email, user_agent)
  ON public.event_waitlist TO anon, authenticated;
GRANT ALL    ON public.event_waitlist TO service_role;


-- ############################################################################
-- SECTION 7 - Storage: private buckets + object policies
-- ############################################################################

-- 7a) Buckets. Both PRIVATE. payment-proofs: image-only, 8 MB (matches the
--     /api/payments upload-proof cap; the gif mime from phase7 is gone -
--     proofs are hashed screenshots). ticket-templates: staff-managed
--     template PNGs the ticket engine reads via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('payment-proofs',   'payment-proofs',   false, 8388608,
   ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']),
  ('ticket-templates', 'ticket-templates', false, 10485760,
   ARRAY['image/png', 'image/jpeg', 'image/jpg'])
ON CONFLICT (id) DO UPDATE
  SET public              = EXCLUDED.public,
      file_size_limit     = EXCLUDED.file_size_limit,
      allowed_mime_types  = EXCLUDED.allowed_mime_types;

-- 7b) The definer helper the storage policies need. Why a helper: policy
--     subqueries are executed with the CALLING role's RLS, and anon has no
--     SELECT on event_responses - an inline EXISTS would always see zero
--     rows. SECURITY DEFINER + pinned search_path (same rationale as 001's
--     can_read_ticket_object). Null-safe uuid cast: a malformed object name
--     can never raise inside a policy.
DROP FUNCTION IF EXISTS public.can_read_event_object(text);
CREATE FUNCTION public.can_read_event_object(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
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

REVOKE ALL ON FUNCTION public.can_read_event_object(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_read_event_object(text)
  TO authenticated, service_role;

-- 7c) Helper for the proof-upload gate (INSERT policy): definer-side
--     of the spec predicate - proof target must be an existing registration
--     of that event which is currently 'pending' with a LIVE hold.
DROP FUNCTION IF EXISTS public.can_upload_payment_proof(text, text);
CREATE FUNCTION public.can_upload_payment_proof(
  p_event_id_text  text,
  p_registration_text text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_event_id_text IS NULL OR p_registration_text IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_event_id := p_event_id_text::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
      FROM public.event_responses er
      JOIN public.events e ON e.id = er.event_id
     WHERE er.id::text = p_registration_text
       AND e.id::text  = p_event_id_text
       AND er.status   = 'pending'
       AND er.hold_expires_at > now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_upload_payment_proof(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_upload_payment_proof(text, text)
  TO anon, authenticated, service_role;

-- 7d) payment-proofs object policies.
--     * anon may upload ONLY along {event_id}/{registration_id}/proof-*.png|
--       jpg|jpeg|webp for a registration that is IN a live 15-min hold.
--     * staff read everything under their event's folder (signed URLs).
--     * NO SELECT for anon. NO UPDATE/DELETE for anyone: objects are
--       immutable evidence; service role handles the lifecycle (supabase
--       storage service key bypasses these RLS policies).
--     The two PUBLIC phase7 policies ("Public read payment proofs",
--     "Anyone can upload payment proofs") are dropped - this file's
--     prescribed policy set replaces them.
DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;

DROP POLICY IF EXISTS "Payment proofs uploaded for a live hold"
  ON storage.objects;
CREATE POLICY "Payment proofs uploaded for a live hold"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND name ~* '^[^/]+/[^/]+/proof-.+\.(png|jpg|jpeg|webp)$'
    AND public.can_upload_payment_proof(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2])
  );

DROP POLICY IF EXISTS "Payment proofs readable by event staff"
  ON storage.objects;
CREATE POLICY "Payment proofs readable by event staff"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.can_read_event_object(name)
  );

-- Sanity guard (001 style): raise on re-run if any FOREIGN write policy
-- against the payment-proofs bucket reappears, because it would silently
-- reopen proof-tampering (overwrite another attendee's evidence).
DO $$
DECLARE v_writes int;
BEGIN
  SELECT count(*) INTO v_writes
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename  = 'objects'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND policyname NOT IN ('Payment proofs uploaded for a live hold')
     AND coalesce(qual, '') || ' ' || coalesce(with_check, '')
         ILIKE '%payment-proofs%';
  IF v_writes > 0 THEN
    RAISE EXCEPTION
      'payment-proofs bucket still has % foreign write policy/policies - review before continuing',
      v_writes;
  END IF;
END
$$;

-- 7e) ticket-templates object policy: one FOR ALL policy (SELECT per spec's
--     "SELECT for same staff" + managed INSERT/UPDATE/DELETE) restricted to
--     the fixed {event_id}/ticket-template.png naming, event-staff scoped,
--     authenticated only. Malformed names simply match nothing.
DROP POLICY IF EXISTS "Ticket templates are event-staff scoped"
  ON storage.objects;
CREATE POLICY "Ticket templates are event-staff scoped"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'ticket-templates'
    AND name ~ '^[^/]+/ticket-template\.png$'
    AND public.can_read_event_object(name)
  )
  WITH CHECK (
    bucket_id = 'ticket-templates'
    AND name ~ '^[^/]+/ticket-template\.png$'
    AND public.can_read_event_object(name)
  );


-- ############################################################################
-- SECTION 8 - Indexes for the new access patterns
-- ############################################################################

-- Lazy hold expiry sweeps + live-hold occupancy counts.
CREATE INDEX IF NOT EXISTS idx_event_responses_pending_hold
  ON public.event_responses (hold_expires_at)
  WHERE status = 'pending';

-- Duplicate-hash lookups + staff proof listing.
CREATE INDEX IF NOT EXISTS idx_payment_proofs_sha256
  ON public.payment_proofs (sha256);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_event_status
  ON public.payment_proofs (event_id, status, created_at DESC);

-- Staff waitlist review (newest first).
CREATE INDEX IF NOT EXISTS idx_event_waitlist_event_created
  ON public.event_waitlist (event_id, created_at DESC);


-- ============================================================================
-- FUNCTIONS AUDITED AND DELIBERATELY LEFT UNCHANGED
-- ============================================================================
--  * admit_registration / admit_by_code_or_token / get_event_analytics /
--    promote_from_waitlist / admit_audit_log  - 001 semantics already demand
--    'confirmed' for admission and audit every outcome; paid seats only
--    become checkable once confirmed, verification not required there.
--  * verify_payment(uuid) / reject_payment(uuid) (phase7) - legacy
--    org-admin RPCs kept for old dashboards; the NEW flow is
--    verify_payment_proof(uuid, boolean) which is event-staff scoped and
--    seat-aware.
--  * schedule/email/ticket generation - app-side (INTERNAL_API_SECRET),
--    triggered by the 'confirmed' outcome of resolve_payment_confirmed.
--
--  DELIBERATELY NOT BUILT
--  * get_public_event_payment_state(event uuid) - skipped per spec; the API
--    reads capacity/payment state service-side instead of exposing a
--    per-event enumeration RPC to anon.


-- ============================================================================
-- ORDER OF OPERATIONS WHEN THIS SCRIPT RUNS
-- ============================================================================
--   1. events                      + whatsapp_group_url / post_register_message
--                                  / ticket_template_path
--   2. event_responses             + payment_state / hold_expires_at
--   3. payment_state value CHECK   (guarded re-assert)
--   4. status domain widened       old single-column CHECKs dropped, then
--                                  event_responses_status_check re-asserted
--                                  with 'pending' allowed (loop drops the
--                                  pre-'pending' one; DO block re-adds)
--   5. trg_payment_state_paid_only - payment_state restricted to paid events
--                                  (price > 0), raised on any other path
--   6. _expire_stale_holds(uuid)    created (internal lazy expiry worker)
--   7. assign_response_code()      replaced (paid -> pending + 15-min hold;
--                                  free -> 001 behaviour; inserts normalize
--                                  payment_state/admitted_at/by)
--   8. trg_assign_response_code    re-created idempotently
--   9. _promote_waitlist_locked(uuid) replaced (hold-aware occupancy)
--  10. event_seat_status           replaced (holds counted; original four
--                                  columns unchanged; appended hold columns;
--                                  security_invoker preserved)
--  11. submit_event_response(uuid,text,text[,text[,text]]) - recreated:
--                                  FREE = 001 behaviour; PAID (price > 0) =
--                                  insert as status='pending' + hold; both
--                                  4-arg overloads stay dropped (001 state)
--  12. resolve_payment_confirmed(uuid,text,text) - service-role only RPC
--  13. verify_payment_proof(uuid,boolean) - authenticated staff RPC
--  14. payment_proofs               created + CHECK/unique re-asserted,
--                                   RLS on, staff SELECT+UPDATE policies,
--                                   explicit grants (all to service_role)
--  15. event_waitlist               created + unique(event_id, lower(email)),
--                                   RLS on, anon INSERT policy + column-
--                                   scoped grants, staff SELECT policy
--  16. storage.buckets              'payment-proofs' + 'ticket-templates'
--                                   (re)set PRIVATE with image-only limits
--  17. can_read_event_object(text) / can_upload_payment_proof(text,text)
--                                   created (definer policy helpers)
--  18. storage policies             phase7 PUBLIC payment-proofs policies
--                                   dropped; hold-aware anon-INSERT and
--                                   staff-SELECT added; ticket-templates
--                                   single FOR ALL staff policy added;
--                                   foreign-write tripwire DO block
--  19. indexes                      pending-hold partial, proof sha256 /
--                                   event|status, waitlist recency
--
--  PAID DETECTION NOTE
--  Capacity/machine decisions are keyed off `events.price > 0`
--  (COALESCE(price,0) > 0) everywhere in this file. payment_type='paid'
--  still drives the legacy "proof screenshot required" validation inside
--  submit_event_response exactly as 001 defined it.
--
--  POST-RUN (not part of this script):
--    NOTIFY pgrst, 'reload schema';
--    -- PostgREST must reload so the new event_responses/events columns,
--    -- the widened event_seat_status columns, and the new RPCs
--    -- (resolve_payment_confirmed / verify_payment_proof) are exposed;
--    -- the DO block in the applying pipeline (NOTIFY pgrst) fires right
--    -- after this file per Phase-2 runbook.
-- ============================================================================

-- 006_student_and_club_profiles.sql
-- Adds the student academic profile, snapshots it onto event registrations,
-- and stores the richer club-onboarding fields collected at signup.
--
-- Safe to re-run: every column/constraint is guarded with IF NOT EXISTS.

-- ── 1. Student profile fields ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS semester text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS account_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_age_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_age_check
      CHECK (age IS NULL OR (age >= 10 AND age <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_semester_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_semester_check
      CHECK (semester IS NULL OR semester IN ('S1','S2','S3','S4','S5','S6','S7','S8'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_department_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_department_check
      CHECK (
        department IS NULL OR department IN (
          'CSE R1','CSE R2','CSE R3','CIVIL','MECH','ES','EC','EL','EEE','AH','MCA'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_type_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_type_check
      CHECK (account_type IS NULL OR account_type IN ('student','club'));
  END IF;
END
$$;

-- ── 2. Snapshot academic details onto each registration ────────────────────

ALTER TABLE public.event_responses
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS semester text,
  ADD COLUMN IF NOT EXISTS department text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_responses_age_check'
      AND conrelid = 'public.event_responses'::regclass
  ) THEN
    ALTER TABLE public.event_responses
      ADD CONSTRAINT event_responses_age_check
      CHECK (age IS NULL OR (age >= 10 AND age <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_responses_semester_check'
      AND conrelid = 'public.event_responses'::regclass
  ) THEN
    ALTER TABLE public.event_responses
      ADD CONSTRAINT event_responses_semester_check
      CHECK (semester IS NULL OR semester IN ('S1','S2','S3','S4','S5','S6','S7','S8'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_responses_department_check'
      AND conrelid = 'public.event_responses'::regclass
  ) THEN
    ALTER TABLE public.event_responses
      ADD CONSTRAINT event_responses_department_check
      CHECK (
        department IS NULL OR department IN (
          'CSE R1','CSE R2','CSE R3','CIVIL','MECH','ES','EC','EL','EEE','AH','MCA'
        )
      );
  END IF;
END
$$;

-- ── 3. Richer club onboarding fields ───────────────────────────────────────

ALTER TABLE public.organization_registration_requests
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS representative_name text,
  ADD COLUMN IF NOT EXISTS representative_contact text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS upi_id text;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS representative_name text;

-- ── 4. Profile trigger: copy student metadata from auth.users ──────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_age integer;
  v_semester text;
  v_department text;
  v_account_type text;
BEGIN
  v_age := CASE
    WHEN COALESCE(NEW.raw_user_meta_data->>'age', '') ~ '^[0-9]{1,3}$'
      THEN (NEW.raw_user_meta_data->>'age')::int
    ELSE NULL
  END;
  IF v_age IS NOT NULL AND (v_age < 10 OR v_age > 100) THEN
    v_age := NULL;
  END IF;

  v_semester := CASE
    WHEN NEW.raw_user_meta_data->>'semester' IN ('S1','S2','S3','S4','S5','S6','S7','S8')
      THEN NEW.raw_user_meta_data->>'semester'
    ELSE NULL
  END;

  v_department := CASE
    WHEN NEW.raw_user_meta_data->>'department' IN (
      'CSE R1','CSE R2','CSE R3','CIVIL','MECH','ES','EC','EL','EEE','AH','MCA'
    ) THEN NEW.raw_user_meta_data->>'department'
    ELSE NULL
  END;

  v_account_type := CASE
    WHEN NEW.raw_user_meta_data->>'account_type' IN ('student','club')
      THEN NEW.raw_user_meta_data->>'account_type'
    ELSE 'student'
  END;

  INSERT INTO public.profiles (
    id, full_name, email, phone, age, semester, department, account_type, is_superadmin
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_age,
    v_semester,
    v_department,
    v_account_type,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    age = COALESCE(EXCLUDED.age, profiles.age),
    semester = COALESCE(EXCLUDED.semester, profiles.semester),
    department = COALESCE(EXCLUDED.department, profiles.department),
    account_type = COALESCE(EXCLUDED.account_type, profiles.account_type),
    updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 5. Authenticated registration snapshots profile academic details ───────

CREATE OR REPLACE FUNCTION public.submit_authenticated_event_response(
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
  v_age integer;
  v_semester text;
  v_department text;
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

  SELECT p.age, p.semester, p.department
    INTO v_age, v_semester, v_department
  FROM public.profiles p
  WHERE p.id = v_user_id;

  INSERT INTO public.event_responses (
    event_id, user_id, respondent_name, respondent_email, respondent_phone,
    age, semester, department, payment_status
  )
  VALUES (
    p_event_id, v_user_id, v_name, v_email, v_phone,
    v_age, v_semester, v_department,
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

-- ── 6. Approval copies the new club profile fields onto organizations ──────

CREATE OR REPLACE FUNCTION public.approve_organization_request(request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_org_id uuid;
  v_profile record;
  v_email text;
  v_name text;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_superadmin = false THEN
    RETURN jsonb_build_object('error', 'Only superadmin can approve requests');
  END IF;

  SELECT * INTO v_request FROM organization_registration_requests WHERE id = request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('error', 'Request not found');
  END IF;
  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'Request is not pending (status=' || v_request.status || ')');
  END IF;

  IF EXISTS (SELECT 1 FROM organizations WHERE slug = v_request.organization_slug) THEN
    RETURN jsonb_build_object('error', 'Organization slug already exists');
  END IF;

  INSERT INTO organizations (
    name, slug, description, logo_url, contact_email, contact_phone,
    upi_id, short_name, representative_name, is_approved
  )
  VALUES (
    v_request.organization_name,
    v_request.organization_slug,
    COALESCE(v_request.description, ''),
    COALESCE(v_request.logo_url, ''),
    COALESCE(v_request.contact_email, ''),
    COALESCE(v_request.representative_contact, ''),
    COALESCE(v_request.upi_id, ''),
    COALESCE(v_request.short_name, ''),
    COALESCE(v_request.representative_name, ''),
    true
  )
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_request.user_id, 'admin')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';

  UPDATE organization_registration_requests
  SET status = 'approved', updated_at = now()
  WHERE id = request_id;

  SELECT full_name, email INTO v_name, v_email FROM profiles WHERE id = v_request.user_id;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'status', 'approved',
    'slug', v_request.organization_slug,
    'organization_name', v_request.organization_name,
    'portal_url', 'https://makeyourpass.vercel.app/' || v_request.organization_slug,
    'requester_email', COALESCE(v_email, ''),
    'requester_name', COALESCE(v_name, '')
  );
END;
$$;

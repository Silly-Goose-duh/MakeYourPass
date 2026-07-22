-- ============================================================
-- Phase 7 — Org portal, UPI payments, templates, certificates
-- Idempotent. Run via: supabase db query --linked -f ...
-- ============================================================

-- ── Organizations: UPI + portal assets ──
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS upi_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS upi_qr_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT '';

-- ── Execom roster (Discord-style member list by role) ──
CREATE TABLE IF NOT EXISTS org_execom_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT 'Member',
  photo_url TEXT DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execom_org ON org_execom_members(organization_id, role_title, sort_order);

ALTER TABLE org_execom_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read execom of approved orgs" ON org_execom_members;
CREATE POLICY "Public read execom of approved orgs"
  ON org_execom_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = org_execom_members.organization_id AND o.is_approved = true
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = org_execom_members.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org admins manage execom" ON org_execom_members;
CREATE POLICY "Org admins manage execom"
  ON org_execom_members FOR ALL
  USING (
    public.is_org_admin(organization_id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  );

-- ── Events: templates + ended ──
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ticket_template_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS certificate_template_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ DEFAULT NULL;

-- ── Responses: UPI proof + certificates ──
ALTER TABLE event_responses
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'na',
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS certificate_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Ensure payment_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_responses_payment_status_check'
  ) THEN
    ALTER TABLE event_responses
      ADD CONSTRAINT event_responses_payment_status_check
      CHECK (payment_status IN ('na', 'pending', 'verified', 'rejected'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Org admins can update their org (UPI etc.) ──
DROP POLICY IF EXISTS "Org admins update own organization" ON organizations;
CREATE POLICY "Org admins update own organization"
  ON organizations FOR UPDATE
  USING (
    public.is_org_admin(id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  );

-- ── Hardened create_event (drop all prior overloads first) ──
DROP FUNCTION IF EXISTS public.create_event(uuid, text, text, text, date, time, text, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.create_event(uuid, text, text, text, date, time without time zone, text, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.create_event;

CREATE OR REPLACE FUNCTION public.create_event(
  org_id UUID,
  event_title TEXT,
  event_slug TEXT,
  event_description TEXT DEFAULT '',
  event_date DATE DEFAULT NULL,
  event_time TIME DEFAULT NULL,
  event_venue TEXT DEFAULT '',
  event_form_type TEXT DEFAULT 'manual',
  event_payment_type TEXT DEFAULT 'free',
  event_price NUMERIC DEFAULT 0,
  event_status TEXT DEFAULT 'draft',
  event_capacity INT DEFAULT 0,
  event_id_prefix TEXT DEFAULT NULL,
  event_poster_url TEXT DEFAULT '',
  event_brochure_url TEXT DEFAULT '',
  event_ticket_template_url TEXT DEFAULT '',
  event_certificate_template_url TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.is_org_admin(org_id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized to create events for this organization';
  END IF;

  INSERT INTO public.events (
    organization_id, title, slug, description, date, time, venue,
    form_type, payment_type, price, status, capacity, id_prefix,
    poster_url, brochure_url, ticket_template_url, certificate_template_url
  ) VALUES (
    org_id, event_title, event_slug, event_description, event_date, event_time, event_venue,
    event_form_type, event_payment_type, event_price, event_status,
    COALESCE(event_capacity, 0), event_id_prefix,
    COALESCE(event_poster_url, ''), COALESCE(event_brochure_url, ''),
    COALESCE(event_ticket_template_url, ''), COALESCE(event_certificate_template_url, '')
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ── get_organization_events (restore) ──
CREATE OR REPLACE FUNCTION public.get_organization_events(
  org_id UUID,
  filter_status TEXT DEFAULT 'all'
)
RETURNS SETOF events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF filter_status = 'all' THEN
    RETURN QUERY SELECT * FROM events WHERE organization_id = org_id ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM events WHERE organization_id = org_id AND status = filter_status ORDER BY created_at DESC;
  END IF;
END;
$$;

-- ── Fixed get_event_analytics ──
CREATE OR REPLACE FUNCTION public.get_event_analytics(event_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_responses BIGINT;
  v_question_breakdown JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_responses FROM event_responses WHERE event_id = event_id_param;

  SELECT COALESCE(jsonb_agg(q ORDER BY q->>'sort_order'), '[]'::jsonb)
  INTO v_question_breakdown
  FROM (
    SELECT jsonb_build_object(
      'question_id', eq.id,
      'question_title', eq.title,
      'question_type', eq.question_type,
      'sort_order', eq.sort_order,
      'responses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('value', sub.value, 'count', sub.cnt) ORDER BY sub.cnt DESC)
        FROM (
          SELECT ra.value, COUNT(*)::int AS cnt
          FROM response_answers ra
          WHERE ra.question_id = eq.id
          GROUP BY ra.value
        ) sub
      ), '[]'::jsonb)
    ) AS q
    FROM event_questions eq
    WHERE eq.event_id = event_id_param
  ) t;

  RETURN jsonb_build_object(
    'total_responses', v_total_responses,
    'questions', COALESCE(v_question_breakdown, '[]'::jsonb)
  );
END;
$$;

-- ── submit_event_response with payment proof ──
DROP FUNCTION IF EXISTS public.submit_event_response(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.submit_event_response(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_event_response(
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
  v_payment_type text;
  v_pay_status text;
BEGIN
  SELECT payment_type INTO v_payment_type FROM events WHERE id = p_event_id;
  IF v_payment_type IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_payment_type = 'paid' THEN
    IF p_payment_proof_url IS NULL OR length(trim(p_payment_proof_url)) = 0 THEN
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
    p_event_id, p_name, p_email, COALESCE(p_phone, ''),
    COALESCE(p_payment_proof_url, ''), v_pay_status
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ── Host marks payment verified (does NOT send ticket — client calls send) ──
CREATE OR REPLACE FUNCTION public.verify_payment(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_org_id uuid;
BEGIN
  SELECT er.event_id, e.organization_id
  INTO v_event_id, v_org_id
  FROM event_responses er
  JOIN events e ON e.id = er.event_id
  WHERE er.id = p_response_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  IF NOT (
    public.is_org_admin(v_org_id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE event_responses
  SET payment_status = 'verified',
      payment_verified_at = now()
  WHERE id = p_response_id;

  RETURN p_response_id;
END;
$$;

-- ── Host rejects payment ──
CREATE OR REPLACE FUNCTION public.reject_payment(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT e.organization_id INTO v_org_id
  FROM event_responses er
  JOIN events e ON e.id = er.event_id
  WHERE er.id = p_response_id;

  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;
  IF NOT (
    public.is_org_admin(v_org_id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE event_responses
  SET payment_status = 'rejected'
  WHERE id = p_response_id;

  RETURN p_response_id;
END;
$$;

-- ── End event stamp ──
CREATE OR REPLACE FUNCTION public.mark_event_ended(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM events WHERE id = p_event_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT (
    public.is_org_admin(v_org_id)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE events SET ended_at = now(), updated_at = now() WHERE id = p_event_id;
  RETURN p_event_id;
END;
$$;

-- ── Storage: payment-proofs + certificates buckets ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('payment-proofs', 'payment-proofs', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('certificates', 'certificates', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
CREATE POLICY "Public read payment proofs"
  ON storage.objects FOR SELECT USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;
CREATE POLICY "Anyone can upload payment proofs"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Public read certificates" ON storage.objects;
CREATE POLICY "Public read certificates"
  ON storage.objects FOR SELECT USING (bucket_id = 'certificates');

DROP POLICY IF EXISTS "Auth write certificates" ON storage.objects;
CREATE POLICY "Auth write certificates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'certificates');

-- Allow authenticated org asset uploads into event-posters (existing bucket)
-- (already has auth upload policies from migration)

GRANT EXECUTE ON FUNCTION public.create_event(
  uuid, text, text, text, date, time without time zone, text, text, text, numeric, text,
  int, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_events(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_event_analytics(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.submit_event_response(uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_event_ended(uuid) TO authenticated;

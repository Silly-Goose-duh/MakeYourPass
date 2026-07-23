-- ============================================================
-- Phase 8 — MC panel: list pending requests + robust approve
-- ============================================================

-- Superadmin-safe pending list (avoids PostgREST embed FK issues)
CREATE OR REPLACE FUNCTION public.list_pending_org_requests()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  organization_name text,
  organization_slug text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  requester_name text,
  requester_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can list pending requests';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.user_id,
    r.organization_name,
    r.organization_slug,
    r.description,
    r.status,
    r.created_at,
    r.updated_at,
    COALESCE(p.full_name, '')::text AS requester_name,
    COALESCE(p.email, '')::text AS requester_email
  FROM organization_registration_requests r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE r.status = 'pending'
  ORDER BY r.created_at ASC;
END;
$$;

-- Approve returns portal URL + requester email for notification
CREATE OR REPLACE FUNCTION public.approve_organization_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_org_id UUID;
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

  INSERT INTO organizations (name, slug, description, is_approved)
  VALUES (v_request.organization_name, v_request.organization_slug, COALESCE(v_request.description, ''), true)
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

CREATE OR REPLACE FUNCTION public.reject_organization_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_request record;
  v_email text;
  v_name text;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_superadmin = false THEN
    RETURN jsonb_build_object('error', 'Only superadmin can reject requests');
  END IF;

  SELECT * INTO v_request FROM organization_registration_requests WHERE id = request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('error', 'Request not found');
  END IF;

  UPDATE organization_registration_requests
  SET status = 'rejected', updated_at = now()
  WHERE id = request_id;

  SELECT full_name, email INTO v_name, v_email FROM profiles WHERE id = v_request.user_id;

  RETURN jsonb_build_object(
    'status', 'rejected',
    'organization_name', v_request.organization_name,
    'requester_email', COALESCE(v_email, ''),
    'requester_name', COALESCE(v_name, '')
  );
END;
$$;

-- Superadmin can read ALL org registration requests (belt + suspenders with RPC)
DROP POLICY IF EXISTS "Superadmin can manage all requests" ON organization_registration_requests;
CREATE POLICY "Superadmin can manage all requests"
  ON organization_registration_requests FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Superadmin full read on events / orgs / members (ensure SELECT works)
DROP POLICY IF EXISTS "Superadmin can manage organizations" ON organizations;
CREATE POLICY "Superadmin can manage organizations"
  ON organizations FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin can see all members" ON organization_members;
CREATE POLICY "Superadmin can see all members"
  ON organization_members FOR SELECT
  USING (public.is_superadmin());

GRANT EXECUTE ON FUNCTION public.list_pending_org_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_organization_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_organization_request(uuid) TO authenticated;

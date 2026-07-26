-- ============================================================================
-- Phase 10 — Collaborators (host role) + org invites by email
-- Roles: admin (full), host (scan/admit/live dashboard), member (legacy)
-- ============================================================================

-- 1) Allow 'host' on organization_members.role
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'host'::text, 'member'::text]));

-- 2) Pending invites (user may not have an account yet)
CREATE TABLE IF NOT EXISTS org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'host' CHECK (role = ANY (ARRAY['admin'::text, 'host'::text])),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS org_invites_pending_email_org
  ON org_invites (organization_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins manage invites" ON org_invites;
CREATE POLICY "Org admins manage invites"
  ON org_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = org_invites.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = org_invites.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
  );

-- Invitee can read their own pending invite by token via RPC (SECURITY DEFINER)

-- 3) Invite collaborator by email (adds immediately if profile exists)
CREATE OR REPLACE FUNCTION invite_org_collaborator(
  p_org_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'host'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
  v_uid UUID;
  v_is_admin BOOLEAN;
  v_token TEXT;
  v_invite_id UUID;
BEGIN
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN jsonb_build_object('error', 'Valid email required');
  END IF;
  IF v_role NOT IN ('admin', 'host') THEN
    RETURN jsonb_build_object('error', 'Role must be admin or host');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = auth.uid() AND om.role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Only org admins can invite collaborators');
  END IF;

  SELECT id INTO v_uid FROM profiles WHERE lower(email) = v_email LIMIT 1;

  IF v_uid IS NOT NULL THEN
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (p_org_id, v_uid, v_role)
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = EXCLUDED.role;
    -- revoke any pending invite for same email
    UPDATE org_invites SET status = 'revoked'
      WHERE organization_id = p_org_id AND lower(email) = v_email AND status = 'pending';
    RETURN jsonb_build_object(
      'status', 'added',
      'user_id', v_uid,
      'email', v_email,
      'role', v_role,
      'message', 'Collaborator added — they already have an account.'
    );
  END IF;

  INSERT INTO org_invites (organization_id, email, role, invited_by)
  VALUES (p_org_id, v_email, v_role, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id, token INTO v_invite_id, v_token;

  IF v_invite_id IS NULL THEN
    -- pending exists: refresh token/role
    UPDATE org_invites
      SET role = v_role, invited_by = auth.uid(), token = encode(gen_random_bytes(24), 'hex')
      WHERE organization_id = p_org_id AND lower(email) = v_email AND status = 'pending'
      RETURNING id, token INTO v_invite_id, v_token;
  END IF;

  RETURN jsonb_build_object(
    'status', 'invited',
    'invite_id', v_invite_id,
    'email', v_email,
    'role', v_role,
    'token', v_token,
    'message', 'Invite created. Share the invite link — they must sign up with this email.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION invite_org_collaborator(UUID, TEXT, TEXT) TO authenticated;

-- 4) Accept invite (logged-in user, email must match)
CREATE OR REPLACE FUNCTION accept_org_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Sign in first to accept the invite');
  END IF;

  SELECT * INTO inv FROM org_invites WHERE token = p_token AND status = 'pending' LIMIT 1;
  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invite not found or already used');
  END IF;

  SELECT lower(email) INTO v_email FROM profiles WHERE id = auth.uid();
  IF v_email IS NULL OR v_email <> lower(inv.email) THEN
    RETURN jsonb_build_object(
      'error',
      'Sign in with the invited email (' || inv.email || ') to accept'
    );
  END IF;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (inv.organization_id, auth.uid(), inv.role)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = EXCLUDED.role;

  UPDATE org_invites
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;

  RETURN jsonb_build_object(
    'status', 'accepted',
    'organization_id', inv.organization_id,
    'role', inv.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_org_invite(TEXT) TO authenticated;

-- 5) List collaborators (members + pending invites) for admins
CREATE OR REPLACE FUNCTION list_org_collaborators(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok BOOLEAN;
  v_members JSONB;
  v_invites JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'host')
  ) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true
  ) INTO v_ok;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('error', 'Not allowed');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', om.id,
    'user_id', om.user_id,
    'role', om.role,
    'email', p.email,
    'full_name', p.full_name,
    'created_at', om.created_at,
    'kind', 'member'
  ) ORDER BY om.created_at), '[]'::jsonb)
  INTO v_members
  FROM organization_members om
  LEFT JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = p_org_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'email', i.email,
    'role', i.role,
    'status', i.status,
    'token', i.token,
    'created_at', i.created_at,
    'kind', 'invite'
  ) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_invites
  FROM org_invites i
  WHERE i.organization_id = p_org_id AND i.status = 'pending';

  RETURN jsonb_build_object('members', v_members, 'invites', v_invites);
END;
$$;

GRANT EXECUTE ON FUNCTION list_org_collaborators(UUID) TO authenticated;

-- 6) Remove collaborator (admin only)
CREATE OR REPLACE FUNCTION remove_org_collaborator(p_org_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = auth.uid() AND om.role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true
  ) INTO v_ok;
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'Only admins can remove collaborators'); END IF;
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot remove yourself');
  END IF;
  DELETE FROM organization_members WHERE organization_id = p_org_id AND user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION remove_org_collaborator(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION revoke_org_invite(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  v_ok BOOLEAN;
BEGIN
  SELECT * INTO inv FROM org_invites WHERE id = p_invite_id;
  IF inv.id IS NULL THEN RETURN jsonb_build_object('error', 'Invite not found'); END IF;
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = inv.organization_id AND om.user_id = auth.uid() AND om.role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true
  ) INTO v_ok;
  IF NOT v_ok THEN RETURN jsonb_build_object('error', 'Only admins can revoke invites'); END IF;
  UPDATE org_invites SET status = 'revoked' WHERE id = p_invite_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION revoke_org_invite(UUID) TO authenticated;

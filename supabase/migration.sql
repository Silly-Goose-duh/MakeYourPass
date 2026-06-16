-- ============================================================
-- CAMPUSPASS — Marian Engineering College Event Platform
-- Full Schema Migration
-- ============================================================

-- 0. Drop existing tables (wipe clean)
DROP TABLE IF EXISTS response_answers CASCADE;
DROP TABLE IF EXISTS event_responses CASCADE;
DROP TABLE IF EXISTS event_questions CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS ticket_types CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organization_registration_requests CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS create_organization_request CASCADE;
DROP FUNCTION IF EXISTS approve_organization_request CASCADE;

-- 1. PROFILES (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  is_superadmin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read profiles
CREATE POLICY "Profiles are readable by all authenticated users"
  ON profiles FOR SELECT USING (auth.role() = 'authenticated');

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Superadmin can insert/update any profile
CREATE POLICY "Superadmin can manage all profiles"
  ON profiles FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 2. ORGANIZATIONS (pre-existing clubs & departments)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved organizations
CREATE POLICY "Anyone can read approved organizations"
  ON organizations FOR SELECT USING (is_approved = true OR auth.role() = 'authenticated');

-- Superadmin can manage all organizations
CREATE POLICY "Superadmin can manage organizations"
  ON organizations FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 3. ORGANIZATION REGISTRATION REQUESTS (pending approval)
CREATE TABLE organization_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  organization_slug TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organization_registration_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "Users can see own requests"
  ON organization_registration_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create requests
CREATE POLICY "Authenticated users can create requests"
  ON organization_registration_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Superadmin can see and manage all requests
CREATE POLICY "Superadmin can manage all requests"
  ON organization_registration_requests FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 4. ORGANIZATION MEMBERS (who belongs to which org)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own org memberships
CREATE POLICY "Members can see own memberships"
  ON organization_members FOR SELECT
  USING (auth.uid() = user_id);

-- Org admins can see all members of their org
CREATE POLICY "Org admins can see org members"
  ON organization_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
    )
  );

-- Superadmin can see all
CREATE POLICY "Superadmin can see all members"
  ON organization_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 5. EVENTS
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  poster_url TEXT DEFAULT '',
  brochure_url TEXT DEFAULT '',
  date DATE,
  time TIME,
  venue TEXT DEFAULT '',
  form_type TEXT NOT NULL DEFAULT 'manual' CHECK (form_type IN ('brochure', 'manual')),
  payment_type TEXT NOT NULL DEFAULT 'free' CHECK (payment_type IN ('free', 'paid')),
  price NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  response_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Anyone can read published events
CREATE POLICY "Anyone can read published events"
  ON events FOR SELECT
  USING (status = 'published' OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = events.organization_id
    AND om.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
  ));

-- Org admins can create events
CREATE POLICY "Org admins can create events"
  ON events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = events.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
    )
  );

-- Org admins can update their events
CREATE POLICY "Org admins can update events"
  ON events FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = events.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'admin'
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
    )
  );

-- 6. EVENT QUESTIONS (Google Forms style)
CREATE TABLE event_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  question_type TEXT NOT NULL CHECK (question_type IN ('short_text', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'linear_scale')),
  options JSONB DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE event_questions ENABLE ROW LEVEL SECURITY;

-- Anyone can read questions for published events
CREATE POLICY "Anyone can read questions for published events"
  ON event_questions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_questions.event_id AND status = 'published')
    OR EXISTS (
      SELECT 1 FROM organization_members om
      JOIN events e ON e.organization_id = om.organization_id
      WHERE e.id = event_questions.event_id AND om.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- Org admins can manage questions for their events
CREATE POLICY "Org admins can manage questions"
  ON event_questions FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN events e ON e.organization_id = om.organization_id
      WHERE e.id = event_questions.event_id AND om.user_id = auth.uid() AND om.role = 'admin'
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
    )
  );

-- 7. EVENT RESPONSES (form submissions)
CREATE TABLE event_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  respondent_name TEXT NOT NULL DEFAULT '',
  respondent_email TEXT NOT NULL DEFAULT '',
  respondent_phone TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE event_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a response (public form submission)
CREATE POLICY "Anyone can submit a response"
  ON event_responses FOR INSERT
  WITH CHECK (true);

-- Org admins can see responses for their events
CREATE POLICY "Org admins can see responses"
  ON event_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN events e ON e.organization_id = om.organization_id
      WHERE e.id = event_responses.event_id AND om.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
    )
  );

-- 8. RESPONSE ANSWERS (individual answers to questions)
CREATE TABLE response_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES event_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES event_questions(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE response_answers ENABLE ROW LEVEL SECURITY;

-- Anyone can insert answers (public form submission)
CREATE POLICY "Anyone can submit answers"
  ON response_answers FOR INSERT
  WITH CHECK (true);

-- Org admins can see answers for their events
CREATE POLICY "Org admins can see answers"
  ON response_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN events e ON e.organization_id = om.organization_id
      JOIN event_responses er ON er.event_id = e.id
      WHERE er.id = response_answers.response_id AND om.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true
    )
  );

-- 9. STORAGE bucket for posters
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-posters', 'event-posters', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Create profile on signup (trigger from auth)
CREATE OR REPLACE FUNCTION handle_new_user()
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create organization registration request (RPC)
CREATE OR REPLACE FUNCTION create_organization_request(
  org_name TEXT,
  org_slug TEXT,
  org_description TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Check if slug is taken
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = org_slug) THEN
    RETURN jsonb_build_object('error', 'Organization slug already exists');
  END IF;

  -- Check if user already has a pending request
  IF EXISTS (SELECT 1 FROM organization_registration_requests WHERE user_id = v_user_id AND status = 'pending') THEN
    RETURN jsonb_build_object('error', 'You already have a pending request');
  END IF;

  INSERT INTO organization_registration_requests (user_id, organization_name, organization_slug, description)
  VALUES (v_user_id, org_name, org_slug, org_description)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('id', v_request_id, 'status', 'pending');
END;
$$;

-- Approve organization request (RPC, superadmin only)
CREATE OR REPLACE FUNCTION approve_organization_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request record;
  v_org_id UUID;
  v_profile record;
BEGIN
  -- Check if caller is superadmin
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_superadmin = false THEN
    RETURN jsonb_build_object('error', 'Only superadmin can approve requests');
  END IF;

  -- Get the request
  SELECT * INTO v_request FROM organization_registration_requests WHERE id = request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('error', 'Request not found');
  END IF;

  -- Create organization
  INSERT INTO organizations (name, slug, description, is_approved)
  VALUES (v_request.organization_name, v_request.organization_slug, v_request.description, true)
  RETURNING id INTO v_org_id;

  -- Add user as org admin
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_request.user_id, 'admin');

  -- Update request status
  UPDATE organization_registration_requests SET status = 'approved', updated_at = now() WHERE id = request_id;

  RETURN jsonb_build_object('organization_id', v_org_id, 'status', 'approved');
END;
$$;

-- Reject organization request (RPC, superadmin only)
CREATE OR REPLACE FUNCTION reject_organization_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile record;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_superadmin = false THEN
    RETURN jsonb_build_object('error', 'Only superadmin can reject requests');
  END IF;

  UPDATE organization_registration_requests SET status = 'rejected', updated_at = now() WHERE id = request_id;
  RETURN jsonb_build_object('status', 'rejected');
END;
$$;

-- Get events for an organization with filters
CREATE OR REPLACE FUNCTION get_organization_events(
  org_id UUID,
  filter_status TEXT DEFAULT 'all'
)
RETURNS SETOF events
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF filter_status = 'all' THEN
    RETURN QUERY SELECT * FROM events WHERE organization_id = org_id ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM events WHERE organization_id = org_id AND status = filter_status::text ORDER BY created_at DESC;
  END IF;
END;
$$;

-- Get organizations with member count and event count
CREATE OR REPLACE FUNCTION get_organizations_with_counts()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  description TEXT,
  logo_url TEXT,
  is_approved BOOLEAN,
  member_count BIGINT,
  event_count BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.description,
    o.logo_url,
    o.is_approved,
    COALESCE(mc.member_count, 0) AS member_count,
    COALESCE(ec.event_count, 0) AS event_count,
    o.created_at
  FROM organizations o
  LEFT JOIN (SELECT organization_id, COUNT(*) AS member_count FROM organization_members GROUP BY organization_id) mc ON mc.organization_id = o.id
  LEFT JOIN (SELECT organization_id, COUNT(*) AS event_count FROM events GROUP BY organization_id) ec ON ec.organization_id = o.id
  WHERE o.is_approved = true OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true)
  ORDER BY o.name;
END;
$$;

-- Get event analytics
CREATE OR REPLACE FUNCTION get_event_analytics(event_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_responses BIGINT;
  v_question_breakdown JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_responses FROM event_responses WHERE event_id = event_id_param;

  SELECT jsonb_agg(
    jsonb_build_object(
      'question_id', eq.id,
      'question_title', eq.title,
      'question_type', eq.question_type,
      'responses', (
        SELECT jsonb_agg(jsonb_build_object('value', ra.value, 'count', cnt))
        FROM (
          SELECT ra.value, COUNT(*) AS cnt
          FROM response_answers ra
          WHERE ra.question_id = eq.id
          GROUP BY ra.value
          ORDER BY cnt DESC
        ) sub
      )
    )
    ORDER BY eq.sort_order
  ) INTO v_question_breakdown
  FROM event_questions eq
  WHERE eq.event_id = event_id_param;

  RETURN jsonb_build_object(
    'total_responses', v_total_responses,
    'questions', COALESCE(v_question_breakdown, '[]'::jsonb)
  );
END;
$$;

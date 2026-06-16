-- ============================================================
-- CAMPUSPASS — RLS Infinite Recursion Fix
-- ============================================================
-- PROBLEM: Policies querying "profiles" table cause infinite recursion
-- because reading profiles triggers RLS which reads profiles again.
-- 
-- FIX: Create a SECURITY DEFINER function that bypasses RLS,
-- then use it in all policies instead of direct subqueries.
-- ============================================================

-- 1. Create the bypass function
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_superadmin = true);
$$;

-- 2. Drop all old superadmin policies that cause recursion
DROP POLICY IF EXISTS "Superadmin can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Superadmin can manage organizations" ON organizations;
DROP POLICY IF EXISTS "Superadmin can manage all requests" ON organization_registration_requests;
DROP POLICY IF EXISTS "Superadmin can see all members" ON organization_members;
DROP POLICY IF EXISTS "Superadmin can manage questions" ON event_questions;
DROP POLICY IF EXISTS "Org admins can manage questions" ON event_questions;
DROP POLICY IF EXISTS "Org admins can create events" ON events;
DROP POLICY IF EXISTS "Org admins can update events" ON events;
DROP POLICY IF EXISTS "Superadmin can see responses" ON event_responses;
DROP POLICY IF EXISTS "Org admins can see responses" ON event_responses;
DROP POLICY IF EXISTS "Superadmin can see answers" ON response_answers;
DROP POLICY IF EXISTS "Org admins can see answers" ON response_answers;

-- Also drop policies that reference profiles via subquery
DROP POLICY IF EXISTS "Anyone can read published events" ON events;
DROP POLICY IF EXISTS "Anyone can read questions for published events" ON event_questions;
DROP POLICY IF EXISTS "Members can see own memberships" ON organization_members;
DROP POLICY IF EXISTS "Org admins can see org members" ON organization_members;
DROP POLICY IF EXISTS "Profiles are readable by all authenticated users" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 3. Recreate all policies using is_superadmin()

-- PROFILES
CREATE POLICY "Profiles are readable by all authenticated users"
  ON profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Superadmin can manage all profiles"
  ON profiles FOR ALL USING (public.is_superadmin());

-- ORGANIZATIONS
CREATE POLICY "Anyone can read approved organizations"
  ON organizations FOR SELECT USING (is_approved = true OR auth.role() = 'authenticated');

CREATE POLICY "Superadmin can manage organizations"
  ON organizations FOR ALL USING (public.is_superadmin());

-- ORGANIZATION REGISTRATION REQUESTS
CREATE POLICY "Users can see own requests"
  ON organization_registration_requests FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create requests"
  ON organization_registration_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

CREATE POLICY "Superadmin can manage all requests"
  ON organization_registration_requests FOR ALL USING (public.is_superadmin());

-- ORGANIZATION MEMBERS
CREATE POLICY "Members can see own memberships"
  ON organization_members FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Org admins can see org members"
  ON organization_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
    AND om.user_id = auth.uid()
    AND om.role = 'admin'
  ));

CREATE POLICY "Superadmin can see all members"
  ON organization_members FOR SELECT USING (public.is_superadmin());

-- EVENTS
CREATE POLICY "Anyone can read published events"
  ON events FOR SELECT USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = events.organization_id AND om.user_id = auth.uid())
    OR public.is_superadmin()
  );

CREATE POLICY "Org admins can create events"
  ON events FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = events.organization_id AND om.user_id = auth.uid() AND om.role = 'admin')
    OR public.is_superadmin()
  );

CREATE POLICY "Org admins can update events"
  ON events FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = events.organization_id AND om.user_id = auth.uid() AND om.role = 'admin')
    OR public.is_superadmin()
  );

-- EVENT QUESTIONS
CREATE POLICY "Anyone can read questions for published events"
  ON event_questions FOR SELECT USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_questions.event_id AND status = 'published')
    OR EXISTS (SELECT 1 FROM organization_members om JOIN events e ON e.organization_id = om.organization_id WHERE e.id = event_questions.event_id AND om.user_id = auth.uid())
    OR public.is_superadmin()
  );

CREATE POLICY "Org admins can manage questions"
  ON event_questions FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members om JOIN events e ON e.organization_id = om.organization_id WHERE e.id = event_questions.event_id AND om.user_id = auth.uid() AND om.role = 'admin')
    OR public.is_superadmin()
  );

-- EVENT RESPONSES
CREATE POLICY "Anyone can submit a response"
  ON event_responses FOR INSERT WITH CHECK (true);

CREATE POLICY "Org admins can see responses"
  ON event_responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members om JOIN events e ON e.organization_id = om.organization_id WHERE e.id = event_responses.event_id AND om.user_id = auth.uid())
    OR public.is_superadmin()
  );

-- RESPONSE ANSWERS
CREATE POLICY "Anyone can submit answers"
  ON response_answers FOR INSERT WITH CHECK (true);

CREATE POLICY "Org admins can see answers"
  ON response_answers FOR SELECT USING (
    EXISTS (SELECT 1 FROM organization_members om JOIN events e ON e.organization_id = om.organization_id JOIN event_responses er ON er.event_id = e.id WHERE er.id = response_answers.response_id AND om.user_id = auth.uid())
    OR public.is_superadmin()
  );

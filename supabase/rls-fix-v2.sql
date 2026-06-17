-- ============================================================
-- CAMPUSPASS — RLS Infinite Recursion Fix v2
-- ============================================================
-- PROBLEM: All policies referencing organization_members via
-- direct subquery cause infinite recursion because the
-- organization_members SELECT policy self-references the table.
--
-- FIX: Create is_org_admin(UUID) SECURITY DEFINER function
-- that bypasses RLS when checking org membership, then replace
-- ALL direct organization_members subqueries with it.
--
-- REQUIRES: is_superadmin() function from rls-fix.sql
-- ============================================================

-- 1. Create the org admin check function (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND role = 'admin'
  );
$$;

-- 2. Drop ALL old policies that reference organization_members directly
-- (these all cause recursion because organization_members SELECT policy self-references)

-- Organization members policies
DROP POLICY IF EXISTS "Org admins can see org members" ON organization_members;
DROP POLICY IF EXISTS "Members can see own memberships" ON organization_members;
DROP POLICY IF EXISTS "Superadmin can see all members" ON organization_members;

-- Events policies
DROP POLICY IF EXISTS "Anyone can read published events" ON events;
DROP POLICY IF EXISTS "Org admins can create events" ON events;
DROP POLICY IF EXISTS "Org admins can update events" ON events;

-- Event questions policies
DROP POLICY IF EXISTS "Anyone can read questions for published events" ON event_questions;
DROP POLICY IF EXISTS "Org admins can manage questions" ON event_questions;

-- Event responses policies
DROP POLICY IF EXISTS "Org admins can see responses" ON event_responses;

-- Response answers policies
DROP POLICY IF EXISTS "Org admins can see answers" ON response_answers;

-- 3. Recreate ALL policies using is_org_admin() and is_superadmin()

-- ORGANIZATION MEMBERS
-- Users can always see their own memberships
CREATE POLICY "Members can see own memberships"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());

-- Org admins can see their org's members via SECURITY DEFINER function
CREATE POLICY "Org admins can see org members"
  ON organization_members FOR SELECT
  USING (public.is_org_admin(organization_id));

-- Superadmin can see all members
CREATE POLICY "Superadmin can see all members"
  ON organization_members FOR SELECT
  USING (public.is_superadmin());

-- EVENTS
-- Anyone can read published events; org members can see their events; superadmin can see all
CREATE POLICY "Anyone can read published events"
  ON events FOR SELECT
  USING (
    status = 'published'
    OR public.is_org_admin(organization_id)
    OR public.is_superadmin()
  );

-- Org admins can create events; superadmin can create events for any org
CREATE POLICY "Org admins can create events"
  ON events FOR INSERT
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.is_superadmin()
  );

-- Org admins can update events; superadmin can update any event
CREATE POLICY "Org admins can update events"
  ON events FOR UPDATE
  USING (
    public.is_org_admin(organization_id)
    OR public.is_superadmin()
  );

-- EVENT QUESTIONS
-- Anyone can read questions for published events; org members can read their events' questions
CREATE POLICY "Anyone can read questions for published events"
  ON event_questions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_questions.event_id AND status = 'published')
    OR public.is_org_admin((SELECT organization_id FROM events WHERE id = event_questions.event_id))
    OR public.is_superadmin()
  );

-- Org admins can manage questions for their events
CREATE POLICY "Org admins can manage questions"
  ON event_questions FOR ALL
  USING (
    public.is_org_admin((SELECT organization_id FROM events WHERE id = event_questions.event_id))
    OR public.is_superadmin()
  );

-- EVENT RESPONSES
-- Anyone can submit a response (no auth needed)
CREATE POLICY "Anyone can submit a response"
  ON event_responses FOR INSERT
  WITH CHECK (true);

-- Org admins can see responses for their events
CREATE POLICY "Org admins can see responses"
  ON event_responses FOR SELECT
  USING (
    public.is_org_admin((SELECT organization_id FROM events WHERE id = event_responses.event_id))
    OR public.is_superadmin()
  );

-- RESPONSE ANSWERS
-- Anyone can submit answers
CREATE POLICY "Anyone can submit answers"
  ON response_answers FOR INSERT
  WITH CHECK (true);

-- Org admins can see answers for their events
CREATE POLICY "Org admins can see answers"
  ON response_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_responses er
      JOIN events e ON e.id = er.event_id
      WHERE er.id = response_answers.response_id
      AND public.is_org_admin(e.organization_id)
    )
    OR public.is_superadmin()
  );

-- ============================================================
-- ADDITIONAL: Create event via SECURITY DEFINER function
-- (allows creating events without hitting RLS)
-- ============================================================
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
  event_status TEXT DEFAULT 'draft'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.events (
    organization_id, title, slug, description, date, time, venue,
    form_type, payment_type, price, status
  ) VALUES (
    org_id, event_title, event_slug, event_description, event_date, event_time, event_venue,
    event_form_type, event_payment_type, event_price, event_status
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ============================================================
-- ADDITIONAL: Read all published events via SECURITY DEFINER
-- (bypasses RLS for public event listing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_published_events()
RETURNS SETOF events
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT e.* FROM events e
  WHERE e.status = 'published'
  ORDER BY e.date ASC;
$$;

-- ============================================================
-- VERIFICATION QUERIES (run these to confirm the fix)
-- ============================================================
-- SELECT public.is_superadmin();
-- SELECT public.is_org_admin('ec9d8256-c7b9-4921-8d77-e8d07a45df33');
-- SELECT * FROM organization_members LIMIT 5;
-- SELECT * FROM events WHERE status = 'published' LIMIT 5;

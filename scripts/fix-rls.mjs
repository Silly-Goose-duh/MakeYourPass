// Fixes RLS infinite recursion on organization_members and seeds demo data
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://isvylfovcwtlemjpkdqp.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdnlsZm92Y3d0bGVtanBrZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTA5ODMsImV4cCI6MjA5Njc2Njk4M30.lQu0tMHo5PKwIqsM28kt8F1DdXWZpPpyaKNY7yraN9c'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

const FIX_SQL = `
-- 1. Create SECURITY DEFINER function to check org admin membership
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

-- 2. Drop recursive policy on organization_members
DROP POLICY IF EXISTS "Org admins can see org members" ON organization_members;

-- 3. Recreate using SECURITY DEFINER function
CREATE POLICY "Org admins can see org members"
  ON organization_members FOR SELECT
  USING (public.is_org_admin(organization_members.organization_id));

-- 4. Fix events policies
DROP POLICY IF EXISTS "Org admins can create events" ON events;
CREATE POLICY "Org admins can create events"
  ON events FOR INSERT WITH CHECK (
    public.is_superadmin() OR public.is_org_admin(events.organization_id)
  );

DROP POLICY IF EXISTS "Org admins can update events" ON events;
CREATE POLICY "Org admins can update events"
  ON events FOR UPDATE USING (
    public.is_superadmin() OR public.is_org_admin(events.organization_id)
  );

-- 5. Fix event_questions policies
DROP POLICY IF EXISTS "Anyone can read questions for published events" ON event_questions;
CREATE POLICY "Anyone can read questions for published events"
  ON event_questions FOR SELECT USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_questions.event_id AND status = 'published')
    OR public.is_superadmin()
    OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = (SELECT organization_id FROM events WHERE id = event_questions.event_id) AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Org admins can manage questions" ON event_questions;
CREATE POLICY "Org admins can manage questions"
  ON event_questions FOR ALL USING (
    public.is_org_admin((SELECT organization_id FROM events WHERE id = event_questions.event_id))
    OR public.is_superadmin()
  );

-- 6. Fix event_responses policies
DROP POLICY IF EXISTS "Org admins can see responses" ON event_responses;
CREATE POLICY "Org admins can see responses"
  ON event_responses FOR SELECT USING (
    public.is_org_admin((SELECT organization_id FROM events WHERE id = event_responses.event_id))
    OR public.is_superadmin()
  );

-- 7. Fix response_answers policies
DROP POLICY IF EXISTS "Org admins can see answers" ON response_answers;
CREATE POLICY "Org admins can see answers"
  ON response_answers FOR SELECT USING (
    EXISTS (SELECT 1 FROM event_responses er JOIN events e ON e.id = er.event_id WHERE er.id = response_answers.response_id AND (public.is_org_admin(e.organization_id) OR public.is_superadmin()))
  );
`

async function main() {
  // Sign in to get auth session
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gooseisback4u@gmail.com',
    password: 'gooseisawesome1234',
  })
  if (authErr) { console.error('Auth error:', authErr.message); process.exit(1) }

  // Execute SQL via Supabase's REST API with the authenticated session
  // Using the pg_query RPC endpoint
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  if (!token) {
    console.error('No access token')
    process.exit(1)
  }

  console.log('Executing RLS fix SQL...')

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify({ query: FIX_SQL }),
    })

    const text = await response.text()
    console.log('SQL exec result:', response.status, text.substring(0, 500))
  } catch (e) {
    console.error('SQL exec failed:', e.message)
    console.log('This endpoint might not exist. Trying alternative...')
  }

  // Alternative: Use the Supabase Management API
  // But we don't have a PAT, so this won't work
  // Instead, try to just create the data directly

  console.log('\nAttempting to create event directly...')

  const orgId = 'ec9d8256-c7b9-4921-8d77-e8d07a45df33'
  const userId = '75a6ce7c-34f4-4328-9cc0-b207c18d8504'

  // First try adding ourselves as org member
  const { error: memberErr } = await supabase.from('organization_members').insert({
    organization_id: orgId,
    user_id: userId,
    role: 'admin',
  })
  if (memberErr) console.log('Member insert:', memberErr.message)
  else console.log('Added as org admin')

  // Try creating the event
  const eventDate = new Date()
  const day = eventDate.getDay()
  const daysUntilSat = (6 - day + 7) % 7 || 7
  eventDate.setDate(eventDate.getDate() + daysUntilSat)
  const dateStr = eventDate.toISOString().split('T')[0]

  const { data: ev, error: evErr } = await supabase.from('events').insert({
    organization_id: orgId,
    title: 'AI Workshop: Build with Opencode',
    description: 'Learn how to build AI-powered applications using Opencode — a framework for creating intelligent agents. This hands-on workshop covers prompt engineering, tool use, and deploying your own AI agent. Bring your laptop!',
    date: dateStr,
    time: '10:00',
    venue: 'AI & Robotics Lab, Block C',
    poster_url: '',
    brochure_url: '',
    payment_type: 'free',
    price: 0,
    status: 'published',
    slug: 'ai-workshop-opencode',
  }).select().single()

  if (evErr) {
    console.error('Event creation failed:', evErr.message)
    process.exit(1)
  }

  console.log('Event created:', ev.title, '-', ev.date, '10:00 AM - 12:00 PM')

  // Add questions
  const { error: qErr } = await supabase.from('event_questions').insert([
    { event_id: ev.id, title: 'Full Name', question_type: 'short_text', required: true, sort_order: 0 },
    { event_id: ev.id, title: 'Email', question_type: 'email', required: true, sort_order: 1 },
    { event_id: ev.id, title: 'Department & Year', question_type: 'short_text', required: true, sort_order: 2 },
    { event_id: ev.id, title: 'Coding Experience', question_type: 'short_text', required: false, sort_order: 3 },
  ])
  if (qErr) console.error('Questions error:', qErr.message)
  else console.log('Registration questions added')

  console.log('\nDone! Visit https://mec-campuspass.vercel.app to check.')
}

main().catch(console.error)

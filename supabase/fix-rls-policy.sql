-- ============================================
-- Fix: RLS policy for events INSERT
-- Run this in Supabase SQL Editor
-- ============================================

-- Drop the old restrictive policy
drop policy if exists "Org members can create events" on events;

-- Recreate with broader check: allows org owners even if org_members status isn't 'active'
create policy "Org members can create events"
  on events for insert
  with check (
    -- User is an active member of the org
    (org_id in (
      select org_id from org_members where user_id = auth.uid() and status = 'active'
    ))
    or
    -- OR user owns the org directly
    (org_id in (
      select id from organizations where owner_id = auth.uid()
    ))
  );

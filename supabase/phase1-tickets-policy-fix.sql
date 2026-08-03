-- Phase1 addendum: tickets bucket write must be authenticated only.
-- (The original phase1 policy omitted TO and so granted `public` write,
--  letting anons upload arbitrary files into the tickets bucket.)
-- Run in Supabase SQL Editor.

DROP POLICY IF EXISTS "Tickets writable by authenticated" ON storage.objects;
CREATE POLICY "Tickets writable by authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tickets');

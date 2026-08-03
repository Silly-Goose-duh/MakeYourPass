-- Phase1 addendum: make event_seat_status respect RLS (security_invoker).
-- Without this, the view bypasses event_responses RLS and any authed user
-- could read confirmed_count/seats_left for any event.
-- Run in Supabase SQL Editor.

CREATE OR REPLACE VIEW event_seat_status
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.capacity,
  count(r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed_count,
  CASE WHEN e.capacity IS NULL OR e.capacity = 0 THEN NULL
       ELSE greatest(e.capacity - count(r.id) FILTER (WHERE r.status = 'confirmed'), 0)
  END AS seats_left
FROM events e
LEFT JOIN event_responses r ON r.event_id = e.id
GROUP BY e.id, e.capacity;

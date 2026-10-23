-- ==========================================================================
-- 004 — organization onboarding race and duplicate protection
-- ==========================================================================
-- Additive migration. Keep one pending request per requester and per slug so
-- concurrent club onboarding attempts cannot create ambiguous queue entries.
-- Existing duplicate pending rows are retained as rejected history before the
-- unique indexes are added.

-- Keep the newest pending request for each user. This matches the dashboard/API
-- behaviour, which treats the most recent pending request as authoritative.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM public.organization_registration_requests
  WHERE status = 'pending'
)
UPDATE public.organization_registration_requests r
SET status = 'rejected', updated_at = now()
FROM ranked d
WHERE r.id = d.id
  AND d.row_number > 1;

-- If multiple users already requested the same slug, preserve the earliest
-- request and close the later duplicates before enforcing the slug invariant.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(organization_slug)
      ORDER BY created_at ASC, id ASC
    ) AS row_number
  FROM public.organization_registration_requests
  WHERE status = 'pending'
)
UPDATE public.organization_registration_requests r
SET status = 'rejected', updated_at = now()
FROM ranked d
WHERE r.id = d.id
  AND d.row_number > 1;

-- A requester may have only one active onboarding request.
CREATE UNIQUE INDEX IF NOT EXISTS organization_registration_requests_pending_user_key
  ON public.organization_registration_requests (user_id)
  WHERE status = 'pending';

-- Slugs are normalized to lowercase by the onboarding API; enforce the same
-- invariant at the database layer for RPC/direct inserts as well.
CREATE UNIQUE INDEX IF NOT EXISTS organization_registration_requests_pending_slug_key
  ON public.organization_registration_requests (lower(organization_slug))
  WHERE status = 'pending';

-- Fix ambiguous id in get_organizations_with_counts (RETURNS TABLE id vs profiles.id)
CREATE OR REPLACE FUNCTION public.get_organizations_with_counts()
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  description text,
  logo_url text,
  is_approved boolean,
  member_count bigint,
  event_count bigint,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    COALESCE(mc.member_count, 0::bigint),
    COALESCE(ec.event_count, 0::bigint),
    o.created_at
  FROM organizations o
  LEFT JOIN (
    SELECT om.organization_id, COUNT(*)::bigint AS member_count
    FROM organization_members om
    GROUP BY om.organization_id
  ) mc ON mc.organization_id = o.id
  LEFT JOIN (
    SELECT e.organization_id, COUNT(*)::bigint AS event_count
    FROM events e
    GROUP BY e.organization_id
  ) ec ON ec.organization_id = o.id
  WHERE o.is_approved = true
     OR EXISTS (
       SELECT 1 FROM profiles p
       WHERE p.id = auth.uid() AND p.is_superadmin = true
     )
  ORDER BY o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organizations_with_counts() TO authenticated, anon, service_role;

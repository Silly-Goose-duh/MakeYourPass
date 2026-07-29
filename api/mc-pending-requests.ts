/**
 * GET /api/mc-pending-requests
 * Auth: Bearer <supabase access token> of a superadmin
 * Returns pending + recent registration requests (so MC always sees the queue).
 * Uses service role so RLS cannot hide rows from MC.
 *
 * Query: ?all=1  → include recent non-pending (default true for history)
 */
export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!auth) return res.status(401).json({ error: 'Unauthorized — sign in as superadmin' })

    const supabaseMod = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anon = process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !service || !anon) {
      return res.status(500).json({ error: 'Supabase not configured on server' })
    }

    const userClient = supabaseMod.createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${auth}` } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(auth)
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const sb = supabaseMod.createClient(url, service, { auth: { persistSession: false } })
    const { data: prof } = await sb
      .from('profiles')
      .select('is_superadmin, full_name, email')
      .eq('id', userData.user.id)
      .single()

    if (!prof?.is_superadmin) {
      return res.status(403).json({ error: 'Only superadmin can list pending requests' })
    }

    // All recent requests (pending first, then by date) so MC can see history
    const { data: rows, error } = await sb
      .from('organization_registration_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return res.status(500).json({ error: error.message })

    const userIds = [...new Set((rows || []).map((r: { user_id: string }) => r.user_id).filter(Boolean))]
    let profileMap = new Map<string, { full_name: string; email: string }>()
    if (userIds.length > 0) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      profileMap = new Map(
        (profiles || []).map((p: { id: string; full_name: string; email: string }) => [
          p.id,
          { full_name: p.full_name || '', email: p.email || '' },
        ])
      )
    }

    const mapRow = (r: Record<string, unknown>) => {
      const p = profileMap.get(r.user_id as string)
      return {
        id: r.id,
        user_id: r.user_id,
        organization_name: r.organization_name,
        organization_slug: r.organization_slug,
        description: r.description || null,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        requester_name: p?.full_name || '',
        requester_email: p?.email || '',
        profiles: p || null,
      }
    }

    const all = (rows || []).map((r: Record<string, unknown>) => mapRow(r))
    const pending = all.filter((r: { status: string }) => r.status === 'pending')
    // Sort pending oldest-first for action queue
    pending.sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    return res.status(200).json({
      ok: true,
      count: pending.length,
      requests: pending,
      // Full recent list for history UI
      recent: all,
      viewer: { email: prof.email, is_superadmin: true },
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * GET /api/mc-pending-requests
 * Auth: Bearer <supabase access token> of a superadmin
 * Returns pending + recent registration requests (so MC always sees the queue).
 * Uses service role so RLS cannot hide rows from MC.
 *
 * Query: ?all=1  → include recent non-pending (default true for history)
 */
export const config = { runtime: 'nodejs' }

/* ── Inlined from api/_lib/ (http.ts / rateLimit.ts / authz.ts) ───────────────────
 * These helpers are duplicated in every handler ON PURPOSE. The previous
 * revision loaded them with `await import('./_lib/...')` and every single
 * endpoint then failed on Vercel at init with FUNCTION_INVOCATION_FAILED.
 * Note that a local `vercel build` still succeeds in that state, so the only
 * reliable check is an HTTP smoke test against the deployed URL.
 *
 * api/_lib/ is still the canonical copy and is what the unit tests import
 * (tests/http.test.ts, tests/cors.test.ts, tests/rateLimit.test.ts). If you
 * change a helper here, change it there too.                       */
/* eslint-disable @typescript-eslint/no-explicit-any -- Vercel gives us untyped req/res. */

function applyCors(req: any, res: any): boolean {
  const configured = (process.env.APP_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = rawHost ? String(rawHost).split(',')[0].trim() : ''
  const fromHost = host ? `${proto}://${host}` : ''
  const allowed = configured.length ? configured : fromHost ? [fromHost] : []

  const origin = req.headers.origin ? String(req.headers.origin).replace(/\/+$/, '') : ''
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

function fail(res: any, status: number, publicMessage: string, err?: unknown): any {
  if (err) console.error(`[api] ${publicMessage} ::`, err)
  if (status >= 500 && isDatabaseUnreachable(err)) {
    return res
      .status(503)
      .json({ error: 'The database is unreachable right now. Please try again shortly.' })
  }
  return res.status(status).json({ error: publicMessage })
}

/**
 * True when an error means "we could not reach the backing service" rather
 * than "the request was wrong".
 *
 * NOTE: this inspects the error text, but it never returns the error itself --
 * only a fixed string -- so it leaks nothing to the caller.
 */
function isDatabaseUnreachable(err: unknown): boolean {
  if (!err) return false
  const e = err as { message?: unknown; details?: unknown; cause?: unknown }
  const text = [
    typeof err === 'string' ? err : '',
    e?.message ?? '',
    e?.details ?? '',
    e?.cause instanceof Error ? e.cause.message : '',
  ].join(' ')
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|getaddrinfo|socket hang up/i.test(text)
}

/** Row shape returned to the MC panel after joining the requester's profile. */
interface MappedRequest {
  id: unknown
  user_id: unknown
  organization_name: unknown
  organization_slug: unknown
  description: unknown
  status: string
  created_at: string
  updated_at: unknown
  requester_name: string
  requester_email: string
  profiles: { full_name: string; email: string } | null
}
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
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

    if (error) return fail(res, 500, 'Could not load requests', error)

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

    const mapRow = (r: Record<string, unknown>): MappedRequest => {
      const p = profileMap.get(r.user_id as string)
      return {
        id: r.id,
        user_id: r.user_id,
        organization_name: r.organization_name,
        organization_slug: r.organization_slug,
        description: r.description || null,
        // Coerced to string so the pending filter and the queue sort below
        // have a concrete type to work against (raw `unknown` made the
        // predicate overload unresolvable).
        status: String(r.status ?? ''),
        created_at: String(r.created_at ?? ''),
        updated_at: r.updated_at,
        requester_name: p?.full_name || '',
        requester_email: p?.email || '',
        profiles: p || null,
      }
    }

    const all: MappedRequest[] = (rows || []).map((r: Record<string, unknown>) => mapRow(r))
    const pending = all.filter((r) => r.status === 'pending')
    // Sort pending oldest-first for action queue
    pending.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
    return fail(res, 500, 'Internal error', err)
  }
}

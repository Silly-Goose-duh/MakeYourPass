/**
 * POST /api/ticket-image
 *
 * Returns a SHORT-LIVED SIGNED URL for a registration's ticket PNG so a host
 * can open / preview it.
 *
 * WHY THIS EXISTS:
 *   The `tickets` storage bucket was created `public: true` (see
 *   supabase/phase1-ticketing.sql) and the ticket URL was persisted verbatim in
 *   event_responses.ticket_url. That made every attendee's ticket a world
 *   readable document containing their NAME and a scannable QR — anyone who
 *   could reach the Supabase project URL, or any host page that leaked one,
 *   could walk the attendee list. The bucket is being migrated to private, so
 *   the frontend can no longer point an <img src> at ticket_url directly and
 *   must ask this endpoint for a signed link instead.
 *
 * Body:      { registration_id: string }
 * Response:  { url: string | null }   // null = no ticket rendered yet
 * Status:    404 when the registration does not exist (or is invisible)
 *
 * ── AUTH ────────────────────────────────────────────────────────────────────
 * Requires `Authorization: Bearer <supabase access token>` for a superadmin /
 * org admin / host of the registration's event (resolveCaller +
 * requireResponseAccess): 401 unauthenticated, 403 wrong organization.
 * There is deliberately NO internal-secret bypass here — unlike the cron path
 * into on-registration/generate-ticket, nothing server-side needs to render an
 * image, and every extra caller of this endpoint is another way to leak one.
 *
 * The signed URL lives 120 seconds (the minimum that lets a host click through
 * a dashboard link and still scan it in time).
 *
 * Rate limit: 60 / 10 min / caller. Signing is cheap; this is here to stop a
 * single compromised host session from minting links for the whole attendee
 * list.
 *
 * All shared helpers are DYNAMICALLY imported inside the handler — static
 * top-level imports crash the Vercel function bundler (see generate-ticket.ts).
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
  if (err) {
    console.error(`[api] ${publicMessage} ::`, err instanceof Error ? err.message : err)
  }
  return res.status(status).json({ error: publicMessage })
}

function readBody(req: any): any {
  const raw = req.body
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw === 'object') return Array.isArray(raw) ? null : raw
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  )
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets. */
  retryAfter: number
}

type Bucket = { count: number; resetAt: number }
const store = new Map<string, Bucket>()
const MAX_KEYS = 10_000
function sweep(now: number) {
  if (store.size <= MAX_KEYS) return
  for (const [k, b] of store) {
    if (b.resetAt <= now) store.delete(k)
  }
  if (store.size > MAX_KEYS) {
    const keys = [...store.keys()].slice(0, Math.floor(store.size / 2))
    for (const k of keys) store.delete(k)
  }
}

async function redisLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const redisKey = `myp:rl:${key}`
    const pipeline = [
      ['INCR', redisKey],
      ['EXPIRE', redisKey, String(windowSec), 'NX'],
      ['TTL', redisKey],
    ]
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const count = Number(data?.[0]?.result ?? 1)
    const ttl = Number(data?.[2]?.result ?? windowSec)
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter: ttl > 0 ? ttl : windowSec }
  } catch (err) {
    console.error('[rateLimit] redis error, failing open:', err)
    return null
  }
}

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) }
  }
  existing.count += 1
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
  const viaRedis = await redisLimit(key, limit, windowSec)
  if (viaRedis) return viaRedis
  return memoryLimit(key, limit, windowMs)
}

function applyLimitHeaders(res: any, result: RateLimitResult) {
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))
  res.setHeader('X-RateLimit-Retry-After', String(result.retryAfter))
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter))
    return true
  }
  return false
}

interface Caller {
  id: string
  email: string
  isSuperadmin: boolean
}

type AccessResult =
  | { ok: true; caller: Caller; organizationId: string; role: 'admin' | 'host' | 'superadmin' }
  | { ok: false; status: 401 | 403 | 404; error: string }

const HOST_ROLES = ['admin', 'host'] as const

export async function resolveCaller(req: any): Promise<Caller | null> {
  const raw = req.headers.authorization || req.headers.Authorization || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  try {
    const supabaseMod: any = await import('@supabase/supabase-js')
    const sb = supabaseMod.createClient(url, serviceKey, { auth: { persistSession: false } })

    const anonKey = process.env.VITE_SUPABASE_ANON_KEY
    const verifier = anonKey
      ? supabaseMod.createClient(url, anonKey, { auth: { persistSession: false } })
      : sb
    const { data, error } = await verifier.auth.getUser(token)
    if (error || !data?.user) return null

    const user = data.user
    const { data: prof } = await sb
      .from('profiles')
      .select('is_superadmin, email')
      .eq('id', user.id)
      .maybeSingle()

    return {
      id: user.id,
      email: prof?.email || user.email || '',
      isSuperadmin: !!prof?.is_superadmin,
    }
  } catch (err) {
    console.error('[authz] resolveCaller failed:', err)
    return null
  }
}

export async function requireEventAccess(sb: any, caller: Caller, eventId: string): Promise<AccessResult> {
  if (caller.isSuperadmin) {
    const { data: ev } = await sb
      .from('events')
      .select('organization_id')
      .eq('id', eventId)
      .maybeSingle()
    if (!ev) return { ok: false, status: 404, error: 'Event not found' }
    return { ok: true, caller, organizationId: ev.organization_id, role: 'superadmin' }
  }

  const { data: ev } = await sb
    .from('events')
    .select('organization_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return { ok: false, status: 404, error: 'Event not found' }

  const { data: mem } = await sb
    .from('organization_members')
    .select('role')
    .eq('organization_id', ev.organization_id)
    .eq('user_id', caller.id)
    .in('role', [...HOST_ROLES])
    .limit(1)

  const role = mem?.[0]?.role
  if (!role) return { ok: false, status: 403, error: 'Not authorized for this event' }
  return { ok: true, caller, organizationId: ev.organization_id, role: role as 'admin' | 'host' }
}

export async function requireResponseAccess(
  sb: any,
  caller: Caller,
  registrationId: string
): Promise<AccessResult & { registration?: any }> {
  const { data: reg } = await sb
    .from('event_responses')
    .select('id, event_id, status')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { ok: false, status: 404, error: 'Registration not found' }

  const access = await requireEventAccess(sb, caller, reg.event_id)
  if (!access.ok) return access
  return { ...access, registration: reg }
}

export async function serviceClient(): Promise<any | null> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabaseMod: any = await import('@supabase/supabase-js')
  return supabaseMod.createClient(url, key, { auth: { persistSession: false } })
}

/** Signed URL lifetime. Short on purpose. */
const SIGNED_URL_TTL_SECONDS = 120

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * `event_responses.ticket_url` holds EITHER a storage path (new rows) or a
 * full public URL (rows written before the private-bucket migration):
 *   tickets/<event_id>/<registration_id>.png
 *   https://<ref>.supabase.co/storage/v1/object/public/tickets/<event_id>/<reg>.png
 *
 * Returns the path INSIDE the `tickets` bucket — i.e. with the `tickets/`
 * prefix removed, because `sb.storage.from('tickets').createSignedUrl(path)`
 * prepends the bucket id itself and would otherwise sign
 * `tickets/tickets/...`. Anything that is not inside the tickets bucket (a
 * traversal attempt, another bucket, a random URL) resolves to null and the
 * caller gets `{ url: null }`.
 */
export function storagePathFromTicketUrl(stored: unknown): string | null {
  const v = String(stored ?? '').trim()
  if (!v) return null

  let path: string
  if (/^https?:\/\//i.test(v)) {
    const m = v.match(/\/storage\/v1\/object\/(?:public|sign)\/tickets\/([^?#]+)/i)
    if (!m) return null
    path = m[1]
  } else {
    if (!v.startsWith('tickets/')) return null
    path = v.slice('tickets/'.length)
  }

  path = path.replace(/^\/+/, '')
  if (!path || path.includes('..') || path.includes('\\')) return null
  return path
}

export default async function handler(req: any, res: any) {

  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = readBody(req)
    if (body === null) return fail(res, 400, 'Invalid request body')

    const registrationId = String(body?.registration_id || '').trim()
    if (!isUuid(registrationId)) return res.status(400).json({ error: 'registration_id required' })

    const caller = await resolveCaller(req)
    if (!caller) return fail(res, 401, 'Authentication required')

    const rl = await rateLimit(`ticket-image:${caller.id}`, 60, 10 * 60 * 1000)
    if (applyLimitHeaders(res, rl)) {
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
    }

    const sb = await serviceClient()
    if (!sb) return fail(res, 500, 'Server not configured')

    const access = await requireResponseAccess(sb, caller, registrationId)
    if (!access.ok) {
      if (access.status === 404) return fail(res, 404, 'Registration not found')
      return fail(res, access.status, access.error)
    }

    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('ticket_url')
      .eq('id', registrationId)
      .maybeSingle()
    if (regErr) return fail(res, 500, 'Internal error', regErr)
    if (!reg) return res.status(404).json({ error: 'Registration not found' })

    const path = storagePathFromTicketUrl(reg.ticket_url)
    if (!path) return res.status(200).json({ url: null })

    const { data, error } = await sb.storage
      .from('tickets')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

    if (error || !data?.signedUrl) {
      // The row exists but the object is gone (or was never rendered).
      // Not an error for the caller — it just cannot show an image yet.
      console.error('[ticket-image] sign failed:', error?.message || error)
      return res.status(200).json({ url: null })
    }

    return res.status(200).json({ url: data.signedUrl })
  } catch (err: unknown) {
    return fail(res, 500, 'Internal error', err)
  }
}
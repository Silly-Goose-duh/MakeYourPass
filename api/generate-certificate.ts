/**
 * POST /api/generate-certificate
 * Body: { registration_id, regenerate? }
 * Draws attendee name onto certificate template (or a simple default).
 *
 * SECURITY: this endpoint previously had NO authentication at all — any caller
 * who learned a `registration_id` could render (and repeatedly re-render) a
 * named certificate for an arbitrary attendee and write objects into the
 * `certificates` bucket. It now requires an authenticated org admin/host (or a
 * superadmin) for the registration's event, exactly like /api/generate-ticket.
 *
 * NOTE: as of this writing no client code calls this endpoint, so it is
 * currently orphaned. It is kept because certificate issuance is a shipped
 * roadmap item, but it should be wired up (or deleted) rather than left as a
 * service-role-backed write path nobody exercises.
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

function clientIp(req: any): string {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  const ip = typeof raw === 'string' ? raw.split(',')[0]?.trim() : ''
  return ip || req.socket?.remoteAddress || 'unknown'
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

/* eslint-disable @typescript-eslint/no-explicit-any -- Vercel gives us untyped req/res. */

/** Refuse internal/loopback/link-local targets before we fetch them server-side. */
function assertFetchableTemplateUrl(rawUrl: string): URL | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return null
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number)
    if (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return null
    }
  }
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return null
  }
  return url
}

export default async function handler(req: any, res: any) {

  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Rate limit before the expensive image work.
    const limit = await rateLimit(`rl:cert:${clientIp(req)}`, 20, 10 * 60 * 1000)
    if (applyLimitHeaders(res, limit)) {
      return res.status(429).json({ error: 'Too many certificate requests — try again shortly' })
    }

    const body = readBody(req)
    if (!body) return fail(res, 400, 'Invalid JSON body')
    const { registration_id, regenerate } = body as { registration_id?: string; regenerate?: boolean }
    if (!isUuid(registration_id)) return fail(res, 400, 'registration_id required')

    // ── Authorization ──────────────────────────────────────────────────────
    const caller = await resolveCaller(req)
    if (!caller) return res.status(401).json({ error: 'Sign in to generate certificates' })

    const supabaseMod = await import('@supabase/supabase-js')
    const pure = await import('pureimage')
    const PImage = ((pure as any).default || pure)

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return fail(res, 500, 'Server not configured')
    const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })

    const access = await requireResponseAccess(sb, caller, registration_id)
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error })
    }

    const { data: reg, error } = await sb
      .from('event_responses')
      .select('id, event_id, respondent_name, certificate_url, admitted_at, events(title, certificate_template_url, date)')
      .eq('id', registration_id)
      .single()
    if (error || !reg) return res.status(404).json({ error: 'Registration not found' })
    if (reg.certificate_url && !regenerate) {
      return res.status(200).json({ certificate_url: reg.certificate_url })
    }

    const ev = (reg as any).events || {}
    const name = (reg.respondent_name || 'Participant').toString()
    const title = (ev.title || 'Event').toString()
    const templateUrl = (ev.certificate_template_url || '').toString()

    const W = 1200
    const H = 850
    const canvas = PImage.make(W, H)
    const ctx = canvas.getContext('2d')

    // Background: try template image, else solid
    let usedTemplate = false
    // The template URL is org-supplied, so this is not user-controlled SSRF —
    // but a malicious/compromised org admin could still point it at an
    // internal service, so it goes through the same guard as the poster fetch.
    const templateTarget = templateUrl ? assertFetchableTemplateUrl(templateUrl) : null
    if (templateUrl && !templateTarget) {
      console.warn('[generate-certificate] refused non-public certificate template URL')
    }
    if (templateTarget) {
      try {
        const imgRes = await fetch(templateTarget.toString())
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer())
          // pureimage can decode PNG/JPEG from stream
          const { Readable } = await import('stream')
          const stream = Readable.from(buf)
          const img = await (PImage.decodePNGFromStream
            ? PImage.decodePNGFromStream(stream).catch(async () => {
                const stream2 = Readable.from(buf)
                return PImage.decodeJPEGFromStream
                  ? PImage.decodeJPEGFromStream(stream2)
                  : null
              })
            : null)
          if (img) {
            ctx.drawImage(img, 0, 0, W, H)
            usedTemplate = true
          }
        }
      } catch {
        usedTemplate = false
      }
    }
    if (!usedTemplate) {
      ctx.fillStyle = '#F4EFE1'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#14110E'
      ctx.fillRect(40, 40, W - 80, H - 80)
      ctx.fillStyle = '#F4EFE1'
      ctx.fillRect(48, 48, W - 96, H - 96)
    }

    // Overlay name near center
    ctx.fillStyle = '#14110E'
    // pureimage has limited font support — use fillText if available
    try {
      ctx.font = '48pt sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(name, W / 2, H * 0.55)
      ctx.font = '20pt sans-serif'
      ctx.fillText(title, W / 2, H * 0.55 + 56)
      if (ev.date) {
        ctx.font = '14pt sans-serif'
        ctx.fillText(String(ev.date), W / 2, H * 0.55 + 90)
      }
    } catch {
      // fallback: colored bar as marker
      ctx.fillStyle = '#FF4D2E'
      ctx.fillRect(W / 2 - 200, H * 0.52, 400, 8)
    }

    const chunks: Uint8Array[] = []
    const { Writable } = await import('stream')
    const sink = new Writable({ write(chunk: any, _e: any, next: any) { chunks.push(chunk); next() } })
    await PImage.encodePNGToStream(canvas, sink as any)
    const png = Buffer.concat(chunks)

    const filePath = `certs/${reg.event_id}/${reg.id}.png`
    const { error: upErr } = await sb.storage
      .from('certificates')
      .upload(filePath, png, { contentType: 'image/png', upsert: true })
    if (upErr) return fail(res, 500, 'Could not store the certificate', upErr)

    const { data: urlData } = sb.storage.from('certificates').getPublicUrl(filePath)
    const certificate_url = urlData.publicUrl
    await sb.from('event_responses').update({ certificate_url }).eq('id', reg.id)

    return res.status(200).json({ certificate_url })
  } catch (err) {
    return fail(res, 500, 'Internal error', err)
  }
}

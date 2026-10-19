/**
 * POST /api/payments
 *
 * THE one serverless entry point for the direct-UPI paid flow (see
 * supabase/migrations/002_payments.sql and TODO-PAYMENTS.md §2). It replaced
 * the deleted razorpay.ts integration for real-money decisions.
 *
 * Actions
 * ───────
 * GET ?action=status&registration_id=<uuid>&code=<code>   (public, 30/min/IP)
 *   → 200 { ok:true, payment_state, registration_status, seats_left,
 *           unique_code, ticket_state, ticket_image_url?, hold_expired,
 *           message? }
 *   ticket_state:
 *     'generated'  when event_responses.ticket_url is set on the registration
 *                  (ticket_image_url then carries a 120s signed URL),
 *     'generating' within 90s after a confirm (payment_proofs.created_at is
 *                  the confirm-time reference),
 *     omitted otherwise.
 *   Aliases for client tolerance: `state` (= payment_state) and
 *   `image_url` (= ticket_image_url).
 *   Unknown id / mismatched code answers 200 (never 404) with the same
 *   uniform, enumeration-safe body:
 *     { ok:false, message:'Registration not found or hold expired.',
 *       hold_expired:true, registration_status:'unknown' }
 *
 * POST {action:'confirm', registration_id, code}          (public, 10/min/IP)
 *   Look up the registration by id + unique_code (service role). The payment
 *   screenshot is uploaded CLIENT-DIRECT by the browser into the private
 *   `payment-proofs` bucket at {event_id}/{registration_id}/proof-*.ext, so
 *   confirm picks the NEWEST object in that folder, downloads it via the
 *   service key and hashes it to sha256:
 *     409 { error:'proof-missing',  message:'No payment screenshot uploaded yet.' }
 *     409 { error:'duplicate-proof',
 *           message:'This screenshot was already used for another registration.
                    Please upload a different screenshot.' }
 *         — an earlier proof row in the SAME event carries the same sha256 for
 *           a DIFFERENT registration_id. The current proof row is inserted
 *           FIRST via service role with status='duplicate' (upsert on
 *           unique(registration_id)) before answering.
 *     409 { error:'hold-expired',
 *           message:'Your 15-minute hold expired — please re-register.',
 *           registration_status:'cancelled' } for expired/voided holds (also
 *           used when the row exists as cancelled), and
 *     409 { error:'not-ready', …, registration_status:'unknown' } when the
 *           id+code pair matches nothing.
 *   Otherwise the service role calls the seat gate RPC
 *     resolve_payment_confirmed(registration, proof_path, sha)
 *   → RETURNS TABLE (registration_id, final_status, payment_state):
 *     200 { ok:true, status:'confirmed'|'waitlisted', payment_state,
 *           registration_status, seats_left, unique_code, ticket_state,
 *           ticket_image_url?, message? }
 *     - final_status 'confirmed' → the ticket is generated SERVER-SIDE by an
 *       internal POST to /api/generate-ticket (x-forwarded-host origin, both
 *       `x-internal-secret` and `Authorization: Bearer` set to the internal
 *       secret), awaited with a tolerant deadline (~20s budget, cut short to
 *       stay under the client's 20s abort). Failure is logged only — status
 *       then answers 'generating' and the next poll finds the ticket_url.
 *       Re-pressing Register on an already-confirmed registration is an
 *       idempotent 200 (re-issued ticket info, seat count unchanged).
 *     - final_status 'waitlisted' (capacity gone while the hold was live) →
 *       200 with status:'waitlisted' and the refund copy below. No ticket is
 *       generated (internal generation only happens for confirmed).
 *
 * POST {action:'verify'|'reject', registration_id}        (staff bearer)
 *   Org admin / host / superadmin of the registration's event. 401 without a
 *   session (resolveCaller), 403 without event access (requireResponseAccess).
 *   The verdict RPC verify_payment_proof(uuid, boolean) runs with the CALLER's
 *   JWT (Supabase client created with the anon key + Authorization header —
 *   the same pattern resolveCaller uses), because the SECURITY DEFINER
 *   function reads auth.uid() itself. 200 {ok:true} on success.
 *
 * Rate limits: status 30/min/IP (uniform before the lookup so the limiter
 * itself cannot be used as an existence oracle); confirm 10/min/IP; staff
 * verdicts 30/10min/caller.
 *
 * All shared helpers are INLINED (duplicated on purpose): the previous
 * revision loaded them with `await import('./_lib/...')` and every endpoint
 * failed on Vercel at init with FUNCTION_INVOCATION_FAILED. See the header
 * comment in generate-ticket.ts. api/_lib/ remains the canonical copy that
 * the unit tests import.
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

export async function serviceClient(): Promise<any | null> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabaseMod: any = await import('@supabase/supabase-js')
  return supabaseMod.createClient(url, key, { auth: { persistSession: false } })
}

/* ── Payments-specific constants ─────────────────────────────────────────────── */

/** 'generating' is answered within this window after a confirm. */
const GENERATING_WINDOW_MS = 90_000

/** Signed URL lifetime for ticket_image_url (private `tickets` bucket). */
const SIGNED_URL_TTL_SECONDS = 120

/**
 * How long confirm may wait on the internal generate-ticket call. The client
 * aborts its own confirm request at 20s, so the deadline stays short enough
 * for confirm's own DB round-trips to fit inside it ("~20s" budget).
 */
const TICKET_KICK_TIMEOUT_MS = 15_000

/** Exact client-visible copy (constants duplicated client-side in PaymentPanel). */
const NOT_FOUND_MESSAGE = 'Registration not found or hold expired.'
const HOLD_EXPIRED_MESSAGE = 'Your 15-minute hold expired — please re-register.'
const DUPLICATE_PROOF_MESSAGE =
  'This screenshot was already used for another registration. Please upload a different screenshot.'
const WAITLIST_MESSAGE =
  'Seats just filled — you are on the waiting list. The club will contact you about refunds/transfer.'
const GENERATING_MESSAGE = 'Payment recorded — your ticket is being generated.'
const GENERATED_MESSAGE = 'Your ticket is ready.'
const REJECTED_PROOF_MESSAGE =
  'The club could not verify this screenshot. Upload a clearer one or contact the club.'

const STATUS_REG_SELECT =
  'id, event_id, status, payment_state, hold_expires_at, unique_code, ticket_url'
const CONFIRM_REG_SELECT =
  'id, event_id, status, payment_state, hold_expires_at, unique_code, ticket_url, events(price)'

/* ── Payments-specific helpers ───────────────────────────────────────────────── */

/** Shared server-to-server secret (same composite as on-registration.ts). */
function internalSecret(): string {
  return process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || process.env.SETUP_SECRET || ''
}

/**
 * Normalise `event_responses.ticket_url` into an object path INSIDE the
 * `tickets` bucket (identical copy of on-registration.ts's helper — new rows
 * hold a storage path, pre-migration rows hold a full public URL).
 * Returns null when there is nothing usable.
 */
export function ticketStoragePath(stored: unknown): string | null {
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

/** Short-lived signed URL for a registration's ticket PNG (display only). */
async function signTicketImage(sb: any, stored: unknown): Promise<string | null> {
  const path = ticketStoragePath(stored)
  if (!path) return null
  try {
    const { data, error } = await sb.storage.from('tickets').createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (error) {
      console.error('[api] ticket sign failed for', path, ':', JSON.stringify(error))
      return null
    }
    if (!data?.signedUrl) {
      console.error('[api] ticket sign returned no URL for', path, '- payload keys:', data ? Object.keys(data).join(',') : 'data-null')
      return null
    }
    return String(data.signedUrl)
  } catch (e) {
    console.error('[api] ticket sign threw for', path, ':', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    return null
  }
}

/** Hold-aware seats left for the event (event_seat_status view); null = unlimited/unknown. */
async function loadSeatsLeft(sb: any, eventId: string): Promise<number | null> {
  try {
    const { data } = await sb.from('event_seat_status').select('seats_left').eq('id', eventId).maybeSingle()
    const n = Number(data?.seats_left)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** payment_proofs.created_at — the confirm-time reference for the 90s window. */
async function loadProofCreatedAt(sb: any, registrationId: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from('payment_proofs')
      .select('created_at')
      .eq('registration_id', registrationId)
      .maybeSingle()
    return data?.created_at ? String(data.created_at) : null
  } catch {
    return null
  }
}

/**
 * The broadcast upload is CLIENT-DIRECT into the private `payment-proofs`
 * bucket ({event_id}/{registration_id}/proof-*.ext), so confirm picks the
 * newest object in the folder itself. Returns the full object path, or null
 * when the folder is empty/unreadable.
 */
async function newestProofObjectPath(sb: any, eventId: string, registrationId: string): Promise<string | null> {
  const folder = `${eventId}/${registrationId}`
  let objects: any[]
  try {
    const { data, error } = await sb.storage
      .from('payment-proofs')
      .list(folder, { limit: 100, sortBy: { column: 'updated_at', order: 'desc' } })
    if (error || !Array.isArray(data)) return null
    objects = data.filter((o: any) => o && o.id && o.name) // id null = folder entry, skip
  } catch {
    return null
  }
  if (!objects.length) return null
  const ts = (o: any): number => {
    const t = Date.parse(String(o.updated_at || o.created_at || ''))
    return Number.isFinite(t) ? t : 0
  }
  objects.sort((a: any, b: any) => ts(b) - ts(a))
  return `${folder}/${objects[0].name}`
}

/** Download the proof bytes via the service key and hash them (sha-256 hex). */
async function downloadAndHashProof(sb: any, path: string): Promise<string | null> {
  try {
    const { data, error } = await sb.storage.from('payment-proofs').download(path)
    if (error || !data) return null
    const buf = Buffer.from(await (data as unknown as Blob).arrayBuffer())
    if (!buf.length) return null
    const crypto = await import('crypto')
    return crypto.createHash('sha256').update(buf).digest('hex')
  } catch (err) {
    console.error('[payments] proof download failed:', err)
    return null
  }
}

/**
 * Trigger /api/generate-ticket SERVER-SIDE (the confirmed path only). Sends
 * BOTH `x-internal-secret` and `Authorization: Bearer` set to the internal
 * secret so whichever header the deployed generate-ticket build validates is
 * satisfied. Best-effort: failures are logged, the caller answers
 * ticket_state 'generating' and the next status poll finds ticket_url.
 */
async function kickTicketGeneration(req: any, registrationId: string): Promise<string | null> {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const base = host ? `${proto}://${host}` : ''
  const secret = internalSecret()
  if (!base || !secret) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TICKET_KICK_TIMEOUT_MS)
    try {
      const r = await fetch(`${base}/api/generate-ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ registration_id: registrationId }),
        signal: controller.signal,
      })
      const j = await r.json().catch(() => ({}))
      return r.ok && typeof j?.ticket_url === 'string' ? j.ticket_url : null
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.error('[payments] ticket generation kick failed (tolerated):', err)
    return null
  }
}

/** The uniform, enumeration-safe not-found body (GET status only). */
function notFoundResponse(res: any): any {
  return res
    .status(200)
    .json({ ok: false, message: NOT_FOUND_MESSAGE, hold_expired: true, registration_status: 'unknown' })
}

interface PaymentView {
  paymentState: string | null
  registrationStatus: string
  seatsLeft: number | null
  ticketState: string | null
  ticketImageUrl: string | null
  holdExpired: boolean
  message: string | null
}

/**
 * Derive the client-facing payment view of one registration row:
 * ticket_state is 'generated' (with a 120s signed image URL) when ticket_url
 * exists, 'generating' within 90s after a confirm (payment_proofs.created_at
 * is the confirm reference), and otherwise the lifecycle discriminator the
 * polling UI needs ('waitlisted' / 'cancelled' / 'rejected' / 'expired'
 * routes); omitted while the row is a plain live hold.
 */
async function buildPaymentView(sb: any, reg: any): Promise<PaymentView> {
  const status = String(reg.status || '')
  const paymentState = reg.payment_state ? String(reg.payment_state) : null

  const holdField = Date.parse(String(reg.hold_expires_at || ''))
  const holdExpired =
    status === 'cancelled' ||
    (status === 'pending' && (!Number.isFinite(holdField) || holdField <= Date.now()))

  let ticketState: string | null = null
  let ticketImageUrl: string | null = null
  let message: string | null = null

  const storedTicket = String(reg.ticket_url || '')
  if (storedTicket) {
    ticketState = 'generated'
    ticketImageUrl = await signTicketImage(sb, storedTicket)
    message = GENERATED_MESSAGE
  } else {
    const createdAt = await loadProofCreatedAt(sb, String(reg.id))
    const confirmedAt = createdAt ? Date.parse(createdAt) : NaN
    if (status === 'confirmed' && Number.isFinite(confirmedAt) && Date.now() - confirmedAt < GENERATING_WINDOW_MS) {
      ticketState = 'generating'
      message = GENERATING_MESSAGE
    } else if (status === 'waitlisted') {
      ticketState = 'waitlisted'
      message = WAITLIST_MESSAGE
    } else if (status === 'cancelled') {
      ticketState = paymentState === 'rejected' ? 'rejected' : 'cancelled'
      message = paymentState === 'rejected' ? REJECTED_PROOF_MESSAGE : HOLD_EXPIRED_MESSAGE
    } else if (holdExpired) {
      ticketState = 'cancelled'
      message = HOLD_EXPIRED_MESSAGE
    }
  }

  const seatsLeft = await loadSeatsLeft(sb, String(reg.event_id))
  return { paymentState, registrationStatus: status, seatsLeft, ticketState, ticketImageUrl, holdExpired, message }
}

/* ── Actions ─────────────────────────────────────────────────────────────────── */

/** GET ?action=status — public, uniform, 404-free (see header contract). */
async function handleStatus(req: any, res: any, params: URLSearchParams): Promise<any> {
  // Uniform-ish: consumed for EVERY request (hit or miss) so the limiter
  // cannot serve as an existence oracle.
  const rl = await rateLimit(`payments:status:${clientIp(req)}`, 30, 60_000)
  if (applyLimitHeaders(res, rl)) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' })
  }

  const registrationId = String(params.get('registration_id') || '').trim()
  const code = String(params.get('code') || '').trim()
  if (!isUuid(registrationId)) return notFoundResponse(res)

  const sb = await serviceClient()
  if (!sb) return fail(res, 500, 'Server not configured')

  // Code is enforced WHEN the caller proves one (mismatch → not-found); the
  // registration UUID alone is already unguessable, which is what lets the
  // client's boot poll (before it knows the code) learn it.
  let query = sb.from('event_responses').select(STATUS_REG_SELECT).eq('id', registrationId)
  if (code) query = query.eq('unique_code', code)
  const { data: reg, error } = await query.maybeSingle()
  if (error) return fail(res, 500, 'Internal error', error)
  if (!reg) return notFoundResponse(res)

  const view = await buildPaymentView(sb, reg)

  return res.status(200).json({
    ok: true,
    payment_state: view.paymentState,
    state: view.paymentState,
    registration_status: view.registrationStatus,
    seats_left: view.seatsLeft,
    unique_code: String(reg.unique_code || ''),
    ticket_state: view.ticketState ?? undefined,
    ticket_image_url: view.ticketImageUrl ?? undefined,
    image_url: view.ticketImageUrl ?? undefined,
    hold_expired: view.holdExpired,
    message: view.message ?? undefined,
  })
}

/** 200 response for a registration that is ALREADY confirmed (idempotent re-press). */
async function confirmAlreadyDoneResponse(sb: any, req: any, res: any, reg: any): Promise<any> {
  let ticketState = 'generating'
  let ticketImageUrl: string | null = null
  let message: string | null = GENERATING_MESSAGE

  const storedTicket = String(reg.ticket_url || '')
  if (storedTicket) {
    ticketState = 'generated'
    ticketImageUrl = await signTicketImage(sb, storedTicket)
    message = GENERATED_MESSAGE
  } else {
    // Already-confirmed rows carry no ticket yet only when the internal
    // generation never landed — gently re-kick it (generate-ticket returns
    // an already-issued ticket untouched) and keep the answer at 200.
    const kickedUrl = await kickTicketGeneration(req, String(reg.id))
    if (kickedUrl) {
      ticketState = 'generated'
      ticketImageUrl = await signTicketImage(sb, kickedUrl)
      if (ticketImageUrl) message = GENERATED_MESSAGE
    }
  }

  const seatsLeft = await loadSeatsLeft(sb, String(reg.event_id))
  return res.status(200).json({
    ok: true,
    status: 'confirmed',
    payment_state: String(reg.payment_state || 'paid_unverified'),
    state: String(reg.payment_state || 'paid_unverified'),
    registration_status: 'confirmed',
    seats_left: seatsLeft,
    unique_code: String(reg.unique_code || ''),
    ticket_state: ticketState,
    ticket_image_url: ticketImageUrl ?? undefined,
    image_url: ticketImageUrl ?? undefined,
    hold_expired: false,
    message: message ?? undefined,
  })
}

/**
 * POST {action:'confirm'} — the seat gate. See the header contract for the
 * exact 200/409 shapes.
 */
async function handleConfirm(req: any, res: any, body: any): Promise<any> {
  const registrationId = String(body?.registration_id || '').trim()
  const code = String(body?.code || '').trim()
  if (!isUuid(registrationId)) return res.status(400).json({ error: 'registration_id required' })
  if (!code) return res.status(400).json({ error: 'code required' })

  const rl = await rateLimit(`payments:confirm:${clientIp(req)}`, 10, 60_000)
  if (applyLimitHeaders(res, rl)) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' })
  }

  const sb = await serviceClient()
  if (!sb) return fail(res, 500, 'Server not configured')

  const { data: reg, error } = await sb
    .from('event_responses')
    .select(CONFIRM_REG_SELECT)
    .eq('id', registrationId)
    .eq('unique_code', code)
    .maybeSingle()
  if (error) return fail(res, 500, 'Internal error', error)

  // id + code matches nothing → not-ready (NOT a 404: code is a capability).
  if (!reg) {
    return res
      .status(409)
      .json({ ok: false, error: 'not-ready', message: HOLD_EXPIRED_MESSAGE, registration_status: 'unknown' })
  }

  const notReady = (errorCode: string, registrationStatus: string) =>
    res.status(409).json({ ok: false, error: errorCode, message: HOLD_EXPIRED_MESSAGE, registration_status: registrationStatus })

  const status = String(reg.status || '')
  const price = Number(reg.events?.price)
  const isPaidEvent = Number.isFinite(price) && price > 0

  if (!isPaidEvent) {
    // The payment machine exists ONLY for paid events. Free registrations are
    // confirmed at insert; re-press is the harmless idempotent path.
    if (status === 'confirmed') return await confirmAlreadyDoneResponse(sb, req, res, reg)
    return notReady('not-ready', 'unknown')
  }
  if (status === 'confirmed') return await confirmAlreadyDoneResponse(sb, req, res, reg)
  if (status === 'waitlisted') {
    const seatsLeft = await loadSeatsLeft(sb, String(reg.event_id))
    return res.status(200).json({
      ok: true,
      status: 'waitlisted',
      payment_state: String(reg.payment_state || 'paid_unverified'),
      state: String(reg.payment_state || 'paid_unverified'),
      registration_status: 'waitlisted',
      seats_left: seatsLeft,
      unique_code: String(reg.unique_code || ''),
      ticket_state: 'waitlisted',
      hold_expired: false,
      message: WAITLIST_MESSAGE,
    })
  }
  // A cancelled row's hold is void — the payer re-registers.
  if (status === 'cancelled') return notReady('hold-expired', 'cancelled')
  if (status !== 'pending') return notReady('not-ready', 'unknown')

  // The hold must still be LIVE at confirm time; lapsed/stale holds answer
  // hold-expired BEFORE the seat gate can resurrect the row.
  const holdField = Date.parse(String(reg.hold_expires_at || ''))
  if (!Number.isFinite(holdField) || holdField <= Date.now()) {
    return notReady('hold-expired', 'cancelled')
  }

  // ── Newest proof object → sha256 ──
  const proofPath = await newestProofObjectPath(sb, String(reg.event_id), registrationId)
  if (!proofPath) {
    return res.status(409).json({ ok: false, error: 'proof-missing', message: 'No payment screenshot uploaded yet.' })
  }
  const sha = await downloadAndHashProof(sb, proofPath)
  if (!sha) return fail(res, 500, 'Could not read the uploaded screenshot, please try again.')

  // ── Duplicate screenshot detection: same sha256, same event, DIFFERENT
  //    registration → the current row is recorded FIRST (status='duplicate')
  //    so staff see the fraud flag, then the payer answers 409.
  try {
    const { data: dup } = await sb
      .from('payment_proofs')
      .select('registration_id')
      .eq('event_id', reg.event_id)
      .eq('sha256', sha)
      .neq('registration_id', registrationId)
      .limit(1)
    if (dup && dup.length) {
      await sb
        .from('payment_proofs')
        .upsert(
          {
            registration_id: registrationId,
            event_id: reg.event_id,
            path: proofPath,
            sha256: sha,
            status: 'duplicate',
          },
          { onConflict: 'registration_id' }
        )
      return res.status(409).json({ ok: false, error: 'duplicate-proof', message: DUPLICATE_PROOF_MESSAGE })
    }
  } catch (err) {
    console.error('[payments] duplicate check failed (continuing to seat gate):', err)
  }

  // ── The single seat gate (service-role-only RPC; capacity resolved under
  //    the parent events row lock, proof recorded, payment_state earned). ──
  const { data: rpcRows, error: rpcErr } = await sb.rpc('resolve_payment_confirmed', {
    p_registration: registrationId,
    p_proof_path: proofPath,
    p_sha: sha,
  })
  if (rpcErr) {
    const msg = String(rpcErr.message || '')
    if (/registration not found/i.test(msg)) return notReady('not-ready', 'unknown')
    return fail(res, 500, 'Could not confirm your payment, please try again.', rpcErr)
  }
  const rpcRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows
  const finalStatus = String(rpcRow?.final_status || '')
  if (finalStatus !== 'confirmed' && finalStatus !== 'waitlisted') {
    return fail(res, 500, 'Could not confirm your payment, please try again.', new Error(`unexpected final status: ${finalStatus || 'empty'}`))
  }

  const paymentState = String(rpcRow?.payment_state || 'paid_unverified')
  const seatsLeft = await loadSeatsLeft(sb, String(reg.event_id))

  if (finalStatus === 'waitlisted') {
    // Capacity gone at confirm. NO ticket generation for waitlisted rows.
    return res.status(200).json({
      ok: true,
      status: 'waitlisted',
      payment_state: paymentState,
      state: paymentState,
      registration_status: 'waitlisted',
      seats_left: seatsLeft,
      unique_code: String(reg.unique_code || ''),
      ticket_state: 'waitlisted',
      hold_expired: false,
      message: WAITLIST_MESSAGE,
    })
  }

  // ── Confirmed: generate the ticket server-side (best-effort, bounded). ──
  let ticketState = 'generating'
  let ticketImageUrl: string | null = null
  let message: string | null = GENERATING_MESSAGE
  const kickedUrl = await kickTicketGeneration(req, registrationId)
  if (kickedUrl) {
    ticketImageUrl = await signTicketImage(sb, kickedUrl)
    if (ticketImageUrl) {
      ticketState = 'generated'
      message = GENERATED_MESSAGE
    }
  }

  return res.status(200).json({
    ok: true,
    status: 'confirmed',
    payment_state: paymentState,
    state: paymentState,
    registration_status: 'confirmed',
    seats_left: seatsLeft,
    unique_code: String(reg.unique_code || ''),
    ticket_state: ticketState,
    ticket_image_url: ticketImageUrl ?? undefined,
    image_url: ticketImageUrl ?? undefined,
    hold_expired: false,
    message: message ?? undefined,
  })
}

/**
 * POST {action:'verify'|'reject'} — staff bearer. resolveCaller → 401,
 * requireResponseAccess → 403/404, then the verdict RPC runs with the
 * CALLER's JWT (verify_payment_proof reads auth.uid() itself).
 */
async function handleStaffVerdict(req: any, res: any, body: any, reject: boolean): Promise<any> {
  const registrationId = String(body?.registration_id || '').trim()
  if (!isUuid(registrationId)) return res.status(400).json({ error: 'registration_id required' })

  const caller = await resolveCaller(req)
  if (!caller) return fail(res, 401, 'Authentication required')

  const rl = await rateLimit(`payments:staff:${caller.id}`, 30, 10 * 60_000)
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

  const token = String(req.headers.authorization || req.headers.Authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!token || !url || !anonKey) return fail(res, 500, 'Server not configured')

  try {
    // The caller's identity is carried by the request's own JWT: the RPC
    // resolves auth.uid() through the PostgREST roles, so the staff verdict
    // is audited as the logged-in admin/host, not as the service role.
    const supabaseMod: any = await import('@supabase/supabase-js')
    const userSb = supabaseMod.createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { error } = await userSb.rpc('verify_payment_proof', {
      p_registration: registrationId,
      p_reject: reject,
    })
    if (error) {
      const msg = String(error.message || '')
      if (/not authorized/i.test(msg)) return fail(res, 403, 'Not authorized for this registration')
      if (/not authenticated/i.test(msg)) return fail(res, 401, 'Authentication required')
      return fail(res, 500, 'Could not record that decision, please try again.', error)
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    return fail(res, 500, 'Could not record that decision, please try again.', err)
  }
}

/* ── Router ──────────────────────────────────────────────────────────────────── */

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return

  if (req.method === 'GET') {
    const raw = String(req.url || '')
    const qsStart = raw.indexOf('?')
    const params = new URLSearchParams(qsStart >= 0 ? raw.slice(qsStart + 1) : '')
    const action = String(params.get('action') || '')
    if (action !== 'status') return res.status(400).json({ error: 'Unsupported action' })
    try {
      return await handleStatus(req, res, params)
    } catch (err) {
      return fail(res, 500, 'Internal error', err)
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = readBody(req)
    if (body === null) return fail(res, 400, 'Invalid request body')

    const action = String(body?.action || '')
    if (action === 'confirm') return await handleConfirm(req, res, body)
    if (action === 'verify' || action === 'reject') {
      return await handleStaffVerdict(req, res, body, action === 'reject')
    }
    return fail(res, 400, 'Unsupported action')
  } catch (err) {
    return fail(res, 500, 'Internal error', err)
  }
}

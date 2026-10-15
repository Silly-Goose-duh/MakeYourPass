/**
 * POST /api/razorpay
 *
 * SERVER-AUTHORITATIVE CHECKOUT. The client never tells us how much to charge.
 *
 * ── Why this file was rewritten ────────────────────────────────────────────
 * The old handler had three fatal flaws, each independently worth money:
 *   (a) `create-order` read `amount` straight out of the request body. Posting
 *       `{action:'create-order', amount:100}` for a ₹5000 event charged ₹1 and
 *       the platform then marked the registration confirmed.
 *   (b) `verify-payment` only recomputed the HMAC. It never talked to Razorpay,
 *       so a *valid signature on an unpaid/failed/partial order* verified fine,
 *       and the amount was never compared to anything.
 *   (c) `expectedSignature === razorpay_signature` is a plain `===` on a secret
 *       MAC — a textbook timing oracle.
 *
 * ── Contract ───────────────────────────────────────────────────────────────
 * action: "create-order"
 *   body:     { event_id: uuid, registration_id?: uuid, quantity?: 1..10 }
 *   200:      { id, amount, currency: 'INR', key_id }
 *   errors:   400 invalid input / event not paid / bad price
 *             401 anonymous without a registration_id
 *             403 logged in but not allowed on this event
 *             404 unknown event or registration
 *             429 rate limited
 *
 * action: "verify-payment"
 *   body:     { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *   200:      { verified: true, payment_id, amount, registration_id }
 *             { verified: true, payment_id, duplicate: true }   (already credited)
 *             { verified: false, reason: string }               (200, see below)
 *   400:      missing/malformed fields
 *   429:      rate limited
 *
 * `verified:false` is deliberately a 200: it is a *business* outcome (failed
 * payment, amount mismatch, replay), not a server fault. Every *unexpected*
 * fault goes through `fail(res, 500, 'Internal error', err)` so an upstream
 * Razorpay message is never echoed to the browser.
 *
 * ── Authentication model (create-order) ────────────────────────────────────
 * Anonymous students pay, so `resolveCaller()` alone cannot gate this endpoint.
 * The rule (pragmatic, not perfect):
 *   - If a Supabase access token is present, the caller must either pass
 *     `requireEventAccess()` (org admin / host / superadmin — i.e. the host
 *     selling at the door) or own the registration (email match).
 *   - If no token is present, the caller MUST pass `registration_id`, which must
 *     exist and belong to `event_id` ("anonymous self-checkout").
 * Residual risk, accepted and documented: a self-checkout proves knowledge of an
 * unguessable registration UUID, not identity. Someone who somehow learns a
 * stranger's registration id could pay that stranger's real, full price in
 * advance and mark it paid — no money is lost, and no discount is possible.
 * Closing that fully needs an emailed one-time code, which is out of scope here.
 *
 * ── verify-payment authentication ──────────────────────────────────────────
 * The registration id is NOT taken from the request. It is read back out of the
 * Razorpay ORDER's notes, which this handler wrote server-side after it had
 * validated the registration itself. The client therefore cannot retarget a
 * verified payment at a different registration.
 *
 * "Not already confirmed" is checked against `payment_status`, not `status`:
 * `event_responses.status` is a ticketing/admission flag that the
 * `submit_event_response` RPC already defaults to 'confirmed' at insert time, so
 * gating on it would reject every legitimate purchase. The payment equivalent
 * is `payment_status = 'verified'`.
 *
 * ── Money units ───────────────────────────────────────────────────────────
 * `events.price` is `NUMERIC(10,2)` (supabase/migration.sql) — MAJOR units,
 * i.e. RUPEES. Razorpay's `amount` is the SMALLEST unit, i.e. PAISE. So the
 * authoritative conversion is `Math.round(price * 100) * quantity`. The
 * converted figure is stored on the order as `notes.amount_paise` purely as a
 * cross-check; the real assertion at verification time re-reads `events.price`.
 *
 * ── Vercel bundler constraint ──────────────────────────────────────────────
 * Everything heavy (`razorpay`, `@supabase/supabase-js`, `./_lib/*`) is
 * dynamically imported INSIDE the handler. Top-level imports crashed the
 * function bundler — see the header comment in api/generate-ticket.ts.
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

export async function serviceClient(): Promise<any | null> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabaseMod: any = await import('@supabase/supabase-js')
  return supabaseMod.createClient(url, key, { auth: { persistSession: false } })
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Vercel gives us untyped req/res. */

/** Razorpay only speaks INR here; never let the client pick a currency. */
const CURRENCY = 'INR'

/** Upper sanity bound: 1 crore rupees. NUMERIC(10,2) allows more than Razorpay. */
const MAX_AMOUNT_PAISE = 1_000_000_000

/** Tickets per order. Keeps one order from becoming an unbounded bulk discount. */
const MAX_QUANTITY = 10

const RATE_WINDOW_MS = 10 * 60 * 1000

type Handler = (req: any, res: any) => Promise<unknown>

/** `fail()` from api/_lib/http, injected so the helpers never re-import it. */
type FailFn = (res: any, status: number, publicMessage: string, err?: unknown) => any

interface EventRow {
  id: string
  title: string
  payment_type: string | null
  price: number | string | null
  status: string | null
}

interface RegistrationRow {
  id: string
  event_id: string
  status: string | null
  payment_status: string | null
  payment_proof_url: string | null
  respondent_email: string | null
}

/**
 * The marker we write into `event_responses.payment_proof_url` once a
 * Razorpay payment is credited. `payment_proof_url` is a plain TEXT column
 * (supabase/phase7-org-portal-upi.sql) that today only ever holds UPI
 * screenshot URLs, so prefixing keeps the two worlds distinguishable and gives
 * us a durable idempotency key without adding a column.
 */
const PAYMENT_REF_PREFIX = 'razorpay:'

function proofMarker(paymentId: string): string {
  return `${PAYMENT_REF_PREFIX}${paymentId}`
}

/** True when this registration row already records THIS payment. */
function marksPayment(row: RegistrationRow, paymentId: string): boolean {
  const url = String(row.payment_proof_url || '')
  return url.includes(paymentId)
}

/**
 * Convert the authoritative rupee price into integer paise.
 * Returns null when the stored price is unusable.
 */
function toPaise(price: unknown, quantity: number): number | null {
  const rupees = typeof price === 'string' ? Number(price.trim()) : Number(price)
  if (!Number.isFinite(rupees) || rupees <= 0) return null
  const paise = Math.round(rupees * 100) * quantity
  if (!Number.isSafeInteger(paise) || paise <= 0) return null
  if (paise > MAX_AMOUNT_PAISE) return null
  return paise
}

/** Razorpay ids are `order_XXXXXXXX` / `pay_XXXXXXXX`. */
const ORDER_ID_RE = /^order_[A-Za-z0-9_]+$/
const PAYMENT_ID_RE = /^pay_[A-Za-z0-9_]+$/
const SIGNATURE_RE = /^[a-f0-9]{64}$/i

/**
 * Constant-time HMAC comparison.
 * `crypto.timingSafeEqual` THROWS when the two buffers differ in length, so the
 * length check has to come first and must itself not short-circuit the compare.
 */
async function signatureMatches(
  orderId: string,
  paymentId: string,
  provided: string,
  secret: string
): Promise<boolean> {
  const crypto = await import('crypto')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Lazily built Razorpay SDK client (dynamic import — see bundler note above). */
async function getRazorpay(): Promise<any> {
  const key_id = process.env.RAZORPAY_KEY_ID || ''
  const key_secret = process.env.RAZORPAY_KEY_SECRET || ''
  if (!key_id || !key_secret) {
    throw new Error('Razorpay not configured — missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET')
  }
  const mod: any = await import('razorpay')
  const Razorpay = mod?.default || mod
  return new Razorpay({ key_id, key_secret })
}

async function createOrder(body: any, req: any, res: any, fail: FailFn) {

  const limit = await rateLimit(`rl:razorpay:create:${clientIp(req)}`, 10, RATE_WINDOW_MS)
  if (applyLimitHeaders(res, limit)) {
    return res.status(429).json({ error: 'Too many checkout attempts — try again shortly' })
  }

  const event_id = body?.event_id
  const registration_id = body?.registration_id
  const quantity = body?.quantity === undefined ? 1 : Number(body.quantity)

  if (!isUuid(event_id)) return fail(res, 400, 'Invalid event_id')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return fail(res, 400, `quantity must be an integer between 1 and ${MAX_QUANTITY}`)
  }
  if (registration_id !== undefined && registration_id !== null && registration_id !== '' && !isUuid(registration_id)) {
    return fail(res, 400, 'Invalid registration_id')
  }

  const sb = await serviceClient()
  if (!sb) return fail(res, 500, 'Server not configured')

  // ── Authoritative price lookup. The client never supplies an amount. ──────
  const { data: ev, error: evErr } = await sb
    .from('events')
    .select('id, title, payment_type, price, status')
    .eq('id', event_id)
    .maybeSingle()
  if (evErr) return fail(res, 500, 'Could not load event', evErr)
  if (!ev) return fail(res, 404, 'Event not found')

  const event = ev as EventRow
  if (String(event.payment_type || '') !== 'paid') {
    return fail(res, 400, 'This event is not a paid event')
  }
  if (String(event.status || '') === 'cancelled') {
    return fail(res, 400, 'This event has been cancelled')
  }

  const amount = toPaise(event.price, quantity)
  if (amount === null) return fail(res, 400, 'This event has no valid ticket price')

  // ── Optional registration binding (anonymous self-checkout / owner) ────────
  let registration: RegistrationRow | null = null
  if (isUuid(registration_id)) {
    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('id, event_id, status, payment_status, payment_proof_url, respondent_email')
      .eq('id', registration_id)
      .maybeSingle()
    if (regErr) return fail(res, 500, 'Could not load registration', regErr)
    if (!reg) return fail(res, 404, 'Registration not found')
    if ((reg as RegistrationRow).event_id !== event_id) {
      return fail(res, 400, 'Registration does not belong to this event')
    }
    if (String((reg as RegistrationRow).status || '') === 'cancelled') {
      return fail(res, 400, 'This registration was cancelled')
    }
    if (String((reg as RegistrationRow).payment_status || '') === 'verified') {
      return fail(res, 400, 'This registration is already paid')
    }
    registration = reg as RegistrationRow
  }

  // ── Authorization: signed-in organizer/owner, else anonymous self-checkout ─
  const caller = await resolveCaller(req)
  if (caller) {
    const ownsRegistration =
      !!registration &&
      !!caller.email &&
      String(registration.respondent_email || '').toLowerCase() === caller.email.toLowerCase()

    const access = await requireEventAccess(sb, caller, event_id)
    if (!access.ok && !ownsRegistration) {
      return fail(res, access.status === 404 ? 404 : 403, access.error)
    }
  } else if (!registration) {
    return fail(res, 401, 'Sign in, or pass registration_id to pay for your own registration')
  }

  const client = await getRazorpay()
  const notes: Record<string, string> = {
    event_id: String(event_id),
    registration_id: registration ? String(registration.id) : '',
    amount_paise: String(amount),
    quantity: String(quantity),
  }
  const order = await client.orders.create({
    amount,
    currency: CURRENCY,
    // Receipt must be <= 40 chars and unique per order.
    receipt: `myp_${event_id.slice(0, 8)}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    notes,
  })

  return res.status(200).json({
    id: order.id,
    amount: order.amount,
    currency: order.currency || CURRENCY,
    // Public by design — the browser needs it to open Razorpay Checkout.
    key_id: process.env.RAZORPAY_KEY_ID || '',
  })
}

async function verifyPayment(body: any, req: any, res: any, fail: FailFn) {

  const limit = await rateLimit(`rl:razorpay:verify:${clientIp(req)}`, 30, RATE_WINDOW_MS)
  if (applyLimitHeaders(res, limit)) {
    return res.status(429).json({ error: 'Too many verification attempts — try again shortly' })
  }

  const razorpay_order_id = String(body?.razorpay_order_id || '')
  const razorpay_payment_id = String(body?.razorpay_payment_id || '')
  const razorpay_signature = String(body?.razorpay_signature || '')

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return fail(res, 400, 'Missing payment verification fields')
  }
  if (!ORDER_ID_RE.test(razorpay_order_id) || !PAYMENT_ID_RE.test(razorpay_payment_id)) {
    return fail(res, 400, 'Malformed Razorpay identifiers')
  }
  if (!SIGNATURE_RE.test(razorpay_signature)) {
    return fail(res, 400, 'Malformed payment signature')
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || ''
  if (!secret) return fail(res, 500, 'Server not configured')

  // 1) HMAC, constant time.
  const sigOk = await signatureMatches(razorpay_order_id, razorpay_payment_id, razorpay_signature.toLowerCase(), secret)
  if (!sigOk) {
    return res.status(200).json({ verified: false, reason: 'signature_mismatch' })
  }

  // 2) Ask Razorpay what actually happened. A valid signature over a failed or
  //    unpaid order is useless, so nothing below trusts the client's claims.
  const client = await getRazorpay()
  const [payment, order] = await Promise.all([
    client.payments.fetch(razorpay_payment_id),
    client.orders.fetch(razorpay_order_id),
  ])

  // 3) The money must actually be captured, and it must be for THIS order.
  if (String(payment?.status || '') !== 'captured' || payment?.captured !== true) {
    return res.status(200).json({
      verified: false,
      reason: 'payment_not_captured',
      payment_status: String(payment?.status || 'unknown'),
    })
  }
  if (String(payment?.order_id || '') !== razorpay_order_id) {
    return res.status(200).json({ verified: false, reason: 'payment_order_mismatch' })
  }
  if (String(payment?.currency || CURRENCY) !== CURRENCY) {
    return res.status(200).json({ verified: false, reason: 'currency_mismatch' })
  }
  const paidPaise = Number(payment?.amount)
  if (!Number.isFinite(paidPaise) || paidPaise <= 0) {
    return res.status(200).json({ verified: false, reason: 'payment_amount_unknown' })
  }

  // Notes are a CROSS-CHECK, not the source of truth.
  const notes = (order?.notes && typeof order.notes === 'object' ? order.notes : {}) as Record<string, unknown>
  const notesEventId = String(notes.event_id || '')
  const notesRegistrationId = String(notes.registration_id || '')
  const notesAmount = Number(notes.amount_paise)
  const quantity = Math.max(1, Math.round(Number(notes.quantity) || 1))

  if (!isUuid(notesEventId)) {
    return res.status(200).json({ verified: false, reason: 'order_not_created_by_this_platform' })
  }
  if (!isUuid(notesRegistrationId)) {
    return res.status(200).json({ verified: false, reason: 'order_has_no_registration' })
  }
  if (Number.isFinite(notesAmount) && notesAmount !== paidPaise) {
    return res.status(200).json({ verified: false, reason: 'notes_amount_mismatch' })
  }
  if (Number(order?.amount_paid) !== paidPaise || Number(order?.amount) !== paidPaise) {
    return res.status(200).json({ verified: false, reason: 'order_amount_mismatch' })
  }

  // 4) THE authoritative check: re-read the live event price from Postgres and
  //    recompute what this payment had to be. Trusting notes alone would let a
  //    tampered/stale order through.
  const sb = await serviceClient()
  if (!sb) return fail(res, 500, 'Server not configured')

  const { data: ev, error: evErr } = await sb
    .from('events')
    .select('id, title, payment_type, price, status')
    .eq('id', notesEventId)
    .maybeSingle()
  if (evErr) return fail(res, 500, 'Could not load event', evErr)
  if (!ev) return res.status(200).json({ verified: false, reason: 'event_not_found' })

  const event = ev as EventRow
  if (String(event.payment_type || '') !== 'paid') {
    return res.status(200).json({ verified: false, reason: 'event_not_paid' })
  }
  const expectedPaise = toPaise(event.price, quantity)
  if (expectedPaise === null) {
    return fail(res, 400, 'Event price is not valid for payment')
  }
  if (paidPaise !== expectedPaise) {
    return res.status(200).json({
      verified: false,
      reason: 'amount_mismatch',
      expected_amount: expectedPaise,
      received_amount: paidPaise,
    })
  }

  // 5) The registration this payment belongs to.
  const { data: reg, error: regErr } = await sb
    .from('event_responses')
    .select('id, event_id, status, payment_status, payment_proof_url, respondent_email')
    .eq('id', notesRegistrationId)
    .maybeSingle()
  if (regErr) return fail(res, 500, 'Could not load registration', regErr)
  if (!reg) return res.status(200).json({ verified: false, reason: 'registration_not_found' })

  const registration = reg as RegistrationRow
  if (registration.event_id !== notesEventId) {
    return res.status(200).json({ verified: false, reason: 'registration_event_mismatch' })
  }
  if (String(registration.status || '') === 'cancelled') {
    return res.status(200).json({ verified: false, reason: 'registration_cancelled' })
  }

  // 6) Idempotency. The payment id is our durable marker, so a replay against
  //    the SAME registration is a benign no-op, and a replay against a
  //    DIFFERENT registration is an attack.
  const alreadyThisOne = marksPayment(registration, razorpay_payment_id)
  if (alreadyThisOne && String(registration.payment_status || '') === 'verified') {
    return res.status(200).json({
      verified: true,
      duplicate: true,
      payment_id: razorpay_payment_id,
      registration_id: registration.id,
      amount: paidPaise,
    })
  }
  if (String(registration.payment_status || '') === 'verified') {
    return res.status(200).json({
      verified: false,
      reason: 'registration_already_paid',
      registration_id: registration.id,
    })
  }

  const { data: usedElsewhere, error: usedErr } = await sb
    .from('event_responses')
    .select('id')
    .ilike('payment_proof_url', `%${razorpay_payment_id}%`)
    .neq('id', registration.id)
    .limit(1)
  if (usedErr) return fail(res, 500, 'Could not check payment reuse', usedErr)
  if (usedElsewhere && usedElsewhere.length > 0) {
    return res.status(200).json({ verified: false, reason: 'payment_already_used' })
  }

  // 7) Credit the registration.
  const { error: updErr } = await sb
    .from('event_responses')
    .update({
      payment_status: 'verified',
      payment_verified_at: new Date().toISOString(),
      payment_proof_url: proofMarker(razorpay_payment_id),
    })
    .eq('id', registration.id)
  if (updErr) return fail(res, 500, 'Could not record the payment', updErr)

  return res.status(200).json({
    verified: true,
    payment_id: razorpay_payment_id,
    order_id: razorpay_order_id,
    registration_id: registration.id,
    event_id: notesEventId,
    amount: paidPaise,
    currency: CURRENCY,
  })
}

const handler: Handler = async (req: any, res: any) => {

  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = readBody(req)
    if (!body) return fail(res, 400, 'Invalid JSON body')

    const action = String(body.action || '')
    if (action === 'create-order') return await createOrder(body, req, res, fail)
    if (action === 'verify-payment') return await verifyPayment(body, req, res, fail)

    return fail(res, 400, 'Unknown action. Use "create-order" or "verify-payment".')
  } catch (err: unknown) {
    // Never surface the upstream Razorpay/Supabase message to the browser.
    return fail(res, 500, 'Internal error', err)
  }
}

export default handler
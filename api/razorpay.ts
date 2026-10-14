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
  const { rateLimit, applyLimitHeaders, clientIp } = await import('./_lib/rateLimit')
  const { isUuid } = await import('./_lib/http')
  const { resolveCaller, requireEventAccess, serviceClient } = await import('./_lib/authz')

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
  const { rateLimit, applyLimitHeaders, clientIp } = await import('./_lib/rateLimit')
  const { isUuid } = await import('./_lib/http')
  const { serviceClient } = await import('./_lib/authz')

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
  const { applyCors, fail, readBody } = await import('./_lib/http')

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
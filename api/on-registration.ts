/**
 * POST /api/on-registration
 *
 * Modes:
 *  A) { registration_id, force?, kind?: 'ticket'|'reminder' }  — send ticket email
 *  B) { action:'resend', event_id, email }                     — public self-serve resend
 *  C) webhook shape { record: { id } }                         (same as A)
 *
 * Internal-only extra: { internal_skip_regen: true } is honoured ONLY when the
 * caller presented the internal secret; it lets the T-24h cron use `force`
 * (bypass the already-emailed guard) without re-rendering every ticket PNG.
 *
 * ── AUTH (this endpoint used to be completely open) ──────────────────────────
 * Mode A now requires EITHER:
 *   (a) `Authorization: Bearer <supabase access token>` for a superadmin / org
 *       admin / host of the registration's event (resolveCaller +
 *       requireResponseAccess → 401 unauthenticated, 403 wrong org), OR
 *   (b) the server-to-server `x-internal-secret` header
 *       (INTERNAL_API_SECRET || CRON_SECRET || SETUP_SECRET), which is how the
 *       T-24h cron in reachout.ts calls us — it has no user session.
 *
 * Without (a) or (b) an anonymous request is only honoured inside
 * PUBLIC_SEND_WINDOW_MS right after the attendee submits the public form and
 * only without `force`/`kind:'reminder'`. That keeps the anonymous signup
 * funnel (PublicEventForm POSTs this endpoint ~1s after inserting the row)
 * working while closing the hole where anyone who learned a registration_id
 * could force-resend any attendee's ticket and bill our Resend account.
 * Everything else anonymous is 401.
 *
 * Mode B (self-serve) stays anonymous by design, but it is now a FIXED-ANSWER
 * endpoint: it always replies 200 with the same generic message, so it can no
 * longer be used to enumerate which addresses are registered on an event. The
 * send happens silently and its result is never disclosed.
 *
 * ── DELETED ──────────────────────────────────────────────────────────────────
 * The `action: 'product-report' | 'next-steps' | 'agent-vault-investor-brief'`
 * branch was removed. It was an UNAUTHENTICATED, UNSECRETED, UNRATE-LIMITED
 * open email relay that mailed a hardcoded personal gmail address from our
 * sending domain, and it embedded a full investor brief in a public ticketing
 * endpoint. It is not "protected", it is gone.
 *
 * ── RATE LIMITS ──────────────────────────────────────────────────────────────
 *   Mode B: 5 / 10 min / IP   — an email-per-request oracle doubles as a
 *                               Resend-quota burner; 5 is what a human needs
 *                               when the mail lands in spam.
 *   Mode A: 30 / 10 min / caller, 10 / 10 min / IP when anonymous.
 *   Plus the original 60s per-registration cooldown on the self-serve path.
 *
 * All shared helpers are DYNAMICALLY imported inside the handler: static
 * top-level imports crash the Vercel function bundler (see the header comment
 * in generate-ticket.ts).
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

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
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

/* eslint-disable @typescript-eslint/no-explicit-any */

// The one and only answer the public resend endpoint ever gives.
const GENERIC_RESEND_MESSAGE = 'If that email has a ticket, it has been sent.'

// Anonymous auto-ticket window right after public form submission.
const PUBLIC_SEND_WINDOW_MS = 2 * 60 * 1000

// Self-serve resend cooldown per registration (unchanged behaviour).
const RESEND_COOLDOWN_MS = 60 * 1000

const REG_SELECT =
  'id, event_id, respondent_name, respondent_email, respondent_phone, status, ' +
  'submitted_at, email_sent_at, unique_code, ticket_url, ' +
  'events(title, date, time, venue)'

function esc(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function emailShell(opts: {
  title: string
  preheader: string
  bodyHtml: string
  code?: string
}) {
  const codeBlock = opts.code
    ? `<div style="margin:20px 0;padding:14px 18px;background:#14110E;color:#FFD23F;font-family:ui-monospace,Menlo,monospace;font-size:20px;font-weight:700;letter-spacing:0.08em;border-radius:10px;display:inline-block">${esc(opts.code)}</div>`
    : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#F4EFE1;font-family:Inter,Segoe UI,Arial,sans-serif;color:#14110E">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4EFE1;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:2.5px solid #14110E;border-radius:16px;overflow:hidden;box-shadow:6px 6px 0 #14110E">
        <tr><td style="background:#FF4D2E;padding:18px 22px;border-bottom:2.5px solid #14110E">
          <div style="font-family:Syne,Arial,sans-serif;font-weight:800;font-size:18px;letter-spacing:0.04em;color:#fff;text-transform:uppercase">MakeYourPass</div>
        </td></tr>
        <tr><td style="padding:28px 24px 10px">
          <h1 style="margin:0 0 12px;font-family:Syne,Arial,sans-serif;font-size:26px;line-height:1.15;color:#14110E">${opts.title}</h1>
          ${opts.bodyHtml}
          ${codeBlock}
        </td></tr>
        <tr><td style="padding:8px 24px 28px;color:#4A4640;font-size:13px;line-height:1.5">
          Show the attached ticket QR at the door. Keep this email handy.
          <div style="margin-top:14px;color:#8A8478;font-size:11px">Sent by MakeYourPass · Marian Engineering College</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Strip CR/LF from anything that lands in an email subject (header injection). */
function safeSubjectPart(v: unknown): string {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim()
}

/** Shared server-to-server secret (cron -> api calls). Empty when unset. */
function internalSecret(): string {
  return process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || process.env.SETUP_SECRET || ''
}

/** Constant-time-ish equality check for the internal secret header. */
function hasInternalSecret(req: any): boolean {
  const expected = internalSecret()
  if (!expected) return false
  const got = String(req.headers['x-internal-secret'] || '')
  return got.length === expected.length && got === expected
}

/**
 * Normalise `event_responses.ticket_url` into an object path INSIDE the
 * `tickets` bucket.
 *
 * The `tickets` bucket is PRIVATE now (it used to be world-readable, which
 * leaked every attendee's name + QR through a public URL), so a stored path
 * can no longer be `fetch`ed directly. Rows written before the migration still
 * hold a full public URL of the shape
 *   <url>/storage/v1/object/public/tickets/<event_id>/<registration_id>.png
 * so strip that prefix (a signed-URL shape is handled too).
 *
 * The leading `tickets/` is REMOVED because `sb.storage.from('tickets')` already
 * scopes to the bucket — keeping it would address `tickets/tickets/...`.
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

/** Pull the ticket PNG out of the private bucket for the email attachment. */
async function loadTicketAttachment(sb: any, stored: unknown): Promise<Buffer | null> {
  const path = ticketStoragePath(stored)
  if (!path) return null
  try {
    const { data, error } = await sb.storage.from('tickets').download(path)
    if (error || !data) return null
    const buf = Buffer.from(await (data as unknown as Blob).arrayBuffer())
    return buf.length ? buf : null
  } catch {
    return null
  }
}

/**
 * Build + send the ticket / reminder / waitlist email for one registration.
 * Returns the ticket reference actually used and a non-leaking error note.
 */
async function deliverEmail(opts: {
  sb: any
  req: any
  reg: any
  kind: 'ticket' | 'reminder'
  regenerate: boolean
  /** Apply the 60s self-serve cooldown (public flows only). */
  cooldown: boolean
}): Promise<{ ticketUrl: string | null; ticketError: string | null }> {
  const { sb, req, reg, kind } = opts
  const ev = reg.events || {}

  // 60s guard: one self-serve resend per minute, per registration.
  if (opts.cooldown && reg.email_sent_at) {
    const last = new Date(reg.email_sent_at).getTime()
    if (Number.isFinite(last) && Date.now() - last < RESEND_COOLDOWN_MS) {
      return { ticketUrl: reg.ticket_url || null, ticketError: 'cooldown' }
    }
  }

  const title = esc(ev.title || 'your event')
  const when = [ev.date, ev.time].filter(Boolean).join(' · ')
  const where = esc(ev.venue || 'TBD')
  const name = esc(reg.respondent_name || 'there')
  const code = (reg.unique_code || '').toString()

  // Generate the ticket (reuse the deployed /api/generate-ticket function).
  let ticketUrl: string | null = reg.ticket_url || null
  let ticketError: string | null = null
  if ((!ticketUrl || opts.regenerate) && reg.status === 'confirmed') {
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const base = host ? `${proto}://${host}` : ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // generate-ticket is authenticated too: forward the caller's identity, or
    // the internal secret when this is a server-to-server call.
    const bearer = String(req.headers.authorization || req.headers.Authorization || '')
    if (bearer) headers.Authorization = bearer
    else if (internalSecret()) headers['x-internal-secret'] = internalSecret()

    const canCall = !!base && (!!bearer || !!internalSecret())
    if (canCall) {
      try {
        const r = await fetch(`${base}/api/generate-ticket`, {
          method: 'POST',
          headers,
          // force=true means the host explicitly asked to (re)generate — always regenerate.
          body: JSON.stringify({ registration_id: reg.id, regenerate: opts.regenerate }),
        })
        if (r.ok) {
          const j = await r.json().catch(() => ({}))
          ticketUrl = j.ticket_url || ticketUrl
        } else {
          // Don't silently pretend the ticket is attached. Surface it so the
          // caller knows the email may go out without a PNG.
          ticketError = `generate-ticket ${r.status}`
        }
      } catch {
        ticketError = 'generate-ticket unreachable'
      }
    } else if (!ticketUrl) {
      ticketError = 'ticket generation unauthorized'
    }
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
  if (!RESEND_API_KEY) throw new Error('Resend not configured')

  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_API_KEY)

  let subject: string
  let html: string

  if (reg.status === 'waitlisted') {
    subject = `You're on the waitlist — ${safeSubjectPart(ev.title || 'event')}`
    html = emailShell({
      title: "You're on the waitlist",
      preheader: `Waitlisted for ${ev.title || 'the event'}`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${name}, you're registered for <b>${title}</b> but it's currently full. We'll email you if a spot opens.</p>
          <p style="margin:0;font-size:14px;color:#4A4640"><b>When:</b> ${esc(when || 'TBD')}<br/><b>Where:</b> ${where}</p>`,
      code: code || undefined,
    })
  } else if (kind === 'reminder') {
    subject = `Reminder: ${safeSubjectPart(ev.title || 'your event')} is tomorrow 🎟️`
    html = emailShell({
      title: 'See you tomorrow!',
      preheader: `${ev.title || 'Event'} is tomorrow — bring your ticket`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${name}, quick reminder — <b>${title}</b> is tomorrow.</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4A4640"><b>When:</b> ${esc(when || 'TBD')}<br/><b>Where:</b> ${where}</p>
          <p style="margin:0;font-size:14px;color:#4A4640">Your ticket is attached. Show the QR at the door.</p>`,
      code: code || undefined,
    })
  } else {
    subject = `Your ticket for ${safeSubjectPart(ev.title || 'event')} 🎟️`
    html = emailShell({
      title: "You're in!",
      preheader: `Ticket confirmed for ${ev.title || 'the event'}`,
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${name}, your spot for <b>${title}</b> is confirmed.</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4A4640"><b>When:</b> ${esc(when || 'TBD')}<br/><b>Where:</b> ${where}</p>
          <p style="margin:0;font-size:14px;color:#4A4640">Your ticket PNG is attached — keep it ready at the door.</p>`,
      code: code || undefined,
    })
  }

  const attachments: { filename: string; content: Buffer }[] = []
  if (ticketUrl && reg.status === 'confirmed') {
    const png = await loadTicketAttachment(sb, ticketUrl)
    if (png) attachments.push({ filename: 'ticket.png', content: png })
  }

  const { error: sendErr } = await resend.emails.send({
    from: RESEND_FROM,
    to: reg.respondent_email,
    subject,
    html,
    attachments,
  })
  if (sendErr) throw new Error(`Resend failed: ${sendErr.message}`)

  const { error: stampErr } = await sb
    .from('event_responses')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', reg.id)
  // Log only: the mail is already out, and the per-registration cooldown is
  // backed by the per-IP rate limit if this write fails.
  if (stampErr) console.error('[on-registration] email_sent_at stamp failed:', stampErr.message || stampErr)
  return { ticketUrl, ticketError }
}

/** Anonymous self-serve resend — fixed answer, silent send. */
async function publicResend(ctx: {
  req: any
  res: any
  body: any
  sb: any
  isEmail: (v: unknown) => v is string
  isUuid: (v: unknown) => v is string
}) {
  const { req, res, body, sb, isEmail, isUuid } = ctx

  const eventId = String(body?.event_id || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email' })
  if (!isUuid(eventId)) return res.status(400).json({ error: 'Invalid request' })

  let reg: any = null
  try {
    const { data } = await sb
      .from('event_responses')
      .select(REG_SELECT)
      .eq('event_id', eventId)
      .ilike('respondent_email', email)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    reg = data || null
  } catch (err) {
    console.error('[on-registration] resend lookup failed:', err)
  }

  // Silent send. Every failure below is swallowed so the response carries no
  // information about whether the address exists, is cancelled, is on the
  // waitlist, or is still inside its 60s cooldown.
  if (reg) {
    try {
      await deliverEmail({ sb, req, reg, kind: 'ticket', regenerate: false, cooldown: true })
    } catch (err) {
      console.error('[on-registration] silent resend failed:', err)
    }
  }

  return res.status(200).json({ ok: true, message: GENERIC_RESEND_MESSAGE })
}

/**
 * Authenticated (or freshly-registered) single-registration send.
 */
async function sendForRegistration(ctx: {
  req: any
  res: any
  sb: any
  fail: (res: any, status: number, msg: string, err?: unknown) => any
  registrationId: string
  force: boolean
  regenerate: boolean
  kind: 'ticket' | 'reminder'
  authorized: boolean
}) {
  const { req, res, sb, fail, registrationId, force, regenerate, kind, authorized } = ctx

  const { data: reg, error: regErr } = await sb
    .from('event_responses')
    .select(REG_SELECT)
    .eq('id', registrationId)
    .maybeSingle()
  if (regErr) return fail(res, 500, 'Internal error', regErr)
  if (!reg) return res.status(404).json({ error: 'Registration not found' })

  if (!authorized && !isFreshPublicSend(reg, force, kind)) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  if (reg.email_sent_at && !force) return res.status(200).json({ skipped: 'already_sent' })

  // Cancelled registrations must not get a "You're in!" confirmation.
  if (reg.status === 'cancelled') {
    return res.status(409).json({ error: 'This registration was cancelled.' })
  }

  const { ticketUrl, ticketError } = await deliverEmail({
    sb,
    req,
    reg,
    kind,
    regenerate,
    cooldown: false,
  })

  if (!authorized) {
    // Anonymous funnel: do not disclose the ticket reference to the public.
    return res.status(200).json({ ok: true })
  }
  return res
    .status(200)
    .json({ ok: true, ticket_url: ticketUrl, kind, ticket_error: ticketError })
}

/** Anonymous sends are only allowed seconds after the public form insert. */
function isFreshPublicSend(reg: any, force: boolean, kind: string): boolean {
  if (force) return false // never anonymous: force is the flood vector
  if (kind === 'reminder') return false
  const submitted = new Date(reg?.submitted_at || '').getTime()
  if (!Number.isFinite(submitted)) return false
  return Date.now() - submitted < PUBLIC_SEND_WINDOW_MS
}

export default async function handler(req: any, res: any) {

  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = readBody(req)
  if (body === null) return fail(res, 400, 'Invalid request body')

  const action = String(body?.action || '')
  const isPublicResend =
    action === 'resend' || (!!body?.event_id && !!body?.email && !body?.registration_id)

  try {
    const sb = await serviceClient()
    if (!sb) return fail(res, 500, 'Server not configured')

    if (isPublicResend) {
      // Anti-enumeration: applied for EVERY request, hit or miss, so the limit
      // itself never tells an attacker whether the address is registered.
      const rl = await rateLimit(`onreg:public:${clientIp(req)}`, 5, 10 * 60 * 1000)
      if (applyLimitHeaders(res, rl)) {
        return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' })
      }
      return await publicResend({ req, res, body, sb, isEmail, isUuid })
    }

    if (action) return fail(res, 400, 'Unsupported action')

    const registrationId = String(body?.registration_id || body?.record?.id || '').trim()
    if (!isUuid(registrationId)) return res.status(400).json({ error: 'registration_id required' })

    const force = !!body?.force
    const kind = (body?.kind === 'reminder' ? 'reminder' : 'ticket') as 'ticket' | 'reminder'

    const caller = await resolveCaller(req)
    const internal = !caller && hasInternalSecret(req)
    // `force` normally also re-renders the ticket PNG (that is what the host
    // "Send ticket" button means). The T-24h cron only wants to bypass the
    // "already emailed" guard, so it may opt out — and ONLY a server-to-server
    // caller holding the internal secret may do so.
    const regenerate = force && !(internal && !!body?.internal_skip_regen)

    const rl = caller
      ? await rateLimit(`onreg:send:${caller.id}`, 30, 10 * 60 * 1000)
      : await rateLimit(`onreg:anon:${clientIp(req)}`, 10, 10 * 60 * 1000)
    if (applyLimitHeaders(res, rl)) {
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
    }

    let authorized = internal
    if (caller) {
      const access = await requireResponseAccess(sb, caller, registrationId)
      if (!access.ok) {
        if (access.status === 404) return fail(res, 404, 'Registration not found')
        return fail(res, access.status, access.error)
      }
      authorized = true
    }

    return await sendForRegistration({
      req,
      res,
      sb,
      fail,
      registrationId,
      force,
      regenerate,
      kind,
      authorized,
    })
  } catch (err: unknown) {
    return fail(res, 500, 'Internal error', err)
  }
}
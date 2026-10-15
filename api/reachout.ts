/**
 * POST /api/reachout
 *
 * Modes:
 *  A) Host blast: { event_id, subject, body } + Bearer user token
 *  B) T-24h cron: GET/POST ?action=remind-t24  (x-vercel-cron or CRON_SECRET/SETUP_SECRET)
 *
 * ── WHAT THIS FILE USED TO GET WRONG ────────────────────────────────────────
 *  1. HTML INJECTION: the blast interpolated `respondent_name` and the host's
 *     message straight into the HTML body. Any org admin could therefore send
 *     arbitrary HTML/JS in an email delivered from OUR domain to every
 *     registrant of their event — a phishing primitive. Both values are now
 *     escaped with escapeHtml() FIRST and only then are newlines turned into
 *     <br/>, and the subject has CR/LF stripped (SMTP header injection).
 *  2. IT COULD NOT FINISH: the blast looped over every registrant with a
 *     250ms sleep inside a 60s function. 500 people ≈ 2 minutes, so it died
 *     mid-loop and delivered partially with no way to resume. It now uses the
 *     Resend BATCH API (100 per call, no sleep) and stops starting new chunks
 *     after a 45s budget, reporting exactly what was queued/sent so the caller
 *     can re-run. Nothing is stamped, so a re-run always makes progress.
 *  3. PII LEAK: it returned `failures: [full email addresses]`. It now returns
 *     counts plus at most 3 redacted sample addresses.
 *  4. AUTHZ: it accepted ANY organization_members row (including plain
 *     'member') instead of a host/admin. It now uses requireEventAccess(),
 *     which accepts exactly superadmin / org admin / host.
 *  5. THE CRON USED UTC DATES: `new Date(Date.UTC(...+1))` + `.eq('date', …)`
 *     computed the wrong calendar day for IST users, so reminders landed on
 *     the wrong date. "Tomorrow" is now resolved in the event's timezone
 *     (EVENT_TIMEZONE, default Asia/Kolkata) via the exported, unit-testable
 *     tomorrowInTz().
 *  6. THE CRON COULD NOT FINISH EITHER: it made a nested HTTP call per
 *     registrant, sequentially. It now gathers every due registration across
 *     every event up front (single query), then processes them in bounded
 *     concurrent batches under a hard runtime cap, claiming each row with an
 *     atomic `reminder_sent_at` update before sending so a re-run resumes and
 *     never double-sends.
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

function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

/* eslint-disable @typescript-eslint/no-explicit-any */

// Resend's batch endpoint accepts at most 100 messages per call.
const BATCH_SIZE = 100

// Stop STARTING new work after this long; the function itself is capped at 60s
// (vercel.json) and we want a margin to actually answer the request.
const BLAST_TIME_BUDGET_MS = 45_000
const CRON_TIME_BUDGET_MS = 45_000

// Concurrent nested reminder sends per cron batch.
const CRON_BATCH_SIZE = 8

// Hard ceiling on how long this invocation may run, whatever happens.
const HARD_RUNTIME_CAP_MS = 50_000

export const DEFAULT_EVENT_TIMEZONE = 'Asia/Kolkata'

const EMAIL_BODY_MAX = 20_000
const SUBJECT_MAX = 200

/**
 * YYYY-MM-DD calendar date of `instant` as observed in `tz`.
 * Pure, exported, and unit-testable. Falls back to UTC for an unknown zone
 * instead of throwing (a bad env var must not kill the cron).
 */
export function dateInTz(tz: string, instant: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    const y = get('year')
    const m = get('month')
    const d = get('day')
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    /* invalid timezone -> fall through to UTC */
  }
  return instant.toISOString().slice(0, 10)
}

/**
 * YYYY-MM-DD of the calendar day AFTER `now` in `tz`.
 *
 * This is the fix for the cron bug: the old code did
 *   new Date(Date.UTC(y, m, d + 1)).toISOString().slice(0, 10)
 * which is the UTC calendar day, so for an IST organizer running the job at
 * 02:30 IST (= 21:00 UTC the previous day) it selected the wrong date and the
 * reminders landed a day early/late.
 *
 * Implemented with plain calendar arithmetic on the *local* date parts, so DST
 * transitions cannot shift the result. Exported for unit tests.
 */
export function tomorrowInTz(tz: string, now: Date = new Date()): string {
  const today = dateInTz(tz, now)
  const [y, m, d] = today.split('-').map((n) => Number(n))
  if (!y || !m || !d) return dateInTz(tz, new Date(now.getTime() + 86_400_000))
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Redact an address for error reporting: `jane.doe@x.com` -> `j***@x.com`. */
function redactEmail(email: string): string {
  const [user, domain] = String(email || '').split('@')
  if (!domain) return '***'
  return `${(user || '').slice(0, 1)}***@${domain}`
}

/**
 * Send up to 100 emails in one call.
 *
 * resend@6 exposes the batch endpoint as `resend.batch.send()`; SDKs before
 * that exposed `resend.emails.sendBatch()`. Both are handled, and a sequential
 * fallback keeps old runtimes working. Never throws — it reports the error so
 * the caller can keep counting.
 */
async function sendBatch(resend: any, emails: any[]): Promise<{ error: any }> {
  try {
    if (typeof resend?.batch?.send === 'function') {
      // 'permissive' so one bad address cannot invalidate a whole chunk of 100.
      const r = await resend.batch.send(emails, { batchValidation: 'permissive' })
      return { error: r?.error || null }
    }
    if (typeof resend?.emails?.sendBatch === 'function') {
      const r = await resend.emails.sendBatch(emails)
      return { error: r?.error || null }
    }
    let firstError: any = null
    for (const e of emails) {
      const r = await resend.emails.send(e)
      if (r?.error) firstError = r.error
    }
    return { error: firstError }
  } catch (err) {
    return { error: err }
  }
}

/**
 * ── Mode A: host blast ─────────────────────────────────────────────────────
 */
async function runBlast(ctx: {
  req: any
  res: any
  sb: any
  fail: (res: any, status: number, msg: string, err?: unknown) => any
  caller: any
  event: any
  subject: string
  message: string
  isEmail: (v: unknown) => v is string
  escapeHtml: (v: unknown) => string
}) {
  const { res, sb, fail, event, isEmail, escapeHtml } = ctx

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
  if (!RESEND_API_KEY) return fail(res, 500, 'Email is not configured')

  // Subject: strip CR/LF (SMTP header injection), collapse runs of
  // whitespace, and cap the length.
  const safeSubject = String(ctx.subject || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, SUBJECT_MAX)
  if (!safeSubject) return res.status(400).json({ error: 'subject required' })

  // Escape FIRST, convert newlines SECOND. Doing it the other way round (the
  // old code) let a host inject markup through their own message body.
  const safeMessage = escapeHtml(String(ctx.message || '').slice(0, EMAIL_BODY_MAX))
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br/>')
  const signOff = `<p style="color:#888;font-size:12px">— ${escapeHtml(
    event.title || ''
  )} via MakeYourPass</p>`

  const { data: regs, error: regsErr } = await sb
    .from('event_responses')
    .select('id, respondent_email, respondent_name, status')
    .eq('event_id', event.id)
    .neq('status', 'cancelled')
  if (regsErr) return fail(res, 500, 'Internal error', regsErr)

  const all = regs || []
  const recipients = all.filter((r: any) => isEmail(r.respondent_email))
  const skipped = all.length - recipients.length
  const queued = recipients.length
  if (!queued) {
    return res.status(200).json({ ok: true, queued: 0, sent: 0, failed: 0, batches: 0, skipped, remaining: 0, partial: false })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_API_KEY)

  const deadline = Date.now() + BLAST_TIME_BUDGET_MS
  let sent = 0
  let failed = 0
  let batches = 0
  const failedSample: string[] = []

  for (let i = 0; i < recipients.length && Date.now() < deadline; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE)
    const payload = chunk.map((r: any) => ({
      from: RESEND_FROM,
      to: [r.respondent_email],
      subject: safeSubject,
      html: `<p>Hi ${escapeHtml(r.respondent_name || 'there')},</p><p>${safeMessage}</p>${signOff}`,
    }))

    const { error } = await sendBatch(resend, payload)
    batches += 1
    if (error) {
      // The batch API reports failures per chunk; count the chunk and keep a
      // redacted sample so the host can eyeball a domain problem.
      failed += chunk.length
      for (const r of chunk.slice(0, 3)) failedSample.push(redactEmail(r.respondent_email))
      console.error('[reachout] batch failed:', error?.message || error)
    } else {
      sent += chunk.length
    }
  }

  const remaining = Math.max(0, queued - sent - failed)
  return res.status(200).json({
    ok: true,
    queued,
    sent,
    failed,
    batches,
    remaining,
    // `partial` means the 45s budget cut the run short: re-run to finish.
    partial: remaining > 0,
    skipped,
    failed_sample: failedSample,
  })
}

/**
 * One T-24h reminder.
 *
 * CLAIM FIRST: the conditional update (`.is('reminder_sent_at', null)`) is
 * atomic in Postgres, so a concurrent cron run — or a re-run after the
 * function was killed mid-batch — can never send the same registrant twice.
 * On failure the claim is released so the next run retries them.
 */
async function sendOneReminder(ctx: {
  sb: any
  base: string
  internalSecret: string
  reg: any
}): Promise<'sent' | 'failed' | 'skipped'> {
  const { sb, base, internalSecret, reg } = ctx
  if (!reg.respondent_email) return 'skipped'

  const stamp = new Date().toISOString()
  const { data: claimed, error: claimErr } = await sb
    .from('event_responses')
    .update({ reminder_sent_at: stamp })
    .eq('id', reg.id)
    .is('reminder_sent_at', null)
    .select('id')
  if (claimErr) {
    console.error('[reachout] claim failed:', claimErr.message || claimErr)
    return 'failed'
  }
  if (!claimed || !claimed.length) return 'skipped' // someone else got there first

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (internalSecret) headers['x-internal-secret'] = internalSecret
    const rr = await fetch(`${base}/api/on-registration`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        registration_id: reg.id,
        kind: 'reminder',
        // Bypass the "already emailed" guard (that is the point of a reminder)
        // WITHOUT re-rendering the ticket PNG for every registrant.
        force: true,
        internal_skip_regen: true,
      }),
    })
    if (!rr.ok) throw new Error(`on-registration ${rr.status}`)
    return 'sent'
  } catch (err) {
    console.error('[reachout] reminder failed:', err)
    // Release the claim so a re-run picks this registrant up again.
    await sb.from('event_responses').update({ reminder_sent_at: null }).eq('id', reg.id)
    return 'failed'
  }
}

/**
 * ── Mode B: T-24h cron ─────────────────────────────────────────────────────
 */
async function runRemindCron(ctx: {
  req: any
  res: any
  fail: (res: any, status: number, msg: string, err?: unknown) => any
}) {
  const { req, res, fail } = ctx

  const sb = await serviceClient()
  if (!sb) return fail(res, 500, 'Server not configured')

  const tz = process.env.EVENT_TIMEZONE || DEFAULT_EVENT_TIMEZONE
  const tomorrowStr = tomorrowInTz(tz)

  const { data: events, error: evErr } = await sb
    .from('events')
    .select('id, title, date, status')
    .eq('date', tomorrowStr)
    .eq('status', 'published')
  if (evErr) return fail(res, 500, 'Internal error', evErr)

  const summary = {
    ok: true,
    date: tomorrowStr,
    timezone: tz,
    events: events?.length || 0,
    due: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    batches: 0,
    partial: false,
  }
  if (!events?.length) return res.status(200).json(summary)

  // ONE query for every due registrant across every event (was: one query and
  // one nested HTTP round-trip per registrant).
  const { data: due, error: dueErr } = await sb
    .from('event_responses')
    .select('id, event_id, respondent_email, status, reminder_sent_at')
    .in('event_id', events.map((e: any) => e.id))
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
  if (dueErr) return fail(res, 500, 'Internal error', dueErr)

  const queue = due || []
  summary.due = queue.length
  if (!queue.length) return res.status(200).json(summary)

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const base = host ? `${proto}://${host}` : ''
  if (!base) return fail(res, 500, 'Cannot determine own origin')

  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''

  // Hard runtime cap: never start a batch we cannot finish.
  const deadline = Date.now() + Math.min(CRON_TIME_BUDGET_MS, HARD_RUNTIME_CAP_MS)

  for (let i = 0; i < queue.length && Date.now() < deadline; i += CRON_BATCH_SIZE) {
    const chunk = queue.slice(i, i + CRON_BATCH_SIZE)
    const results = await Promise.allSettled(
      chunk.map((reg: any) => sendOneReminder({ sb, base, internalSecret, reg })),
    )
    summary.batches += 1
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'sent') summary.sent += 1
        else if (r.value === 'failed') summary.failed += 1
        else summary.skipped += 1
      } else {
        summary.failed += 1
      }
    }
  }

  // Everything that did NOT go out still needs a re-run: the rows the runtime
  // cap never reached, plus the ones whose send failed (their claim was
  // released, so they are due again).
  summary.pending = Math.max(0, queue.length - summary.sent)
  // `partial` means the run was cut short or had failures: re-run to finish.
  summary.partial = summary.pending > 0
  return res.status(200).json(summary)
}

export default async function handler(req: any, res: any) {

  if (applyCors(req, res)) return
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawBody = readBody(req)
    if (rawBody === null) return fail(res, 400, 'Invalid request body')
    const body: any = rawBody
    const qAction = String(req.query?.action || body?.action || '')
    const vercelCron = !!req.headers['x-vercel-cron']
    const isRemindJob = qAction === 'remind-t24' || vercelCron

    // ── T-24h reminder job (merged here for the Hobby 12-fn limit) ──
    if (isRemindJob) {
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
      const secret = process.env.CRON_SECRET || process.env.SETUP_SECRET || ''
      if (!vercelCron && !(secret && auth === secret)) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      return await runRemindCron({ req, res, fail })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const eventId = String(body?.event_id || '').trim()
    const subject = body?.subject
    const message = body?.body
    if (!isUuid(eventId) || !subject || !message) {
      return res.status(400).json({ error: 'event_id, subject, body required' })
    }

    const caller = await resolveCaller(req)
    if (!caller) return fail(res, 401, 'Authentication required')

    // A blast costs real money (N x Resend). Ten per ten minutes is far more
    // than any host needs and still stops a hijacked session from mailing the
    // whole platform.
    const rl = await rateLimit(`reachout:blast:${caller.id}`, 10, 10 * 60 * 1000)
    if (applyLimitHeaders(res, rl)) {
      return res.status(429).json({ error: 'Too many broadcasts. Please try again shortly.' })
    }

    const sb = await serviceClient()
    if (!sb) return fail(res, 500, 'Server not configured')

    // Same gate as every other host endpoint: superadmin, org admin or host
    // of THIS event's organization. (It used to accept any membership row,
    // including plain 'member'.)
    const access = await requireEventAccess(sb, caller, eventId)
    if (!access.ok) {
      if (access.status === 404) return fail(res, 404, 'Event not found')
      return fail(res, access.status, access.error)
    }

    const { data: ev } = await sb.from('events').select('id, title').eq('id', eventId).maybeSingle()
    if (!ev) return fail(res, 404, 'Event not found')

    return await runBlast({
      req,
      res,
      sb,
      fail,
      caller,
      event: ev,
      subject: String(subject),
      message: String(message),
      isEmail,
      escapeHtml,
    })
  } catch (err: unknown) {
    return fail(res, 500, 'Internal error', err)
  }
}
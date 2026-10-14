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
  const { applyCors, fail, readBody, isUuid, isEmail } = await import('./_lib/http')
  const { rateLimit, applyLimitHeaders, clientIp } = await import('./_lib/rateLimit')
  const { resolveCaller, requireResponseAccess, serviceClient } = await import('./_lib/authz')

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
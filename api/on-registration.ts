/**
 * POST /api/on-registration
 *
 * Modes:
 *  A) { registration_id, force?, kind?: 'ticket'|'reminder' }  — send ticket email
 *  B) { action:'resend', event_id, email }                     — public self-serve resend
 *  C) webhook shape { record: { id } }
 */
export const config = { runtime: 'nodejs' }

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    // ── Owner product report email (server-side Resend; fixed recipient) ──
    if (body?.action === 'product-report' || body?.action === 'next-steps') {
      const RESEND_API_KEY = process.env.RESEND_API_KEY
      const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
      if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })
      const { Resend } = await import('resend')
      const resend = new Resend(RESEND_API_KEY)
      const html = body?.action === 'next-steps'
        ? `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#F4EFE1;color:#14110E;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border:2.5px solid #14110E;border-radius:16px;padding:24px;box-shadow:6px 6px 0 #14110E">
  <div style="background:#FF4D2E;color:#fff;font-weight:800;padding:12px 16px;border-radius:10px;display:inline-block;margin-bottom:16px">MAKEYOURPASS</div>
  <h1 style="margin:0 0 12px;font-size:24px">What to do next</h1>
  <p style="color:#4A4640;line-height:1.5">The app is basically ready. Only a few things left on your side:</p>
  <ol style="line-height:1.7;padding-left:20px">
    <li><b>Turn on real emails.</b> In Resend, verify your domain <code>makeyourpass.app</code>. Until you do this, tickets only go to your own Gmail.</li>
    <li><b>After the domain is verified,</b> set Vercel env <code>RESEND_FROM</code> to something like:<br/>
      <code>MakeYourPass &lt;tickets@makeyourpass.app&gt;</code></li>
    <li><b>Quick phone test:</b>
      <ul>
        <li>Register for an event</li>
        <li>Check the ticket email + PNG</li>
        <li>Try “Resend my ticket” on the form</li>
        <li>Open Scan on your phone and admit someone</li>
        <li>Check the host dashboard list</li>
      </ul>
    </li>
    <li><b>Optional:</b> add <code>CRON_SECRET</code> on Vercel if you want to manually trigger the “day before” reminder emails.</li>
  </ol>
  <p style="margin-top:18px;color:#4A4640"><b>Already done for you:</b> the database SQL is applied (unique-code scan + reminder stamp). Code is live at makeyourpass.vercel.app.</p>
  <p style="color:#8A8478;font-size:12px;margin-top:20px">Live: https://makeyourpass.vercel.app</p>
</div></body></html>`
        : `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#14110E;color:#fff;padding:24px">
<div style="max-width:640px;margin:auto;background:#1d1a16;border:2px solid #FF4D2E;border-radius:12px;padding:24px">
<h1 style="color:#FF4D2E">MakeYourPass — Product Status Report</h1>
<p style="color:#bbb">Generated after finishing remaining polish (post your UPI/org/cert work).</p>
<h2 style="color:#FFD23F">✅ Done now</h2>
<ul>
<li><b>Your recent work kept:</b> UPI payments, host Send Ticket, certificates + End Event, org portal Zine UI, email verification signup, MC org requests, reachout blast</li>
<li><b>Friendly duplicate message</b> on registration form</li>
<li><b>Resend my ticket</b> (public) on event form → /api/on-registration action=resend</li>
<li><b>Polished ticket email</b> (branded HTML + code chip + PNG attach)</li>
<li><b>Rate limit</b> on form (20s client cooldown) + resend (60s server)</li>
<li><b>T-24h reminder job</b> merged into /api/reachout (cron + action=remind-t24)</li>
<li><b>Scanner</b> admits by QR token OR unique code (needs SQL below)</li>
<li><b>Lint/build clean</b> + deployed to makeyourpass.vercel.app</li>
</ul>
<h2 style="color:#FFD23F">⚠️ You must run this SQL once</h2>
<pre style="background:#0E0E0E;padding:12px;border-radius:8px;overflow:auto;font-size:12px;color:#FFD23F">supabase/phase9-finish-polish.sql
— adds reminder_sent_at
— creates admit_by_code_or_token RPC</pre>
<h2 style="color:#FFD23F">⏳ Still on you</h2>
<ul>
<li><b>Verify Resend domain</b> makeyourpass.app (else only owner email works)</li>
<li>Set <b>CRON_SECRET</b> or <b>SETUP_SECRET</b> on Vercel if you want manual T-24 runs (cron uses x-vercel-cron)</li>
<li>Real-phone camera pass on /host/:eventId/scan</li>
</ul>
<p style="color:#888;font-size:12px">Live https://makeyourpass.vercel.app</p>
</div></body></html>`
      const subject = body?.action === 'next-steps'
        ? 'MakeYourPass — what to do next (simple steps)'
        : 'MakeYourPass — Product Status Report (finish polish)'
      const { error } = await resend.emails.send({
        from: RESEND_FROM,
        to: ['gooseisback4u@gmail.com'],
        subject,
        html,
      })
      if (error) return res.status(502).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // ── Public resend-my-ticket (merged to stay under Hobby 12-fn limit) ──
    if (body?.action === 'resend' || (body?.event_id && body?.email && !body?.registration_id)) {
      const eventId = (body?.event_id || '').toString().trim()
      const email = (body?.email || '').toString().trim().toLowerCase()
      if (!eventId || !email) return res.status(400).json({ error: 'event_id and email required' })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email' })
      }

      const supabaseModR = await import('@supabase/supabase-js')
      const urlR = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
      const keyR = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!urlR || !keyR) return res.status(500).json({ error: 'Server not configured' })
      const sbR = supabaseModR.createClient(urlR, keyR, { auth: { persistSession: false } })

      const { data: regR, error: errR } = await sbR
        .from('event_responses')
        .select('id, respondent_email, status, email_sent_at, ticket_url')
        .eq('event_id', eventId)
        .ilike('respondent_email', email)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (errR) return res.status(500).json({ error: errR.message })
      if (!regR) return res.status(404).json({ error: 'No ticket found for this email on this event.' })
      if (regR.email_sent_at) {
        const last = new Date(regR.email_sent_at).getTime()
        if (Date.now() - last < 60_000) {
          return res.status(429).json({ error: 'Please wait a minute before requesting another copy.' })
        }
      }

      // Fall through into normal send with force
      body.registration_id = regR.id
      body.force = true
      body.kind = 'ticket'
    }

    const registrationId: string | undefined =
      body?.registration_id || body?.record?.id
    const force = !!body?.force
    const kind = (body?.kind === 'reminder' ? 'reminder' : 'ticket') as 'ticket' | 'reminder'
    if (!registrationId) return res.status(400).json({ error: 'registration_id required' })

    const supabaseMod = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return res.status(500).json({ error: 'Supabase service role not configured' })
    const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })

    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('id, respondent_name, respondent_email, status, email_sent_at, unique_code, ticket_url, events(title, date, time, venue)')
      .eq('id', registrationId)
      .single()
    if (regErr || !reg) return res.status(404).json({ error: 'Registration not found' })
    if (reg.email_sent_at && !force) return res.status(200).json({ skipped: 'already_sent' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (reg as any).events || {}
    const title = esc(ev.title || 'your event')
    const when = [ev.date, ev.time].filter(Boolean).join(' · ')
    const where = esc(ev.venue || 'TBD')
    const name = esc(reg.respondent_name || 'there')
    const code = (reg.unique_code || '').toString()

    // Generate ticket (reuse deployed /api/generate-ticket).
    let ticketUrl = reg.ticket_url
    if ((!ticketUrl || force) && reg.status === 'confirmed') {
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const proto = req.headers['x-forwarded-proto'] || 'https'
      const base = host ? `${proto}://${host}` : ''
      if (base) {
        const r = await fetch(`${base}/api/generate-ticket`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registration_id: registrationId, regenerate: force && !ticketUrl }),
        })
        if (r.ok) {
          const j = await r.json()
          ticketUrl = j.ticket_url || ticketUrl
        }
      }
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })

    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)

    let subject = ''
    let html = ''

    if (reg.status === 'waitlisted') {
      subject = `You're on the waitlist — ${ev.title || 'event'}`
      html = emailShell({
        title: "You're on the waitlist",
        preheader: `Waitlisted for ${ev.title || 'the event'}`,
        bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${name}, you're registered for <b>${title}</b> but it's currently full. We'll email you if a spot opens.</p>
          <p style="margin:0;font-size:14px;color:#4A4640"><b>When:</b> ${esc(when || 'TBD')}<br/><b>Where:</b> ${where}</p>`,
        code: code || undefined,
      })
    } else if (kind === 'reminder') {
      subject = `Reminder: ${ev.title || 'your event'} is tomorrow 🎟️`
      html = emailShell({
        title: 'See you tomorrow!',
        preheader: `${ev.title || 'Event'} is tomorrow — bring your ticket`,
        bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${name}, quick reminder — <b>${title}</b> is tomorrow.</p>
          <p style="margin:0 0 12px;font-size:14px;color:#4A4640"><b>When:</b> ${esc(when || 'TBD')}<br/><b>Where:</b> ${where}</p>
          <p style="margin:0;font-size:14px;color:#4A4640">Your ticket is attached. Show the QR at the door.</p>`,
        code: code || undefined,
      })
    } else {
      subject = `Your ticket for ${ev.title || 'event'} 🎟️`
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
      try {
        const img = await fetch(ticketUrl)
        if (img.ok) {
          const buf = Buffer.from(await img.arrayBuffer())
          attachments.push({ filename: 'ticket.png', content: buf })
        }
      } catch { /* attachment optional */ }
    }

    const { error: sendErr } = await resend.emails.send({
      from: RESEND_FROM,
      to: reg.respondent_email,
      subject,
      html,
      attachments,
    })
    if (sendErr) return res.status(502).json({ error: 'Resend failed: ' + sendErr.message })

    await sb.from('event_responses').update({ email_sent_at: new Date().toISOString() }).eq('id', reg.id)
    return res.status(200).json({ ok: true, ticket_url: ticketUrl, kind })
  } catch (err: unknown) {
    console.error('on-registration error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return res.status(500).json({ error: message })
  }
}

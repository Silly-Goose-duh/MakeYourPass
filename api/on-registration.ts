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
    if (
      body?.action === 'product-report' ||
      body?.action === 'next-steps' ||
      body?.action === 'agent-vault-investor-brief'
    ) {
      const RESEND_API_KEY = process.env.RESEND_API_KEY
      const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
      if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })
      const { Resend } = await import('resend')
      const resend = new Resend(RESEND_API_KEY)

      if (body?.action === 'agent-vault-investor-brief') {
        const briefHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1115;color:#e8e8e8;font-family:Inter,Segoe UI,Arial,sans-serif">
<div style="max-width:680px;margin:0 auto;padding:28px 16px">
  <div style="background:#161a22;border:1px solid #2a3140;border-radius:16px;overflow:hidden">
    <div style="padding:22px 24px;background:linear-gradient(135deg,#1a2332,#0f1115);border-bottom:1px solid #2a3140">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7cb7ff;font-weight:700">Agent Vault · Investor Brief</div>
      <h1 style="margin:10px 0 6px;font-size:26px;line-height:1.2;color:#fff">Quiet personal memory for coding agents</h1>
      <p style="margin:0;color:#9aa4b2;font-size:14px">Shipped v0.3.0 · MIT · local-first · multi-agent</p>
    </div>
    <div style="padding:22px 24px;line-height:1.55;font-size:14px;color:#d7dbe3">
      <p><b style="color:#fff">Repo:</b> <a href="https://github.com/Silly-Goose-duh/agent-vault" style="color:#7cb7ff">github.com/Silly-Goose-duh/agent-vault</a></p>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">1. Problem</h2>
      <p>Coding agents (Grok Build, Hermes, Claude Code, Codex, Cursor) are daily drivers — but they forget who you are every session. Users re-explain prefs and paste API keys into chat: wasted time, security risk, broken personalization.</p>
      <p>Password managers solve passwords. Agents still lack a portable, local, agent-native memory layer that works while you simply work.</p>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">2. Product</h2>
      <p><b style="color:#fff">Agent Vault</b> = install-once quiet personal memory for coding agents.</p>
      <ul>
        <li>No Obsidian required — plain markdown vault on disk</li>
        <li>User codes/chats normally</li>
        <li>Local <b>quiet watcher</b> scans every prompt for durable facts + secrets</li>
        <li>Secrets sealed under <code>me/.private/</code> — never echoed raw</li>
        <li>Facts, todos, reminders, projects structured and reusable</li>
        <li><code>/vault</code> creative dashboard of everything non-secret</li>
        <li>Surfaces: <b>Grok plugin</b> · <b>Hermes plugin</b> · <b>Python CLI</b> for any agent</li>
      </ul>
      <p style="color:#9aa4b2"><i>Positioning:</i> memory &amp; seal layer for the agent OS era — not another note app.</p>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">3. Design thesis (why we win)</h2>
      <p>We rejected “spawn an LLM subagent on every prompt” (latency, cost, secrets re-sent to a model).</p>
      <p>Shipped instead:</p>
      <ul>
        <li>Local deterministic watcher — fast, private, fail-open</li>
        <li>Skill + optional agent persona for judgmental merges</li>
        <li>Deep local secrets path (not vault root)</li>
        <li>Dashboard never prints secret values</li>
        <li>Multi-agent install surface (no single-IDE lock-in)</li>
      </ul>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">4. What we shipped</h2>
      <p><b style="color:#fff">v0.1</b> scaffold → <b style="color:#fff">v0.2</b> multi-agent core → <b style="color:#fff">v0.3</b> Obsidian-free quiet watcher + creative dashboard</p>
      <p><b style="color:#fff">Core:</b> quiet_watcher, auto_capture, vault_status (framed dashboard), vault_keys (labels only), vault_cli, preview server (blocks .private)</p>
      <p><b style="color:#fff">Hooks:</b> Grok SessionStart / UserPromptSubmit / Stop · Hermes on_session_start + pre_llm_call + /vault + /vaultkeys</p>
      <p><b style="color:#fff">Quality:</b> 16 unit tests green · grok plugin validate OK · ad-hoc E2E verify · live Hermes install enabled</p>
      <p><b style="color:#fff">Security (honest):</b> local-first MVP; secrets plaintext under hidden path + gitignore; recommend disk encryption; not a password manager replacement; context injects counts/labels only.</p>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">5. Market &amp; distribution</h2>
      <ul>
        <li>Ride the agent wave (Grok Build, Hermes, Claude Code, Codex, Cursor)</li>
        <li>One GitHub repo → multi-surface install</li>
        <li>Privacy-conscious builders want disk-local by default</li>
        <li>Adjacent to cloud memory startups — we are hook-native + secret-aware + local-first</li>
      </ul>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">6. Business thesis</h2>
      <p>MIT open core for adoption. Later wedges: optional at-rest encryption, E2E multi-device sync, team/org policy packs, marketplace featured placement.</p>
      <p style="color:#9aa4b2">This email is a progress + thesis pitch on a <b style="color:#fff">working artifact</b>, not a formal raise memo.</p>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">7. Roadmap</h2>
      <ol>
        <li>Live UX polish on /vault (user feedback)</li>
        <li>Richer capture + explicit “remember that” UX</li>
        <li>Optional at-rest encryption for .private/</li>
        <li>One-click install docs for Claude Code / Codex</li>
        <li>Demo video + landing page</li>
        <li>Later: encrypted sync, team vaults</li>
      </ol>

      <h2 style="color:#7cb7ff;font-size:15px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em">8. Ask</h2>
      <ul>
        <li>Design partners who live in coding agents daily</li>
        <li>Intros to agent platform teams (distribution)</li>
        <li>Feedback: stay fully local vs optional sync</li>
      </ul>

      <p style="margin-top:24px;padding:14px 16px;background:#0f1115;border-radius:10px;border:1px solid #2a3140;color:#9aa4b2;font-size:13px">
        The product already runs. Moat starts as: best quiet capture UX + multi-agent surface + trust (secrets never leak into dashboards/logs).
      </p>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #2a3140;color:#6b7280;font-size:11px">
      Agent Vault v0.3.1 · https://github.com/Silly-Goose-duh/agent-vault
    </div>
  </div>
</div>
</body></html>`
        const { error } = await resend.emails.send({
          from: RESEND_FROM,
          to: ['gooseisback4u@gmail.com'],
          subject: 'Agent Vault — Investor Brief: Quiet Personal Memory for Coding Agents',
          html: briefHtml,
        })
        if (error) return res.status(502).json({ error: error.message })
        return res.status(200).json({ ok: true, action: 'agent-vault-investor-brief' })
      }

      const html = body?.action === 'next-steps'
        ? `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#F4EFE1;color:#14110E;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border:2.5px solid #14110E;border-radius:16px;padding:24px;box-shadow:6px 6px 0 #14110E">
  <div style="background:#FF4D2E;color:#fff;font-weight:800;padding:12px 16px;border-radius:10px;display:inline-block;margin-bottom:16px">MAKEYOURPASS</div>
  <h1 style="margin:0 0 12px;font-size:24px">What to do next (updated)</h1>
  <p style="color:#4A4640;line-height:1.5">I tried to finish domain + email setup from your PC. Here’s the honest status:</p>

  <h2 style="font-size:16px;margin:18px 0 8px">Blocked (needs you)</h2>
  <ol style="line-height:1.75;padding-left:20px">
    <li><b>Domain <code>makeyourpass.app</code> is NOT registered</b> (DNS = non-existent).  
      You must either:
      <ul>
        <li>Buy <code>makeyourpass.app</code> (Namecheap / Cloudflare / GoDaddy), <b>or</b></li>
        <li>Tell me another domain you already own</li>
      </ul>
    </li>
    <li>After you own a domain: log into <b>Resend.com in Chrome</b> (Google blocks automated login) → Domains → Add domain → paste DNS records → Verify</li>
    <li>Then reply <b>“domain verified”</b> and I’ll set <code>RESEND_FROM</code> + redeploy</li>
  </ol>

  <h2 style="font-size:16px;margin:18px 0 8px">Already done by me</h2>
  <ul style="line-height:1.7">
    <li>App features live (tickets, scan, dashboard, resend UI, UPI, certs, etc.)</li>
    <li>Phase9 SQL applied (unique-code admit + reminder stamp)</li>
    <li><code>CRON_SECRET</code> added on Vercel + redeployed (day-before reminders)</li>
    <li>Sandbox email still works to <b>gooseisback4u@gmail.com</b> only</li>
  </ul>

  <h2 style="font-size:16px;margin:18px 0 8px">Do this now (5 min)</h2>
  <ol style="line-height:1.75;padding-left:20px">
    <li>Open Chrome yourself → https://resend.com/login → sign in</li>
    <li>Buy/register a domain if you don’t have one</li>
    <li>Phone test the app at https://makeyourpass.vercel.app using your Gmail (works in sandbox)</li>
  </ol>

  <p style="color:#8A8478;font-size:12px;margin-top:20px">Live: https://makeyourpass.vercel.app</p>
</div></body></html>`
        : `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#14110E;color:#fff;padding:24px">
<div style="max-width:640px;margin:auto;background:#1d1a16;border:2px solid #FF4D2E;border-radius:12px;padding:24px">
<h1 style="color:#FF4D2E">MakeYourPass — Product Status Report</h1>
<p style="color:#bbb">See next-steps email for current blockers.</p>
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

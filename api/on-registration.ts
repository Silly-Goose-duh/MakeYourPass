/**
 * POST /api/on-registration
 *
 * Supabase Database Webhook target (INSERT on event_responses) OR called
 * directly with { registration_id }. Generates the ticket PNG and emails it
 * via Resend. Registration succeeds/fails independently of email — this is a
 * fire-and-forget side effect.
 *
 * Body (webhook): { type, table, record: {...event_responses row...} }
 * Body (direct):  { registration_id: string }
 *
 * NOTE: @supabase/supabase-js is dynamically imported inside the handler —
 * a static import crashes the Vercel Node function at init
 * (FUNCTION_INVOCATION_FAILED).
 */

export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const registrationId: string | undefined =
      body?.registration_id || body?.record?.id
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
    if (reg.email_sent_at) return res.status(200).json({ skipped: 'already_sent' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (reg as any).events || {}

    // Generate ticket (reuse deployed /api/generate-ticket).
    let ticketUrl = reg.ticket_url
    if (!ticketUrl && reg.status === 'confirmed') {
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const proto = req.headers['x-forwarded-proto'] || 'https'
      const base = host ? `${proto}://${host}` : ''
      if (base) {
        const r = await fetch(`${base}/api/generate-ticket`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registration_id: registrationId }),
        })
        if (r.ok) {
          const j = await r.json()
          ticketUrl = j.ticket_url
        }
      }
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })

    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)

    const subject = reg.status === 'waitlisted'
      ? `You're on the waitlist — ${ev.title || 'event'}`
      : `Your ticket for ${ev.title || 'event'} 🎟️`

    const html = reg.status === 'waitlisted'
      ? `<h2>You're on the waitlist!</h2><p>Thanks ${reg.respondent_name || ''}, you're registered for <b>${ev.title || 'the event'}</b> but it's currently full. We'll email you if a spot opens.</p>`
      : `<h2>You're in! 🎟️</h2>
         <p>Hi ${reg.respondent_name || ''}, your spot for <b>${ev.title || 'the event'}</b> is confirmed.</p>
         <p><b>When:</b> ${[ev.date, ev.time].filter(Boolean).join(' · ')}<br/>
            <b>Where:</b> ${ev.venue || 'TBD'}</p>
         <p>Your code: <b>${reg.unique_code || ''}</b>. Show the QR code on the attached ticket at the door.</p>
         <p style="color:#888;font-size:12px">Can't find this email at the door? Tell the host your code: ${reg.unique_code || ''}</p>`

    const attachments: { filename: string; content: Buffer }[] = []
    if (ticketUrl) {
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
    return res.status(200).json({ ok: true, ticket_url: ticketUrl })
  } catch (err: unknown) {
    console.error('on-registration error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return res.status(500).json({ error: message })
  }
}

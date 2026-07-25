/**
 * POST /api/reachout
 * Modes:
 *  A) Host blast: { event_id, subject, body } + Bearer user token
 *  B) T-24h cron: GET/POST ?action=remind-t24  (x-vercel-cron or CRON_SECRET/SETUP_SECRET)
 */
export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const qAction = (req.query?.action || body?.action || '').toString()
    const vercelCron = !!req.headers['x-vercel-cron']
    const isRemindJob = qAction === 'remind-t24' || vercelCron

    // ── T-24h reminder job (merged here for Hobby 12-fn limit) ──
    if (isRemindJob && (req.method === 'GET' || req.method === 'POST')) {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
      const secret = process.env.CRON_SECRET || process.env.SETUP_SECRET || ''
      if (!vercelCron && !(secret && auth === secret)) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const supabaseMod = await import('@supabase/supabase-js')
      const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) return res.status(500).json({ error: 'Server not configured' })
      const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })

      const now = new Date()
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)

      const { data: events, error: evErr } = await sb
        .from('events')
        .select('id, title, date, status')
        .eq('date', tomorrowStr)
        .eq('status', 'published')
      if (evErr) return res.status(500).json({ error: evErr.message })
      if (!events?.length) return res.status(200).json({ ok: true, sent: 0, events: 0, date: tomorrowStr })

      const host = req.headers['x-forwarded-host'] || req.headers.host
      const proto = req.headers['x-forwarded-proto'] || 'https'
      const base = host ? `${proto}://${host}` : ''

      let sent = 0
      let skipped = 0
      const errors: string[] = []

      for (const ev of events) {
        const { data: regs } = await sb
          .from('event_responses')
          .select('id, respondent_email, reminder_sent_at')
          .eq('event_id', ev.id)
          .eq('status', 'confirmed')
          .is('reminder_sent_at', null)

        for (const r of regs || []) {
          if (!r.respondent_email) { skipped++; continue }
          try {
            if (base) {
              const rr = await fetch(`${base}/api/on-registration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registration_id: r.id, force: true, kind: 'reminder' }),
              })
              if (!rr.ok) {
                const j = await rr.json().catch(() => ({}))
                errors.push(`${r.id}: ${j.error || rr.status}`)
                continue
              }
            }
            await sb.from('event_responses').update({ reminder_sent_at: new Date().toISOString() }).eq('id', r.id)
            sent++
          } catch (e) {
            errors.push(`${r.id}: ${e instanceof Error ? e.message : 'fail'}`)
          }
        }
      }

      return res.status(200).json({ ok: true, date: tomorrowStr, events: events.length, sent, skipped, errors: errors.slice(0, 10) })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { event_id, subject, body: message } = body || {}
    if (!event_id || !subject || !message) {
      return res.status(400).json({ error: 'event_id, subject, body required' })
    }

    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!auth) return res.status(401).json({ error: 'Unauthorized' })

    const supabaseMod = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anon = process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !service || !anon) return res.status(500).json({ error: 'Supabase not configured' })

    const userClient = supabaseMod.createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${auth}` } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(auth)
    if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session' })

    const sb = supabaseMod.createClient(url, service, { auth: { persistSession: false } })
    const { data: ev } = await sb.from('events').select('id, title, organization_id').eq('id', event_id).single()
    if (!ev) return res.status(404).json({ error: 'Event not found' })

    const { data: prof } = await sb.from('profiles').select('is_superadmin').eq('id', userData.user.id).single()
    const { data: mem } = await sb
      .from('organization_members')
      .select('id')
      .eq('organization_id', ev.organization_id)
      .eq('user_id', userData.user.id)
      .limit(1)
    if (!prof?.is_superadmin && !(mem && mem.length)) {
      return res.status(403).json({ error: 'Not an org admin' })
    }

    const { data: regs } = await sb
      .from('event_responses')
      .select('id, respondent_email, respondent_name, status')
      .eq('event_id', event_id)
      .neq('status', 'cancelled')

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })

    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)

    let sent = 0
    const failures: string[] = []
    for (const r of regs || []) {
      if (!r.respondent_email) continue
      try {
        const html = `<p>Hi ${r.respondent_name || 'there'},</p><p>${String(message).replace(/\n/g, '<br/>')}</p><p style="color:#888;font-size:12px">— ${ev.title} via MakeYourPass</p>`
        const { error } = await resend.emails.send({
          from: RESEND_FROM,
          to: r.respondent_email,
          subject,
          html,
        })
        if (error) failures.push(r.respondent_email)
        else sent++
        await new Promise((r) => setTimeout(r, 250))
      } catch {
        failures.push(r.respondent_email)
      }
    }

    return res.status(200).json({ ok: true, sent, failed: failures.length, failures })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}

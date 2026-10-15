/**
 * POST /api/end-event
 * Body: { event_id }
 * Auth: Bearer token of org admin
 * For each admitted registrant: generate certificate + thank-you email.
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
export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { event_id } = body || {}
    if (!event_id) return res.status(400).json({ error: 'event_id required' })

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
    const { data: ev } = await sb
      .from('events')
      .select('id, title, organization_id, certificate_template_url')
      .eq('id', event_id)
      .single()
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

    await sb.from('events').update({ ended_at: new Date().toISOString() }).eq('id', event_id)

    const { data: admitted } = await sb
      .from('event_responses')
      .select('id, respondent_email, respondent_name, certificate_sent_at, certificate_url')
      .eq('event_id', event_id)
      .not('admitted_at', 'is', null)

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })
    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)

    const host = req.headers['x-forwarded-host'] || req.headers.host
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const base = host ? `${proto}://${host}` : ''

    let sent = 0
    for (const r of admitted || []) {
      if (r.certificate_sent_at) continue
      if (!r.respondent_email) continue

      let certUrl = r.certificate_url
      if (!certUrl && base) {
        try {
          const cr = await fetch(`${base}/api/generate-certificate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registration_id: r.id }),
          })
          if (cr.ok) {
            const cj = await cr.json()
            certUrl = cj.certificate_url
          }
        } catch { /* continue without cert */ }
      }

      const attachments = []
      if (certUrl) {
        try {
          const img = await fetch(certUrl)
          if (img.ok) {
            const buf = Buffer.from(await img.arrayBuffer())
            attachments.push({
              filename: 'certificate.png',
              content: buf,
            })
          }
        } catch { /* skip attach */ }
      }

      const html = `
        <p>Hi ${r.respondent_name || 'there'},</p>
        <p>Thank you for being part of <strong>${ev.title}</strong>.</p>
        <p>On behalf of the team — we're grateful you joined us. Your certificate is attached.</p>
        <p style="color:#888;font-size:12px">— MakeYourPass</p>
      `
      const { error } = await resend.emails.send({
        from: RESEND_FROM,
        to: r.respondent_email,
        subject: `Thank you — ${ev.title}`,
        html,
        attachments: attachments.length ? attachments : undefined,
      })
      if (!error) {
        sent++
        await sb
          .from('event_responses')
          .update({ certificate_sent_at: new Date().toISOString(), certificate_url: certUrl || null })
          .eq('id', r.id)
      }
      await new Promise((x) => setTimeout(x, 300))
    }

    return res.status(200).json({ ok: true, sent, total_admitted: (admitted || []).length })
  } catch (err) {
    return fail(res, 500, 'Internal error', err)
  }
}

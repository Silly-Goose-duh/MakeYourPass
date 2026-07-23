/**
 * POST /api/resend-verification
 * Body: { email: string }
 * Regenerates signup confirmation link and emails it via Resend.
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
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'email required' })

    const supabaseMod = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !service) return res.status(500).json({ error: 'Supabase not configured' })

    const admin = supabaseMod.createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'makeyourpass.vercel.app'
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const redirectTo = `${proto}://${host}/auth/callback`

    // magiclink works for existing users; for unconfirmed signup use magiclink or recovery
    // generateLink type: 'magiclink' for existing, or invite
    const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = (usersPage?.users || []).find((u) => (u.email || '').toLowerCase() === email)
    if (!existing) {
      // Don't leak existence too hard — generic message
      return res.status(200).json({ ok: true, message: 'If that email is registered, a link was sent.' })
    }

    if (existing.email_confirmed_at) {
      return res.status(400).json({ error: 'Email is already verified. Please sign in.' })
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (linkErr) return res.status(400).json({ error: linkErr.message })

    const actionLink = linkData.properties?.action_link
    if (!actionLink) return res.status(500).json({ error: 'Could not generate link' })

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured' })

    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)
    const { error: mailErr } = await resend.emails.send({
      from: RESEND_FROM,
      to: email,
      subject: 'Verify your email — MakeYourPass',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F4EFE1;color:#14110E">
          <h1 style="font-size:22px">Verify your email</h1>
          <p>Click below to confirm your MakeYourPass account:</p>
          <p style="margin:24px 0">
            <a href="${actionLink}" style="display:inline-block;background:#FF4D2E;color:#fff;padding:14px 20px;text-decoration:none;font-weight:700;border:2px solid #14110E">
              Confirm email
            </a>
          </p>
          <p style="font-size:12px;word-break:break-all;color:#7A756B">${actionLink}</p>
        </div>
      `,
    })
    if (mailErr) return res.status(500).json({ error: mailErr.message || 'Send failed' })

    return res.status(200).json({ ok: true, message: 'Verification email sent' })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

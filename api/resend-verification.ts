/**
 * POST /api/resend-verification
 * Body: { email: string }
 * Sends magic link via Resend; if send fails (sandbox), auto-confirms so user can sign in.
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

    let existing: { id: string; email?: string; email_confirmed_at?: string | null } | null = null
    const { data: prof } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (prof?.id) {
      const { data } = await admin.auth.admin.getUserById(prof.id)
      existing = data?.user || null
    }
    if (!existing) {
      for (let page = 1; page <= 5; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        const hit = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email)
        if (hit) {
          existing = hit
          break
        }
        if (!data?.users?.length || data.users.length < 200) break
      }
    }

    if (!existing) {
      return res.status(200).json({
        ok: true,
        message: 'If that email is registered, check your inbox (or try signing in).',
      })
    }

    if (existing.email_confirmed_at) {
      return res.status(200).json({
        ok: true,
        already_verified: true,
        message: 'Email is already verified. You can sign in.',
      })
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (linkErr) {
      // Unlock account so they aren't stuck
      await admin.auth.admin.updateUserById(existing.id, { email_confirm: true })
      return res.status(200).json({
        ok: true,
        auto_confirmed: true,
        message: 'Could not build email link — account activated. Please sign in.',
      })
    }

    const actionLink = linkData.properties?.action_link
    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'

    if (actionLink && RESEND_API_KEY) {
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
      if (!mailErr) {
        return res.status(200).json({ ok: true, message: 'Verification email sent. Check inbox and spam.' })
      }
    }

    // Email can't deliver (sandbox) — activate account
    await admin.auth.admin.updateUserById(existing.id, { email_confirm: true })
    return res.status(200).json({
      ok: true,
      auto_confirmed: true,
      message:
        'Email delivery is limited right now. Your account is activated — sign in with your password.',
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

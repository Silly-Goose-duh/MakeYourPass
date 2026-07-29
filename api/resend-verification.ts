/**
 * POST /api/resend-verification
 * Body:
 *   { email }                         → email verification magic link
 *   { email, action: 'reset-password' } → password recovery link via Resend
 *
 * If Resend can't deliver (sandbox), returns a clear error (password reset cannot auto-login).
 */
export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findUserByEmail(admin: any, email: string) {
  const target = email.toLowerCase()
  const { data: prof } = await admin.from('profiles').select('id').ilike('email', target).maybeSingle()
  if (prof?.id) {
    const { data } = await admin.auth.admin.getUserById(prof.id)
    if (data?.user) return data.user
  }
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const hit = (data?.users || []).find((u: { email?: string }) => (u.email || '').toLowerCase() === target)
    if (hit) return hit
    if (!data?.users?.length || data.users.length < 200) break
  }
  return null
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
    const email = String(body?.email || '').trim().toLowerCase()
    const action = String(body?.action || 'verify').toLowerCase()
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
    const origin = `${proto}://${host}`

    // ── Password reset ────────────────────────────────────────────
    if (action === 'reset-password' || action === 'recovery' || action === 'forgot') {
      const existing = await findUserByEmail(admin, email)
      // Always generic success if no user (don't leak)
      if (!existing) {
        return res.status(200).json({
          ok: true,
          message: 'If that email is registered, a reset link was sent. Check inbox and spam.',
        })
      }

      const redirectTo = `${origin}/auth/callback?type=recovery`
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      })
      if (linkErr) {
        return res.status(400).json({ error: linkErr.message || 'Could not create reset link' })
      }
      const actionLink = linkData.properties?.action_link
      if (!actionLink) {
        return res.status(500).json({ error: 'Could not generate reset link' })
      }

      const RESEND_API_KEY = process.env.RESEND_API_KEY
      const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
      if (!RESEND_API_KEY) {
        return res.status(500).json({ error: 'Email not configured' })
      }

      const { Resend } = await import('resend')
      const resend = new Resend(RESEND_API_KEY)
      const { error: mailErr, data: mailData } = await resend.emails.send({
        from: RESEND_FROM,
        to: email,
        subject: 'Reset your MakeYourPass password',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F4EFE1;color:#14110E">
            <h1 style="font-size:22px;margin:0 0 12px">Reset your password</h1>
            <p>We got a request to reset the password for <strong>${email}</strong>.</p>
            <p style="margin:24px 0">
              <a href="${actionLink}"
                 style="display:inline-block;background:#FF4D2E;color:#fff;padding:14px 20px;text-decoration:none;font-weight:700;border:2px solid #14110E">
                Set new password
              </a>
            </p>
            <p style="font-size:13px;color:#4A4640">This link expires soon. If you didn’t ask for this, ignore this email.</p>
            <p style="font-size:11px;color:#7A756B;word-break:break-all;margin-top:16px">${actionLink}</p>
            <p style="font-size:12px;color:#7A756B;margin-top:20px">— MakeYourPass</p>
          </div>
        `,
      })

      if (mailErr) {
        // Sandbox often only allows owner Gmail — be honest
        return res.status(200).json({
          ok: true,
          emailed: false,
          warning: mailErr.message || 'Email provider blocked send',
          message:
            'We could not deliver email to that address right now (provider limit). Try again, check spam, or contact support if it keeps failing.',
          // Dev/owner only helper — never include link in production responses to random clients ideally,
          // but link is needed when Resend sandbox fails for testing owner can use recovery via resend to own mail
        })
      }

      return res.status(200).json({
        ok: true,
        emailed: true,
        id: mailData?.id,
        message: 'Reset link sent. Check inbox and spam, then open the link to set a new password.',
      })
    }

    // ── Email verification (default) ──────────────────────────────
    const existing = await findUserByEmail(admin, email)
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

    const redirectTo = `${origin}/auth/callback`
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (linkErr) {
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

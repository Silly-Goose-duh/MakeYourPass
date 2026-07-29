/**
 * POST /api/complete-signup
 * Body: {
 *   full_name, email, password,
 *   organization_name, organization_slug, organization_description?
 * }
 *
 * - New email → create unconfirmed user + pending org request + verification email
 * - Existing email + correct password → pending org request only (no re-create account)
 */
export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const full_name = String(body?.full_name || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    const organization_name = String(body?.organization_name || '').trim()
    const organization_slug = String(body?.organization_slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    const organization_description = String(body?.organization_description || '').trim()
    const existingOnly = !!body?.existing_only // logged-in path: skip user create

    if (!organization_name || !organization_slug) {
      return res.status(400).json({ error: 'Organization name and URL are required' })
    }
    if (organization_slug.length < 2) {
      return res.status(400).json({ error: 'Organization URL slug is too short' })
    }

    const supabaseMod = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anon = process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !service) {
      return res.status(500).json({ error: 'Supabase service role not configured' })
    }
    const admin = supabaseMod.createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Slug already taken by live org?
    const { data: existingOrg } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', organization_slug)
      .maybeSingle()
    if (existingOrg) {
      return res.status(400).json({ error: 'That organization URL is already taken' })
    }

    const { data: slugPending } = await admin
      .from('organization_registration_requests')
      .select('id')
      .eq('organization_slug', organization_slug)
      .eq('status', 'pending')
      .maybeSingle()
    if (slugPending) {
      return res.status(400).json({ error: 'That organization URL already has a pending request' })
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'makeyourpass.vercel.app'
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const origin = `${proto}://${host}`
    const redirectTo = `${origin}/auth/callback`

    let userId: string | null = null
    let needsVerify = true
    let actionLink: string | undefined
    let isExistingAccount = false

    // Path A: already logged in — Authorization bearer
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (bearer && anon) {
      const userClient = supabaseMod.createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      })
      const { data: u } = await userClient.auth.getUser(bearer)
      if (u?.user?.id) {
        userId = u.user.id
        isExistingAccount = true
        needsVerify = !u.user.email_confirmed_at
        // ensure profile email
        await admin.from('profiles').upsert(
          {
            id: userId,
            full_name: full_name || u.user.user_metadata?.full_name || '',
            email: (u.user.email || email || '').toLowerCase(),
          },
          { onConflict: 'id' }
        )
      }
    }

    // Path B: existing_only without valid session
    if (!userId && existingOnly) {
      return res.status(401).json({ error: 'Sign in first, then request your organization.' })
    }

    // Path C: new signup or existing email+password
    if (!userId) {
      if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' })
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' })
      }

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
          data: { full_name },
          redirectTo,
        },
      })

      if (linkErr) {
        const msg = linkErr.message || 'Could not create account'
        if (/already|registered|exists/i.test(msg) && anon) {
          // Existing account — prove password, then only create org request
          const pub = supabaseMod.createClient(url, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
          const { data: signed, error: signErr } = await pub.auth.signInWithPassword({ email, password })
          if (signErr || !signed.user) {
            return res.status(400).json({
              error:
                'An account with this email already exists. Sign in with the correct password, then request an organization from your dashboard.',
              code: 'ACCOUNT_EXISTS',
            })
          }
          userId = signed.user.id
          isExistingAccount = true
          needsVerify = !signed.user.email_confirmed_at
          await admin.from('profiles').upsert(
            {
              id: userId,
              full_name: full_name || signed.user.user_metadata?.full_name || '',
              email,
              is_superadmin: email === 'gooseisback4u@gmail.com',
            },
            { onConflict: 'id' }
          )
          // optional: sign out the temporary server session (ignore)
          await pub.auth.signOut().catch(() => {})
        } else {
          return res.status(400).json({ error: msg })
        }
      } else {
        userId = linkData.user?.id || null
        actionLink =
          linkData.properties?.action_link ||
          (linkData as { properties?: { action_link?: string } }).properties?.action_link
        if (!userId) {
          return res.status(500).json({ error: 'User created but no user id returned' })
        }
        await admin.from('profiles').upsert(
          {
            id: userId,
            full_name,
            email,
            is_superadmin: email === 'gooseisback4u@gmail.com',
          },
          { onConflict: 'id' }
        )
        needsVerify = true
      }
    }

    if (!userId) return res.status(500).json({ error: 'Could not resolve user' })

    // One pending request per user
    const { data: pendingExisting } = await admin
      .from('organization_registration_requests')
      .select('id, status, organization_name, organization_slug')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingExisting) {
      return res.status(200).json({
        ok: true,
        existing: isExistingAccount,
        already_pending: true,
        user_id: userId,
        email,
        organization_slug: pendingExisting.organization_slug,
        message: `You already have a pending request for ${pendingExisting.organization_name}.`,
      })
    }

    const { error: reqErr } = await admin.from('organization_registration_requests').insert({
      user_id: userId,
      organization_name,
      organization_slug,
      description: organization_description,
      status: 'pending',
    })
    if (reqErr) {
      return res.status(500).json({ error: 'Org request failed: ' + reqErr.message })
    }

    // New accounts need verification email
    if (!isExistingAccount && needsVerify) {
      const RESEND_API_KEY = process.env.RESEND_API_KEY
      const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
      if (!RESEND_API_KEY) {
        return res.status(500).json({
          error: 'Email service not configured (RESEND_API_KEY). Account may exist — contact support.',
        })
      }
      if (!actionLink) {
        // regenerate link
        const { data: again } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo },
        })
        actionLink = again?.properties?.action_link
      }
      if (!actionLink) {
        return res.status(500).json({ error: 'Could not generate verification link' })
      }

      const { Resend } = await import('resend')
      const resend = new Resend(RESEND_API_KEY)
      const portalPreview = `${origin}/${organization_slug}`
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F4EFE1;color:#14110E">
          <h1 style="font-size:22px;margin:0 0 12px">Verify your email</h1>
          <p>Hi ${full_name || 'there'},</p>
          <p>Thanks for registering <strong>${organization_name}</strong> on MakeYourPass.</p>
          <p>Confirm your email to activate your account. After that, a superadmin will review your organization request.</p>
          <p style="margin:24px 0">
            <a href="${actionLink}"
               style="display:inline-block;background:#FF4D2E;color:#fff;padding:14px 20px;text-decoration:none;font-weight:700;border:2px solid #14110E">
              Confirm email address
            </a>
          </p>
          <p style="font-size:13px;color:#4A4640">
            Once approved, your portal will open at<br/>
            <strong>${portalPreview}</strong>
          </p>
        </div>
      `
      const { error: mailErr } = await resend.emails.send({
        from: RESEND_FROM,
        to: email,
        subject: `Verify your email — ${organization_name} on MakeYourPass`,
        html,
      })
      if (mailErr) {
        return res.status(500).json({
          error: 'Org request saved but verification email failed: ' + (mailErr.message || 'send error'),
          user_id: userId,
        })
      }

      return res.status(200).json({
        ok: true,
        user_id: userId,
        email,
        organization_slug,
        needs_verify: true,
        message: 'Check your inbox to verify your email',
      })
    }

    // Existing account path — no force re-verify; go wait on dashboard
    return res.status(200).json({
      ok: true,
      existing: true,
      needs_verify: needsVerify,
      user_id: userId,
      email,
      organization_slug,
      message: needsVerify
        ? 'Organization request submitted. Verify your email, then wait for approval on /dashboard.'
        : 'Organization request submitted. Wait for superadmin approval on /dashboard.',
    })
  } catch (err) {
    console.error('complete-signup', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

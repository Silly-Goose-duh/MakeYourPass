/**
 * POST /api/complete-signup
 *
 * Reliable account + org-request flow:
 * 1. createUser (admin) — not generateLink('signup') which leaves half-created users
 * 2. If email already registered → check password / unconfirmed state properly
 * 3. Create pending org request
 * 4. Try Resend verification email; if Resend sandbox blocks (or any send fail),
 *    auto-confirm the email so the user can sign in (domain not verified yet)
 */
export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

async function findUserByEmail(admin: AdminClient, email: string) {
  const target = email.toLowerCase()
  // Prefer profiles (fast)
  const { data: prof } = await admin.from('profiles').select('id, email').ilike('email', target).maybeSingle()
  if (prof?.id) {
    const { data } = await admin.auth.admin.getUserById(prof.id)
    if (data?.user) return data.user
  }
  // Paginate auth users (small projects)
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const hit = (data?.users || []).find((u: { email?: string }) => (u.email || '').toLowerCase() === target)
    if (hit) return hit
    if (!data?.users?.length || data.users.length < 200) break
  }
  return null
}

async function sendVerifyEmail(opts: {
  email: string
  fullName: string
  orgName: string
  orgSlug: string
  actionLink: string
  origin: string
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
  if (!RESEND_API_KEY) return { sent: false, error: 'RESEND_API_KEY missing' }

  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_API_KEY)
  const portalPreview = `${opts.origin}/${opts.orgSlug}`
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F4EFE1;color:#14110E">
      <h1 style="font-size:22px;margin:0 0 12px">Verify your email</h1>
      <p>Hi ${opts.fullName || 'there'},</p>
      <p>Thanks for registering <strong>${opts.orgName}</strong> on MakeYourPass.</p>
      <p>Confirm your email, then wait for superadmin approval of your organization.</p>
      <p style="margin:24px 0">
        <a href="${opts.actionLink}"
           style="display:inline-block;background:#FF4D2E;color:#fff;padding:14px 20px;text-decoration:none;font-weight:700;border:2px solid #14110E">
          Confirm email address
        </a>
      </p>
      <p style="font-size:13px;color:#4A4640">
        Once approved, your portal opens at<br/><strong>${portalPreview}</strong>
      </p>
      <p style="font-size:11px;color:#7A756B;word-break:break-all;margin-top:16px">${opts.actionLink}</p>
    </div>
  `
  const { error } = await resend.emails.send({
    from: RESEND_FROM,
    to: opts.email,
    subject: `Verify your email — ${opts.orgName} on MakeYourPass`,
    html,
  })
  if (error) return { sent: false, error: error.message || 'send failed' }
  return { sent: true as const, error: null }
}

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
    const existingOnly = !!body?.existing_only

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

    // Slug checks
    const { data: existingOrg } = await admin
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', organization_slug)
      .maybeSingle()
    if (existingOrg) {
      return res.status(400).json({
        error: `“/${organization_slug}” is already taken by ${existingOrg.name || 'another club'}. Pick a different Organization URL (e.g. ${organization_slug}-club or ${organization_slug}2). Or ask that club’s admin to invite you as a collaborator under Team.`,
        code: 'SLUG_TAKEN',
        slug: organization_slug,
      })
    }
    const { data: slugPending } = await admin
      .from('organization_registration_requests')
      .select('id, organization_name')
      .eq('organization_slug', organization_slug)
      .eq('status', 'pending')
      .maybeSingle()
    if (slugPending) {
      return res.status(400).json({
        error: `“/${organization_slug}” already has a pending request (${slugPending.organization_name}). Choose another URL or wait for that review to finish.`,
        code: 'SLUG_PENDING',
        slug: organization_slug,
      })
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'makeyourpass.vercel.app'
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const origin = `${proto}://${host}`
    const redirectTo = `${origin}/auth/callback`

    let userId: string | null = null
    let isNewUser = false
    let emailConfirmed = false

    // Path A: logged-in bearer
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (bearer && anon) {
      const userClient = supabaseMod.createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      })
      const { data: u } = await userClient.auth.getUser(bearer)
      if (u?.user?.id) {
        userId = u.user.id
        emailConfirmed = !!u.user.email_confirmed_at
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

    if (!userId && existingOnly) {
      return res.status(401).json({ error: 'Sign in first, then request your organization.' })
    }

    // Path B: create or recover account
    if (!userId) {
      if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' })
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' })
      }

      // Create brand-new user (confirmed later if email can't send)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name },
      })

      if (!createErr && created?.user?.id) {
        userId = created.user.id
        isNewUser = true
        emailConfirmed = !!created.user.email_confirmed_at
      } else {
        const msg = createErr?.message || 'Could not create account'
        const isDup = /already|registered|exists|duplicate/i.test(msg)

        if (!isDup) {
          return res.status(400).json({ error: msg })
        }

        // Account exists — resolve user + password
        const existing = await findUserByEmail(admin, email)
        if (!existing) {
          return res.status(400).json({
            error: 'This email is already registered. Sign in, then request an organization from your dashboard.',
            code: 'ACCOUNT_EXISTS',
          })
        }

        // Try password
        if (!anon) {
          return res.status(500).json({ error: 'Auth not configured (anon key)' })
        }
        const pub = supabaseMod.createClient(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: signed, error: signErr } = await pub.auth.signInWithPassword({ email, password })

        if (signed?.user?.id) {
          userId = signed.user.id
          emailConfirmed = !!signed.user.email_confirmed_at
          await pub.auth.signOut().catch(() => {})
        } else if (signErr && /confirm|not confirmed|verification/i.test(signErr.message || '')) {
          // Password is correct but email unconfirmed — unlock this attempt
          userId = existing.id
          await admin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || existing.user_metadata?.full_name },
          })
          emailConfirmed = true
        } else if (signErr && /invalid.*credentials|invalid login/i.test(signErr.message || '')) {
          return res.status(400).json({
            error:
              'An account with this email already exists, but that password is wrong. Sign in with the correct password, or use Forgot password.',
            code: 'ACCOUNT_EXISTS_WRONG_PASSWORD',
          })
        } else {
          // Unknown sign-in error — if unconfirmed, auto-confirm with provided password update
          if (!existing.email_confirmed_at) {
            userId = existing.id
            await admin.auth.admin.updateUserById(userId, {
              password,
              email_confirm: true,
              user_metadata: { full_name: full_name || existing.user_metadata?.full_name },
            })
            emailConfirmed = true
          } else {
            return res.status(400).json({
              error:
                'An account with this email already exists. Sign in, then request an organization from your dashboard.',
              code: 'ACCOUNT_EXISTS',
            })
          }
        }
      }

      if (!userId) {
        return res.status(500).json({ error: 'Could not create or find user' })
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
    }

    // Org request
    const { data: pendingExisting } = await admin
      .from('organization_registration_requests')
      .select('id, status, organization_name, organization_slug')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingExisting) {
      // Ensure they can sign in
      if (!emailConfirmed) {
        await admin.auth.admin.updateUserById(userId, { email_confirm: true })
        emailConfirmed = true
      }
      return res.status(200).json({
        ok: true,
        already_pending: true,
        user_id: userId,
        email,
        organization_slug: pendingExisting.organization_slug,
        needs_verify: false,
        can_sign_in: true,
        message: `You already have a pending request for ${pendingExisting.organization_name}. Sign in and open /dashboard.`,
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

    // Try verification email (best effort)
    let mailSent = false
    let mailNote = ''
    if (!emailConfirmed) {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: email || (await admin.auth.admin.getUserById(userId)).data?.user?.email || '',
        options: { redirectTo },
      })
      const actionLink = linkData?.properties?.action_link
      if (actionLink) {
        const send = await sendVerifyEmail({
          email: email || '',
          fullName: full_name,
          orgName: organization_name,
          orgSlug: organization_slug,
          actionLink,
          origin,
        })
        mailSent = send.sent
        if (!send.sent) {
          // Resend sandbox / domain — auto-confirm so product works
          await admin.auth.admin.updateUserById(userId, { email_confirm: true })
          emailConfirmed = true
          mailNote =
            'Verification email could not be delivered (email provider limit). Your account is activated — sign in with your password.'
        }
      } else {
        await admin.auth.admin.updateUserById(userId, { email_confirm: true })
        emailConfirmed = true
        mailNote = 'Account activated. Sign in with your password.'
      }
    }

    // New users who got mail still need to verify; if auto-confirmed they can sign in now
    return res.status(200).json({
      ok: true,
      user_id: userId,
      email,
      organization_slug,
      is_new_user: isNewUser,
      needs_verify: mailSent && !emailConfirmed,
      can_sign_in: emailConfirmed || !mailSent,
      email_sent: mailSent,
      message: mailSent
        ? 'Check your inbox to verify your email, then sign in. Your org request is pending approval.'
        : mailNote ||
          'Organization request submitted. Sign in and open /dashboard to wait for approval.',
    })
  } catch (err) {
    console.error('complete-signup', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

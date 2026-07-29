/**
 * POST /api/notify-org-decision
 * Body: {
 *   type: 'approved' | 'rejected',
 *   email: string,
 *   name?: string,
 *   organization_name: string,
 *   slug?: string,
 * }
 * Emails the org requester when superadmin approves/rejects.
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
    const type = String(body?.type || '')
    const email = String(body?.email || '').trim().toLowerCase()
    const name = String(body?.name || '').trim()
    const organization_name = String(body?.organization_name || '').trim()
    const slug = String(body?.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')

    if (!type || !email || !organization_name) {
      return res.status(400).json({ error: 'type, email, organization_name required' })
    }
    if (type !== 'approved' && type !== 'rejected') {
      return res.status(400).json({ error: 'type must be approved or rejected' })
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })

    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)

    const host =
      (req.headers['x-forwarded-host'] as string) ||
      (req.headers.host as string) ||
      'makeyourpass.vercel.app'
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
    const origin = `${proto}://${host}`.replace(/\/$/, '')
    const portalUrl = slug ? `${origin}/${slug}` : origin
    const loginUrl = `${origin}/login`
    const createEventUrl = `${origin}/dashboard/events/new`
    const hi = name || 'there'

    let subject: string
    let html: string

    if (type === 'approved') {
      subject = `You're live — ${organization_name} is active on MakeYourPass`
      html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4EFE1;color:#14110E;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border:2.5px solid #14110E;box-shadow:6px 6px 0 #14110E;padding:28px 24px">
      <div style="display:inline-block;background:#FFD23F;border:2px solid #14110E;padding:4px 10px;font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:14px">
        Approved
      </div>
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;font-weight:800">
        Your webpage is active 🎉
      </h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${hi},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55">
        Great news — <strong>${organization_name}</strong> has been approved on MakeYourPass.
        Your club portal is live and ready.
      </p>

      <p style="margin:20px 0 8px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#4A4640">
        Your portal
      </p>
      <p style="margin:0 0 18px">
        <a href="${portalUrl}"
           style="display:inline-block;background:#FF4D2E;color:#fff;padding:14px 20px;text-decoration:none;font-weight:800;border:2.5px solid #14110E">
          Open ${slug ? `/${slug}` : 'your portal'}
        </a>
      </p>
      <p style="margin:0 0 20px;font-size:13px;color:#4A4640;word-break:break-all">
        ${portalUrl}
      </p>

      <p style="margin:0 0 8px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#4A4640">
        What you can do now
      </p>
      <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.65;color:#14110E">
        <li><strong>Sign in</strong> with this email (${email})</li>
        <li>Open your portal and hit <strong>Create event</strong></li>
        <li>Publish events — attendees register and get tickets</li>
        <li>Use <strong>Scan</strong> + <strong>Live</strong> dashboard on event day</li>
        <li>Invite teammates under <strong>Team</strong> so more people can admit guests</li>
        <li>Set UPI details if you run paid events</li>
      </ol>

      <p style="margin:0 0 18px">
        <a href="${createEventUrl}"
           style="display:inline-block;background:#14110E;color:#FFD23F;padding:12px 18px;text-decoration:none;font-weight:800;border:2.5px solid #14110E;margin-right:8px">
          Create your first event
        </a>
        <a href="${loginUrl}"
           style="display:inline-block;background:#fff;color:#14110E;padding:12px 18px;text-decoration:none;font-weight:800;border:2.5px solid #14110E">
          Sign in
        </a>
      </p>

      <p style="margin:0;font-size:13px;line-height:1.5;color:#4A4640">
        Bookmark your portal link and share it on Instagram / WhatsApp so students can find your events.
      </p>
    </div>
    <p style="font-size:12px;color:#7A756B;margin:18px 4px 0;text-align:center">
      — MakeYourPass · Campus events, tickets &amp; check-in
    </p>
  </div>
</body>
</html>
      `.trim()
    } else {
      subject = `Update on ${organization_name} — MakeYourPass`
      html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4EFE1;color:#14110E;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border:2.5px solid #14110E;box-shadow:6px 6px 0 #14110E;padding:28px 24px">
      <h1 style="font-size:22px;margin:0 0 12px;font-weight:800">Request not approved</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55">Hi ${hi},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55">
        Your request for <strong>${organization_name}</strong> was not approved at this time.
      </p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#4A4640">
        You can sign in and submit a new organization request if you want to try again.
      </p>
      <a href="${loginUrl}"
         style="display:inline-block;background:#14110E;color:#fff;padding:12px 18px;text-decoration:none;font-weight:800;border:2.5px solid #14110E">
        Sign in
      </a>
    </div>
    <p style="font-size:12px;color:#7A756B;margin:18px 4px 0;text-align:center">— MakeYourPass</p>
  </div>
</body>
</html>
      `.trim()
    }

    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: email,
      subject,
      html,
    })
    if (error) return res.status(500).json({ error: error.message || 'Send failed' })
    return res.status(200).json({ ok: true, id: data?.id, to: email, type })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

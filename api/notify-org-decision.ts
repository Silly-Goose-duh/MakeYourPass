/**
 * POST /api/notify-org-decision
 * Body: {
 *   type: 'approved' | 'rejected',
 *   email: string,
 *   name?: string,
 *   organization_name: string,
 *   slug?: string,
 * }
 * Sends Resend email when superadmin approves/rejects an org request.
 * Call after successful RPC (client or server). No auth gate beyond
 * knowing the email — prefer calling only from MC after RPC success.
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
    const { type, email, name, organization_name, slug } = body || {}
    if (!type || !email || !organization_name) {
      return res.status(400).json({ error: 'type, email, organization_name required' })
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'MakeYourPass <onboarding@resend.dev>'
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' })

    const { Resend } = await import('resend')
    const resend = new Resend(RESEND_API_KEY)

    const portalUrl = slug
      ? `https://makeyourpass.vercel.app/${slug}`
      : 'https://makeyourpass.vercel.app'

    let subject: string
    let html: string

    if (type === 'approved') {
      subject = `Your portal is live — ${organization_name}`
      html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F4EFE1;color:#14110E">
          <h1 style="font-size:22px;margin:0 0 12px">Portal opened 🎟️</h1>
          <p>Hi ${name || 'there'},</p>
          <p>Great news — <strong>${organization_name}</strong> has been approved on MakeYourPass.</p>
          <p>Your organization dashboard is live at:</p>
          <p style="margin:20px 0">
            <a href="${portalUrl}" style="display:inline-block;background:#FF4D2E;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700;border:2px solid #14110E">
              Open ${portalUrl.replace('https://', '')}
            </a>
          </p>
          <p style="font-size:14px;color:#4A4640">
            Sign in with this email, then open that link to create events, set UPI, manage execom, and check in guests.
          </p>
          <p style="font-size:12px;color:#7A756B;margin-top:28px">— MakeYourPass · Marian Engineering College</p>
        </div>
      `
    } else {
      subject = `Organization request update — ${organization_name}`
      html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F4EFE1;color:#14110E">
          <h1 style="font-size:22px;margin:0 0 12px">Request not approved</h1>
          <p>Hi ${name || 'there'},</p>
          <p>Your request for <strong>${organization_name}</strong> was not approved at this time.</p>
          <p>You can sign in and submit a new organization request if needed.</p>
          <p style="font-size:12px;color:#7A756B;margin-top:28px">— MakeYourPass</p>
        </div>
      `
    }

    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: email,
      subject,
      html,
    })
    if (error) return res.status(500).json({ error: error.message || 'Send failed' })
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}

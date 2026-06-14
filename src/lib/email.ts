import emailjs from '@emailjs/browser'

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || ''
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || ''

const isConfigured = !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY)

export interface ConfirmationEmailParams {
  to_name: string
  to_email: string
  event_title: string
  event_date: string
  event_time: string
  event_venue: string
  ticket_type: string
  quantity: number
  qr_code_url: string
  event_url: string
}

/**
 * Send a registration confirmation email via EmailJS.
 * Returns an object with `success: boolean` and optional `error` message.
 */
export async function sendConfirmationEmail(params: ConfirmationEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!isConfigured) {
    console.warn(
      '⚠️ EmailJS not configured. Set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY in .env.local'
    )
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_name: params.to_name,
        to_email: params.to_email,
        event_title: params.event_title,
        event_date: params.event_date,
        event_time: params.event_time,
        event_venue: params.event_venue,
        ticket_type: params.ticket_type,
        quantity: params.quantity,
        qr_code_url: params.qr_code_url,
        event_url: params.event_url,
      },
      EMAILJS_PUBLIC_KEY
    )

    if (response.status === 200) {
      return { success: true }
    }
    return { success: false, error: `EmailJS returned status ${response.status}` }
  } catch (err: unknown) {
    console.error('Failed to send confirmation email:', err)
    const emailErr = err as { status?: number; text?: string }
    return { success: false, error: emailErr?.text || (err instanceof Error ? err.message : 'Unknown email error') }
  }
}

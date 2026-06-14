import Razorpay from 'razorpay'
import crypto from 'crypto'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || ''
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''

function getClient() {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay not configured — missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET')
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
}

/**
 * POST /api/razorpay
 * Action: "create-order" — creates a Razorpay order
 * Body: { amount: number (paise), currency?: string, receipt?: string }
 * Response: { id, amount, currency, key_id }
 *
 * Action: "verify-payment" — verifies a Razorpay payment signature
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Response: { verified: boolean }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: { method: string; body: string }, res: any) {
  // Set CORS headers for client-side fetch
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { action } = body

    if (action === 'create-order') {
      const { amount, currency = 'INR', receipt } = body
      if (!amount || amount <= 0) {
        res.status(400).json({ error: 'Invalid amount' })
        return
      }

      const client = getClient()
      const order = await client.orders.create({
        amount,
        currency,
        receipt: receipt || `txn_${Date.now()}`,
        notes: {},
      })

      res.status(200).json({
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: RAZORPAY_KEY_ID,
      })

    } else if (action === 'verify-payment') {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        res.status(400).json({ error: 'Missing payment verification fields' })
        return
      }

      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex')

      const verified = expectedSignature === razorpay_signature

      res.status(200).json({ verified, payment_id: razorpay_payment_id })

    } else {
      res.status(400).json({ error: 'Unknown action. Use "create-order" or "verify-payment".' })
    }
  } catch (err: unknown) {
    console.error('Razorpay API error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
}

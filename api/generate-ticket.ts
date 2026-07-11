/**
 * POST /api/generate-ticket
 *
 * Generates a PNG ticket for a registration and uploads it to the
 * `tickets` storage bucket, then saves the public URL to
 * event_responses.ticket_url.
 *
 * Body: { registration_id: string }
 * Response: { ticket_url: string }
 *
 * Server-side only. Uses the SUPABASE_SERVICE_ROLE_KEY (never exposed to
 * the browser). The QR encodes ONLY the random qr_token (unguessable).
 */
import fs from 'fs'
import path from 'path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import QRCode from 'qrcode'
import { TicketTemplate } from '../src/lib/ticketTemplate'
import { getSupabaseAdmin } from './_lib/supabaseAdmin'

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
    const { registration_id, regenerate } = body as { registration_id?: string; regenerate?: boolean }
    if (!registration_id) return res.status(400).json({ error: 'registration_id required' })

    const sb = getSupabaseAdmin()

    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('id, event_id, respondent_name, respondent_email, unique_code, qr_token, ticket_url, events(title, date, time, venue)')
      .eq('id', registration_id)
      .single()
    if (regErr || !reg) return res.status(404).json({ error: 'Registration not found' })

    // Already generated? Return cached URL (idempotent) unless regenerate.
    if (reg.ticket_url && !regenerate) return res.status(200).json({ ticket_url: reg.ticket_url })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (reg as any).events || {}
    const qrSvg = await QRCode.toString(reg.qr_token, { type: 'svg', margin: 1, width: 150 })
    const dateStr = [ev.date, ev.time].filter(Boolean).join(' · ')

    const element = TicketTemplate({
      data: {
        uniqueCode: reg.unique_code || 'PENDING',
        eventTitle: ev.title || 'Event',
        eventDate: dateStr || '',
        eventVenue: ev.venue || '',
        respondentName: reg.respondent_name || '',
        qrSvg,
      },
    })

    const fontPath = path.join(process.cwd(), 'api', 'fonts', 'SpaceGrotesk-Regular.ttf')
    const fontData = fs.readFileSync(fontPath)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await satori(element as any, {
      width: 600,
      height: 300,
      fonts: [{ name: 'Space Grotesk', data: fontData, weight: 400, style: 'normal' }],
    })
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 600 } }).render().asPng()

    const filePath = `tickets/${reg.event_id}/${reg.id}.png`
    const { error: upErr } = await sb.storage
      .from('tickets')
      .upload(filePath, png, { contentType: 'image/png', upsert: true })
    if (upErr) return res.status(500).json({ error: 'Upload failed: ' + upErr.message })

    const { data: urlData } = sb.storage.from('tickets').getPublicUrl(filePath)
    const ticketUrl = urlData.publicUrl

    await sb.from('event_responses').update({ ticket_url: ticketUrl }).eq('id', reg.id)

    return res.status(200).json({ ticket_url: ticketUrl })
  } catch (err: unknown) {
    console.error('generate-ticket error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return res.status(500).json({ error: message })
  }
}

/**
 * POST /api/generate-ticket
 *
 * Generates an SVG ticket for a registration and uploads it to the
 * `tickets` storage bucket, then saves the public URL to
 * event_responses.ticket_url.
 *
 * Body: { registration_id: string, regenerate?: boolean }
 * Response: { ticket_url: string }
 *
 * Server-side only. Uses the SUPABASE_SERVICE_ROLE_KEY (never exposed to
 * the browser). The QR encodes ONLY the random qr_token (unguessable).
 *
 * Dependency notes (learned the hard way on Vercel's Node runtime):
 *  - @supabase/supabase-js + qrcode-generator MUST be dynamically imported
 *    inside the handler; several other libs (qrcode, satori, @resvg/resvg-js,
 *    @vercel/og) crash the function at init (FUNCTION_INVOCATION_FAILED).
 *  - The ticket is a PURE SVG string (no rasterizer) — 100% reliable.
 *  - buildTicketSvg is inlined (a separate api/_lib .ts import also crashed
 *    the Vercel function bundler).
 */

export const config = { runtime: 'nodejs' }

interface TicketData {
  uniqueCode: string
  eventTitle: string
  eventDate: string
  eventVenue: string
  respondentName: string
  qrSvg: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function perfEdge(y: number, color: string): string {
  let dots = ''
  for (let x = 8; x < 600; x += 20) dots += `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`
  return dots
}

function buildTicketSvg(data: TicketData): string {
  const primary = '#14110E'
  const accent = '#FF4D2E'
  const text = '#FFFFFF'
  const title = esc(data.eventTitle).slice(0, 38)
  const date = esc(data.eventDate)
  const venue = esc(data.eventVenue)
  const name = esc(data.respondentName)
  const code = esc(data.uniqueCode)
  const qr = data.qrSvg.replace(/<\?xml[^>]*\?>/, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300" font-family="Arial, Helvetica, sans-serif">
  <rect width="600" height="300" fill="${primary}"/>
  ${perfEdge(7, primary)}
  ${perfEdge(293, primary)}
  <text x="26" y="40" fill="${accent}" font-size="13" letter-spacing="2" font-weight="bold">MAKEYOURPASS</text>
  <text x="26" y="78" fill="${text}" font-size="26" font-weight="bold">${title}</text>
  <text x="26" y="112" fill="${text}" font-size="14" opacity="0.9">${date}</text>
  <text x="26" y="134" fill="${text}" font-size="14" opacity="0.9">${venue}</text>
  <text x="26" y="176" fill="${text}" font-size="13" opacity="0.8">${name}</text>
  <line x1="400" y1="20" x2="400" y2="280" stroke="${accent}" stroke-width="2" stroke-dasharray="4 4"/>
  <rect x="412" y="24" width="162" height="200" fill="#FFFFFF"/>
  <g transform="translate(437,34) scale(0.62)">${qr}</g>
  <text x="493" y="252" fill="#14110E" font-size="16" font-weight="bold" font-family="monospace" text-anchor="middle" letter-spacing="1">${code}</text>
</svg>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const supabaseMod = await import('@supabase/supabase-js')
    const qrg = (await import('qrcode-generator')).default

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { registration_id, regenerate } = body as { registration_id?: string; regenerate?: boolean }
    if (!registration_id) return res.status(400).json({ error: 'registration_id required' })

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return res.status(500).json({ error: 'Supabase service role not configured' })
    const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })

    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('id, event_id, respondent_name, respondent_email, unique_code, qr_token, ticket_url, events(title, date, time, venue)')
      .eq('id', registration_id)
      .single()
    if (regErr || !reg) return res.status(404).json({ error: 'Registration not found' })

    if (reg.ticket_url && !regenerate) return res.status(200).json({ ticket_url: reg.ticket_url })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (reg as any).events || {}
    const qr = qrg(0, 'M')
    qr.addData(reg.qr_token)
    qr.make()
    const qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
    const dateStr = [ev.date, ev.time].filter(Boolean).join(' · ')

    const svg = buildTicketSvg({
      uniqueCode: reg.unique_code || 'PENDING',
      eventTitle: ev.title || 'Event',
      eventDate: dateStr || '',
      eventVenue: ev.venue || '',
      respondentName: reg.respondent_name || '',
      qrSvg,
    })

    const filePath = `tickets/${reg.event_id}/${reg.id}.svg`
    const { error: upErr } = await sb.storage
      .from('tickets')
      .upload(filePath, svg, { contentType: 'image/svg+xml', upsert: true })
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

/**
 * POST /api/generate-ticket
 *
 * Generates a PNG ticket for a registration and uploads it to the
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
 *    inside the handler. satori / @resvg/resvg-js / @vercel/og ALL crash the
 *    Vercel function at init (FUNCTION_INVOCATION_FAILED).
 *  - pureimage is a PURE-JS PNG encoder (no native binary) — the only
 *    rasterizer that loads reliably here. Email clients can't preview SVG
 *    attachments, so we ship PNG (opens everywhere).
 *  - pureimage's TTF loader is broken here, so text is drawn with a
 *    self-contained 5x7 bitmap font — zero font-file dependency.
 *  - The renderer is inlined (a separate api/_lib .ts import also crashed
 *    the Vercel function bundler).
 */

export const config = { runtime: 'nodejs' }

// --- 5x7 bitmap font (MSB = left pixel). A-Z, 0-9, space, a few symbols. ---
const FONT: Record<string, number[]> = {
  A: [0x1f,0x11,0x1f,0x11,0x11,0x11,0x11], B: [0x1e,0x12,0x1e,0x12,0x12,0x12,0x1e],
  C: [0x1f,0x10,0x10,0x10,0x10,0x10,0x1f], D: [0x1e,0x12,0x12,0x12,0x12,0x12,0x1e],
  E: [0x1f,0x10,0x1e,0x10,0x10,0x10,0x1f], F: [0x1f,0x10,0x1e,0x10,0x10,0x10,0x10],
  G: [0x1f,0x10,0x10,0x17,0x12,0x12,0x1f], H: [0x11,0x11,0x1f,0x11,0x11,0x11,0x11],
  I: [0x0e,0x04,0x04,0x04,0x04,0x04,0x0e], J: [0x07,0x02,0x02,0x02,0x12,0x12,0x1c],
  K: [0x12,0x14,0x18,0x10,0x14,0x12,0x12], L: [0x10,0x10,0x10,0x10,0x10,0x10,0x1f],
  M: [0x11,0x1b,0x15,0x15,0x11,0x11,0x11], N: [0x11,0x19,0x15,0x15,0x13,0x11,0x11],
  O: [0x1f,0x11,0x11,0x11,0x11,0x11,0x1f], P: [0x1e,0x12,0x12,0x1e,0x10,0x10,0x10],
  Q: [0x1f,0x11,0x11,0x11,0x15,0x13,0x1d], R: [0x1e,0x12,0x12,0x1e,0x14,0x12,0x12],
  S: [0x1f,0x10,0x1f,0x01,0x01,0x10,0x1f], T: [0x1f,0x04,0x04,0x04,0x04,0x04,0x04],
  U: [0x11,0x11,0x11,0x11,0x11,0x11,0x1f], V: [0x11,0x11,0x11,0x11,0x11,0x0a,0x04],
  W: [0x11,0x11,0x11,0x15,0x15,0x1b,0x11], X: [0x11,0x11,0x0a,0x04,0x0a,0x11,0x11],
  Y: [0x11,0x11,0x0a,0x04,0x04,0x04,0x04], Z: [0x1f,0x02,0x04,0x08,0x10,0x10,0x1f],
  '0':[0x1f,0x11,0x15,0x15,0x15,0x11,0x1f], '1':[0x04,0x0c,0x04,0x04,0x04,0x04,0x0e],
  '2':[0x1e,0x01,0x1f,0x10,0x10,0x10,0x1f], '3':[0x1f,0x01,0x1f,0x01,0x01,0x01,0x1f],
  '4':[0x11,0x11,0x11,0x1f,0x01,0x01,0x01], '5':[0x1f,0x10,0x1f,0x01,0x01,0x10,0x1f],
  '6':[0x1f,0x10,0x1f,0x11,0x11,0x11,0x1f], '7':[0x1f,0x01,0x02,0x04,0x08,0x08,0x08],
  '8':[0x1f,0x11,0x1f,0x11,0x11,0x11,0x1f], '9':[0x1f,0x11,0x11,0x1f,0x01,0x01,0x1f],
  ' ':[0,0,0,0,0,0,0], '.':[0,0,0,0,0,0,0x0e], ',':[0,0,0,0,0,0x0e,0x04],
  ':':[0,0x0e,0,0,0x0e,0,0], '-':[0,0,0,0x1f,0,0,0], '@':[0x1f,0x11,0x17,0x15,0x17,0x10,0x1f],
  '/':[0x01,0x02,0x04,0x04,0x08,0x08,0x10], '#':[0x0a,0x0a,0x1f,0x0a,0x1f,0x0a,0x0a],
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawText(ctx: any, text: string, x: number, y: number, scale: number, color: string) {
  let cx = x
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] || FONT[' ']
    for (let row = 0; row < 7; row++) {
      const bits = g[row]
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          ctx.fillStyle = color
          ctx.fillRect(cx + col * scale, y + row * scale, scale, scale)
        }
      }
    }
    cx += 6 * scale
  }
}
function textWidth(text: string, scale: number): number {
  return text.toUpperCase().length * 6 * scale
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
    const pure = await import('pureimage')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PImage = ((pure as any).default || pure)

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

    // QR as module grid
    const qr = qrg(0, 'M')
    qr.addData(reg.qr_token)
    qr.make()
    const count = qr.getModuleCount()
    const modules: boolean[][] = []
    for (let r = 0; r < count; r++) {
      modules[r] = []
      for (let c = 0; c < count; c++) modules[r][c] = qr.isDark(r, c)
    }

    const dateStr = [ev.date, ev.time].filter(Boolean).join(' . ')
    const title = (ev.title || 'EVENT').toString().toUpperCase()
    const name = ('NAME: ' + (reg.respondent_name || '')).toUpperCase()
    const venue = (ev.venue || '').toString().toUpperCase()

    const W = 600, H = 300
    const canvas = PImage.make(W, H)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#14110E'; ctx.fillRect(0, 0, W, H)

    drawText(ctx, 'MAKEYOURPASS', 26, 26, 3, '#FF4D2E')
    // title (wrap if very long)
    const tScale = title.length > 22 ? 2 : 3
    drawText(ctx, title.slice(0, 34), 26, 60, tScale, '#FFFFFF')
    drawText(ctx, dateStr.slice(0, 40), 26, 100, 2, '#FFFFFF')
    drawText(ctx, venue.slice(0, 40), 26, 122, 2, '#FFFFFF')
    drawText(ctx, name.slice(0, 40), 26, 150, 2, '#FFFFFF')

    // dashed divider (segments; pureimage has no setLineDash)
    ctx.fillStyle = '#FF4D2E'
    for (let y = 16; y < 284; y += 10) ctx.fillRect(394, y, 2, 5)

    // white stub + QR
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(410, 22, 164, 204)
    const qrSize = 132, qrPad = 14, cell = qrSize / count
    const ox = 410 + qrPad, oy = 22 + qrPad
    ctx.fillStyle = '#000000'
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (modules[r][c]) ctx.fillRect(ox + c * cell, oy + r * cell, Math.ceil(cell), Math.ceil(cell))
    // code (centered under QR, inside white stub)
    const code = (reg.unique_code || 'PENDING').toUpperCase()
    const cScale = code.length > 10 ? 2 : 3
    const cw = textWidth(code, cScale)
    drawText(ctx, code, 410 + (164 - cw) / 2, 196, cScale, '#14110E')

    const chunks: Uint8Array[] = []
    const { Writable } = await import('stream')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sink = new Writable({ write(chunk: any, _enc: any, next: any) { chunks.push(chunk); next() } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await PImage.encodePNGToStream(canvas, sink as any)
    const png = Buffer.concat(chunks)

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

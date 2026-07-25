/**
 * POST /api/generate-certificate
 * Body: { registration_id, regenerate? }
 * Draws attendee name onto certificate template (or a simple default).
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
    const { registration_id, regenerate } = body || {}
    if (!registration_id) return res.status(400).json({ error: 'registration_id required' })

    const supabaseMod = await import('@supabase/supabase-js')
    const pure = await import('pureimage')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PImage = ((pure as any).default || pure)

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' })
    const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })

    const { data: reg, error } = await sb
      .from('event_responses')
      .select('id, event_id, respondent_name, certificate_url, admitted_at, events(title, certificate_template_url, date)')
      .eq('id', registration_id)
      .single()
    if (error || !reg) return res.status(404).json({ error: 'Registration not found' })
    if (reg.certificate_url && !regenerate) {
      return res.status(200).json({ certificate_url: reg.certificate_url })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = (reg as any).events || {}
    const name = (reg.respondent_name || 'Participant').toString()
    const title = (ev.title || 'Event').toString()
    const templateUrl = (ev.certificate_template_url || '').toString()

    const W = 1200
    const H = 850
    const canvas = PImage.make(W, H)
    const ctx = canvas.getContext('2d')

    // Background: try template image, else solid
    let usedTemplate = false
    if (templateUrl) {
      try {
        const imgRes = await fetch(templateUrl)
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer())
          // pureimage can decode PNG/JPEG from stream
          const { Readable } = await import('stream')
          const stream = Readable.from(buf)
          const img = await (PImage.decodePNGFromStream
            ? PImage.decodePNGFromStream(stream).catch(async () => {
                const stream2 = Readable.from(buf)
                return PImage.decodeJPEGFromStream
                  ? PImage.decodeJPEGFromStream(stream2)
                  : null
              })
            : null)
          if (img) {
            ctx.drawImage(img, 0, 0, W, H)
            usedTemplate = true
          }
        }
      } catch {
        usedTemplate = false
      }
    }
    if (!usedTemplate) {
      ctx.fillStyle = '#F4EFE1'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#14110E'
      ctx.fillRect(40, 40, W - 80, H - 80)
      ctx.fillStyle = '#F4EFE1'
      ctx.fillRect(48, 48, W - 96, H - 96)
    }

    // Overlay name near center
    ctx.fillStyle = '#14110E'
    // pureimage has limited font support — use fillText if available
    try {
      ctx.font = '48pt sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(name, W / 2, H * 0.55)
      ctx.font = '20pt sans-serif'
      ctx.fillText(title, W / 2, H * 0.55 + 56)
      if (ev.date) {
        ctx.font = '14pt sans-serif'
        ctx.fillText(String(ev.date), W / 2, H * 0.55 + 90)
      }
    } catch {
      // fallback: colored bar as marker
      ctx.fillStyle = '#FF4D2E'
      ctx.fillRect(W / 2 - 200, H * 0.52, 400, 8)
    }

    const chunks: Uint8Array[] = []
    const { Writable } = await import('stream')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sink = new Writable({ write(chunk: any, _e: any, next: any) { chunks.push(chunk); next() } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await PImage.encodePNGToStream(canvas, sink as any)
    const png = Buffer.concat(chunks)

    const filePath = `certs/${reg.event_id}/${reg.id}.png`
    const { error: upErr } = await sb.storage
      .from('certificates')
      .upload(filePath, png, { contentType: 'image/png', upsert: true })
    if (upErr) return res.status(500).json({ error: 'Upload failed: ' + upErr.message })

    const { data: urlData } = sb.storage.from('certificates').getPublicUrl(filePath)
    const certificate_url = urlData.publicUrl
    await sb.from('event_responses').update({ certificate_url }).eq('id', reg.id)

    return res.status(200).json({ certificate_url })
  } catch (err) {
    console.error('generate-certificate', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
  }
}

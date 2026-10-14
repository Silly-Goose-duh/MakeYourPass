/**
 * POST /api/generate-certificate
 * Body: { registration_id, regenerate? }
 * Draws attendee name onto certificate template (or a simple default).
 *
 * SECURITY: this endpoint previously had NO authentication at all — any caller
 * who learned a `registration_id` could render (and repeatedly re-render) a
 * named certificate for an arbitrary attendee and write objects into the
 * `certificates` bucket. It now requires an authenticated org admin/host (or a
 * superadmin) for the registration's event, exactly like /api/generate-ticket.
 *
 * NOTE: as of this writing no client code calls this endpoint, so it is
 * currently orphaned. It is kept because certificate issuance is a shipped
 * roadmap item, but it should be wired up (or deleted) rather than left as a
 * service-role-backed write path nobody exercises.
 */
export const config = { runtime: 'nodejs' }

/* eslint-disable @typescript-eslint/no-explicit-any -- Vercel gives us untyped req/res. */

/** Refuse internal/loopback/link-local targets before we fetch them server-side. */
function assertFetchableTemplateUrl(rawUrl: string): URL | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return null
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number)
    if (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return null
    }
  }
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return null
  }
  return url
}

export default async function handler(req: any, res: any) {
  const { applyCors, fail, readBody, isUuid } = await import('./_lib/http')
  const { rateLimit, applyLimitHeaders, clientIp } = await import('./_lib/rateLimit')
  const { resolveCaller, requireResponseAccess } = await import('./_lib/authz')

  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Rate limit before the expensive image work.
    const limit = await rateLimit(`rl:cert:${clientIp(req)}`, 20, 10 * 60 * 1000)
    if (applyLimitHeaders(res, limit)) {
      return res.status(429).json({ error: 'Too many certificate requests — try again shortly' })
    }

    const body = readBody(req)
    if (!body) return fail(res, 400, 'Invalid JSON body')
    const { registration_id, regenerate } = body as { registration_id?: string; regenerate?: boolean }
    if (!isUuid(registration_id)) return fail(res, 400, 'registration_id required')

    // ── Authorization ──────────────────────────────────────────────────────
    const caller = await resolveCaller(req)
    if (!caller) return res.status(401).json({ error: 'Sign in to generate certificates' })

    const supabaseMod = await import('@supabase/supabase-js')
    const pure = await import('pureimage')
    const PImage = ((pure as any).default || pure)

    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return fail(res, 500, 'Server not configured')
    const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })

    const access = await requireResponseAccess(sb, caller, registration_id)
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error })
    }

    const { data: reg, error } = await sb
      .from('event_responses')
      .select('id, event_id, respondent_name, certificate_url, admitted_at, events(title, certificate_template_url, date)')
      .eq('id', registration_id)
      .single()
    if (error || !reg) return res.status(404).json({ error: 'Registration not found' })
    if (reg.certificate_url && !regenerate) {
      return res.status(200).json({ certificate_url: reg.certificate_url })
    }

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
    // The template URL is org-supplied, so this is not user-controlled SSRF —
    // but a malicious/compromised org admin could still point it at an
    // internal service, so it goes through the same guard as the poster fetch.
    const templateTarget = templateUrl ? assertFetchableTemplateUrl(templateUrl) : null
    if (templateUrl && !templateTarget) {
      console.warn('[generate-certificate] refused non-public certificate template URL')
    }
    if (templateTarget) {
      try {
        const imgRes = await fetch(templateTarget.toString())
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
    const sink = new Writable({ write(chunk: any, _e: any, next: any) { chunks.push(chunk); next() } })
    await PImage.encodePNGToStream(canvas, sink as any)
    const png = Buffer.concat(chunks)

    const filePath = `certs/${reg.event_id}/${reg.id}.png`
    const { error: upErr } = await sb.storage
      .from('certificates')
      .upload(filePath, png, { contentType: 'image/png', upsert: true })
    if (upErr) return fail(res, 500, 'Could not store the certificate', upErr)

    const { data: urlData } = sb.storage.from('certificates').getPublicUrl(filePath)
    const certificate_url = urlData.publicUrl
    await sb.from('event_responses').update({ certificate_url }).eq('id', reg.id)

    return res.status(200).json({ certificate_url })
  } catch (err) {
    return fail(res, 500, 'Internal error', err)
  }
}

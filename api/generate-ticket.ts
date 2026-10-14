/**
 * POST /api/generate-ticket
 *
 * Generates a PNG ticket for a registration and uploads it to the
 * `tickets` storage bucket, then saves the STORAGE PATH to
 * event_responses.ticket_url.
 *
 * Body: { registration_id: string, regenerate?: boolean }
 * Response: { ticket_url: string }   // a storage path, e.g.
 *                                     // tickets/<event_id>/<registration_id>.png
 *
 * ── AUTH ────────────────────────────────────────────────────────────────────
 * This endpoint had NO authorization at all: anyone who learned (or guessed)
 * a registration_id could render — and therefore read — anyone's ticket.
 * It now requires EITHER
 *   (a) `Authorization: Bearer <supabase access token>` belonging to a
 *       superadmin / org admin / host of the registration's event
 *       (401 unauthenticated, 403 wrong org), OR
 *   (b) the server-to-server `x-internal-secret` header
 *       (INTERNAL_API_SECRET || CRON_SECRET || SETUP_SECRET), used by
 *       on-registration.ts so the anonymous signup funnel can still render a
 *       ticket without a user session.
 * Rate limit: 20 generations / 10 min per caller (PNG rendering + storage
 * upload + DB write is the most expensive thing this API does).
 *
 * ── PRIVATE BUCKET ──────────────────────────────────────────────────────────
 * The `tickets` bucket is going PRIVATE (it used to be world-readable and
 * leaked every attendee's name and QR through a public URL), so
 * `getPublicUrl()` is dead. We store and return the storage PATH instead.
 * Rows written before the migration still contain a full public URL; those are
 * passed back untouched (backward compatible) — use /api/ticket-image to get a
 * short-lived signed URL for display.
 *
 * Server-side only. Uses the SUPABASE_SERVICE_ROLE_KEY (never exposed to
 * the browser). The QR encodes ONLY the random qr_token (unguessable).
 *
 * Dependency notes (learned the hard way on Vercel's Node runtime):
 *  - @supabase/supabase-js + qrcode-generator MUST be dynamically imported
 *    inside the handler. satori / @resvg/resvg-js / @vercel/og ALL crash the
 *    Vercel function at init (FUNCTION_INVOCATION_FAILED).
 *  - the same applies to the shared helpers in ./_lib: they MUST be imported
 *    with `await import(...)` INSIDE the handler, never statically at the top.
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
  // NOTE: every helper is dynamically imported INSIDE the handler — a static
  // top-level import of _lib/* crashes the Vercel function bundler.
  const { applyCors, fail, readBody, isUuid } = await import('./_lib/http')
  const { rateLimit, applyLimitHeaders, clientIp } = await import('./_lib/rateLimit')
  const { resolveCaller, requireResponseAccess, serviceClient } = await import('./_lib/authz')

  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = readBody(req)
    if (body === null) return fail(res, 400, 'Invalid request body')
    const { registration_id, regenerate } = body as { registration_id?: string; regenerate?: boolean }
    if (!isUuid(registration_id)) return res.status(400).json({ error: 'registration_id required' })

    const sb = await serviceClient()
    if (!sb) return fail(res, 500, 'Server not configured')

    // ── Auth: user token with org scoping, or the internal server secret ──
    const expectedSecret =
      process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || process.env.SETUP_SECRET || ''
    const gotSecret = String(req.headers['x-internal-secret'] || '')
    const internal =
      !!expectedSecret && gotSecret.length === expectedSecret.length && gotSecret === expectedSecret

    const caller = await resolveCaller(req)
    if (!caller && !internal) return fail(res, 401, 'Authentication required')

    const rl = await rateLimit(
      `gen-ticket:${caller ? caller.id : `internal:${clientIp(req)}`}`,
      20,
      10 * 60 * 1000,
    )
    if (applyLimitHeaders(res, rl)) {
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
    }

    if (caller) {
      const access = await requireResponseAccess(sb, caller, registration_id)
      if (!access.ok) {
        if (access.status === 404) return fail(res, 404, 'Registration not found')
        return fail(res, access.status, access.error)
      }
    }

    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('id, event_id, respondent_name, respondent_email, unique_code, qr_token, ticket_url, events(title, date, time, venue)')
      .eq('id', registration_id)
      .maybeSingle()
    if (regErr) return fail(res, 500, 'Internal error', regErr)
    if (!reg) return res.status(404).json({ error: 'Registration not found' })

    // Legacy rows still hold a full public URL — hand it back untouched.
    if (reg.ticket_url && !regenerate) return res.status(200).json({ ticket_url: reg.ticket_url })

    // Heavy modules are imported HERE (after auth) so an unauthorized or
    // cached request never pays for loading pureimage/qrcode at all.
    const qrg = (await import('qrcode-generator')).default
    const pure = await import('pureimage')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PImage = ((pure as any).default || pure)

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
    if (upErr) return fail(res, 500, 'Ticket upload failed', upErr)

    // The bucket is PRIVATE: store the storage PATH, not a public URL.
    // getPublicUrl() is intentionally gone — it would hand out a dead link
    // the moment the bucket migration lands, and a working one while the
    // bucket is still public (the attendee-name leak we are closing).
    const { error: dbErr } = await sb
      .from('event_responses')
      .update({ ticket_url: filePath })
      .eq('id', reg.id)
    if (dbErr) return fail(res, 500, 'Internal error', dbErr)

    return res.status(200).json({ ticket_url: filePath })
  } catch (err: unknown) {
    return fail(res, 500, 'Internal error', err)
  }
}

/**
 * POST /api/ticket-image
 *
 * Returns a SHORT-LIVED SIGNED URL for a registration's ticket PNG so a host
 * can open / preview it.
 *
 * WHY THIS EXISTS:
 *   The `tickets` storage bucket was created `public: true` (see
 *   supabase/phase1-ticketing.sql) and the ticket URL was persisted verbatim in
 *   event_responses.ticket_url. That made every attendee's ticket a world
 *   readable document containing their NAME and a scannable QR — anyone who
 *   could reach the Supabase project URL, or any host page that leaked one,
 *   could walk the attendee list. The bucket is being migrated to private, so
 *   the frontend can no longer point an <img src> at ticket_url directly and
 *   must ask this endpoint for a signed link instead.
 *
 * Body:      { registration_id: string }
 * Response:  { url: string | null }   // null = no ticket rendered yet
 * Status:    404 when the registration does not exist (or is invisible)
 *
 * ── AUTH ────────────────────────────────────────────────────────────────────
 * Requires `Authorization: Bearer <supabase access token>` for a superadmin /
 * org admin / host of the registration's event (resolveCaller +
 * requireResponseAccess): 401 unauthenticated, 403 wrong organization.
 * There is deliberately NO internal-secret bypass here — unlike the cron path
 * into on-registration/generate-ticket, nothing server-side needs to render an
 * image, and every extra caller of this endpoint is another way to leak one.
 *
 * The signed URL lives 120 seconds (the minimum that lets a host click through
 * a dashboard link and still scan it in time).
 *
 * Rate limit: 60 / 10 min / caller. Signing is cheap; this is here to stop a
 * single compromised host session from minting links for the whole attendee
 * list.
 *
 * All shared helpers are DYNAMICALLY imported inside the handler — static
 * top-level imports crash the Vercel function bundler (see generate-ticket.ts).
 */

export const config = { runtime: 'nodejs' }

/** Signed URL lifetime. Short on purpose. */
const SIGNED_URL_TTL_SECONDS = 120

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * `event_responses.ticket_url` holds EITHER a storage path (new rows) or a
 * full public URL (rows written before the private-bucket migration):
 *   tickets/<event_id>/<registration_id>.png
 *   https://<ref>.supabase.co/storage/v1/object/public/tickets/<event_id>/<reg>.png
 *
 * Returns the path INSIDE the `tickets` bucket — i.e. with the `tickets/`
 * prefix removed, because `sb.storage.from('tickets').createSignedUrl(path)`
 * prepends the bucket id itself and would otherwise sign
 * `tickets/tickets/...`. Anything that is not inside the tickets bucket (a
 * traversal attempt, another bucket, a random URL) resolves to null and the
 * caller gets `{ url: null }`.
 */
export function storagePathFromTicketUrl(stored: unknown): string | null {
  const v = String(stored ?? '').trim()
  if (!v) return null

  let path: string
  if (/^https?:\/\//i.test(v)) {
    const m = v.match(/\/storage\/v1\/object\/(?:public|sign)\/tickets\/([^?#]+)/i)
    if (!m) return null
    path = m[1]
  } else {
    if (!v.startsWith('tickets/')) return null
    path = v.slice('tickets/'.length)
  }

  path = path.replace(/^\/+/, '')
  if (!path || path.includes('..') || path.includes('\\')) return null
  return path
}

export default async function handler(req: any, res: any) {
  const { applyCors, fail, readBody, isUuid } = await import('./_lib/http')
  const { rateLimit, applyLimitHeaders } = await import('./_lib/rateLimit')
  const { resolveCaller, requireResponseAccess, serviceClient } = await import('./_lib/authz')

  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = readBody(req)
    if (body === null) return fail(res, 400, 'Invalid request body')

    const registrationId = String(body?.registration_id || '').trim()
    if (!isUuid(registrationId)) return res.status(400).json({ error: 'registration_id required' })

    const caller = await resolveCaller(req)
    if (!caller) return fail(res, 401, 'Authentication required')

    const rl = await rateLimit(`ticket-image:${caller.id}`, 60, 10 * 60 * 1000)
    if (applyLimitHeaders(res, rl)) {
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
    }

    const sb = await serviceClient()
    if (!sb) return fail(res, 500, 'Server not configured')

    const access = await requireResponseAccess(sb, caller, registrationId)
    if (!access.ok) {
      if (access.status === 404) return fail(res, 404, 'Registration not found')
      return fail(res, access.status, access.error)
    }

    const { data: reg, error: regErr } = await sb
      .from('event_responses')
      .select('ticket_url')
      .eq('id', registrationId)
      .maybeSingle()
    if (regErr) return fail(res, 500, 'Internal error', regErr)
    if (!reg) return res.status(404).json({ error: 'Registration not found' })

    const path = storagePathFromTicketUrl(reg.ticket_url)
    if (!path) return res.status(200).json({ url: null })

    const { data, error } = await sb.storage
      .from('tickets')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

    if (error || !data?.signedUrl) {
      // The row exists but the object is gone (or was never rendered).
      // Not an error for the caller — it just cannot show an image yet.
      console.error('[ticket-image] sign failed:', error?.message || error)
      return res.status(200).json({ url: null })
    }

    return res.status(200).json({ url: data.signedUrl })
  } catch (err: unknown) {
    return fail(res, 500, 'Internal error', err)
  }
}
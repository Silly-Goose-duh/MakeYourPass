/**
 * Shared HTTP helpers for Vercel serverless functions.
 *
 * NOTE: this file intentionally has NO imports beyond node builtins. The
 * generate-ticket comment in that file warns that heavy top-level imports
 * crashed the Vercel function bundler, so every shared helper here is
 * dependency-free and must be dynamically imported inside handlers.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Apply CORS headers, restricted to the app's own origin(s).
 *
 * Previously every endpoint sent `Access-Control-Allow-Origin: *`, which let
 * any website on the internet drive the unauthenticated endpoints (ticket
 * resend, registration) from a victim's browser. We now echo the configured
 * app origin only.
 *
 * `APP_ORIGIN` accepts a comma-separated list, because one Vercel project is
 * reachable through several aliases (e.g. makeyourpass.vercel.app,
 * mec-campuspass.vercel.app, campuspass-<team>.vercel.app). Pinning only one
 * would silently break the rest.
 *
 * When `APP_ORIGIN` is unset we fall back to the incoming request host, which
 * is still far tighter than `*`.
 */
export function applyCors(req: any, res: any): boolean {
  const configured = (process.env.APP_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = rawHost ? String(rawHost).split(',')[0].trim() : ''
  const fromHost = host ? `${proto}://${host}` : ''
  const allowed = configured.length ? configured : fromHost ? [fromHost] : []

  const origin = req.headers.origin ? String(req.headers.origin).replace(/\/+$/, '') : ''
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

/**
 * Respond with a generic error. The real error is logged server-side only.
 *
 * Handlers used to return `err.message` straight to the client, which leaked
 * Supabase internals (schema names, policy names, project ref) to attackers.
 */
export function fail(res: any, status: number, publicMessage: string, err?: unknown): any {
  if (err) {
    console.error(`[api] ${publicMessage} ::`, err instanceof Error ? err.message : err)
  }
  return res.status(status).json({ error: publicMessage })
}

/**
 * Parse a JSON body defensively.
 *
 * Returns the parsed object, or `null` when the body is absent, malformed, or
 * is a JSON scalar rather than an object (`42`, `"hi"`, `null`). Handlers use
 * the null case to answer 400 "Invalid request body" instead of failing later
 * with a confusing "field required" error.
 */
export function readBody(req: any): any {
  const raw = req.body
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw === 'object') return Array.isArray(raw) ? null : raw
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** A UUID shape check, applied to every id that reaches a database query. */
export function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  )
}

/** Escape text for safe interpolation into an HTML email body. */
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Basic email shape check (not RFC-exhaustive, but blocks obvious garbage). */
export function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
}

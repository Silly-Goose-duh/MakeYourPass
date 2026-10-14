/**
 * Server-side rate limiting for Vercel serverless functions.
 *
 * The app previously relied on a *client-side* throttle in PublicEventForm
 * ("1 per 20s in this browser"), which is bypassed by a single curl loop.
 * Every public/abusive endpoint must call `rateLimit()` server-side.
 *
 * Two backends:
 *   - Upstash Redis when UPSTASH_REDIS_REST_URL + TOKEN are set (shared across
 *     all lambda instances — required for real limits).
 *   - In-process Map otherwise (per-instance best-effort; still stops a single
 *     runaway client and costs nothing).
 *
 * Dependency-free on purpose: dynamic-import this inside the handler so the
 * function bundler never statically pulls it in at init.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Bucket = { count: number; resetAt: number }

const store = new Map<string, Bucket>()

// Keep the in-process store from growing without bound on a long-lived instance.
const MAX_KEYS = 10_000
function sweep(now: number) {
  if (store.size <= MAX_KEYS) return
  for (const [k, b] of store) {
    if (b.resetAt <= now) store.delete(k)
  }
  // Hard cap: if still oversized, drop the oldest half.
  if (store.size > MAX_KEYS) {
    const keys = [...store.keys()].slice(0, Math.floor(store.size / 2))
    for (const k of keys) store.delete(k)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets. */
  retryAfter: number
}

async function redisLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const redisKey = `myp:rl:${key}`
    const pipeline = [
      ['INCR', redisKey],
      ['EXPIRE', redisKey, String(windowSec), 'NX'],
      ['TTL', redisKey],
    ]
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pipeline),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const count = Number(data?.[0]?.result ?? 1)
    const ttl = Number(data?.[2]?.result ?? windowSec)
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter: ttl > 0 ? ttl : windowSec,
    }
  } catch (err) {
    // Fail open on Redis errors — never take the site down because of the limiter.
    console.error('[rateLimit] redis error, failing open:', err)
    return null
  }
}

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) }
  }
  existing.count += 1
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/**
 * Consume one unit of quota for `key`.
 * Returns `{ allowed:false }` once the caller exceeds `limit` within `windowMs`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
  const viaRedis = await redisLimit(key, limit, windowSec)
  if (viaRedis) return viaRedis
  return memoryLimit(key, limit, windowMs)
}

/** Apply rate-limit headers + a 429 response. Returns true if it blocked. */
export function applyLimitHeaders(res: any, result: RateLimitResult) {
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))
  res.setHeader('X-RateLimit-Retry-After', String(result.retryAfter))
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter))
    return true
  }
  return false
}

/**
 * Best-effort client identity for rate limiting.
 * Prefers a verified-ish forwarded IP; falls back to a fixed bucket.
 */
export function clientIp(req: any): string {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  const ip = typeof raw === 'string' ? raw.split(',')[0]?.trim() : ''
  return ip || req.socket?.remoteAddress || 'unknown'
}

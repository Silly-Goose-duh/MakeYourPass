import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rateLimit, applyLimitHeaders, clientIp } from '../api/_lib/rateLimit'

/**
 * These exercise the in-process backend. The Redis backend is skipped unless
 * UPSTASH_REDIS_REST_URL/TOKEN are present, because the previous protection
 * against abusive clients was a *client-side* throttle in PublicEventForm
 * that any curl loop walked straight through.
 */
describe('rateLimit (memory backend)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests up to the limit', async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await rateLimit('test:allow', 3, 60_000)
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(3 - i)
    }
  })

  it('blocks once the limit is exceeded', async () => {
    await rateLimit('test:block', 2, 60_000)
    await rateLimit('test:block', 2, 60_000)
    const third = await rateLimit('test:block', 2, 60_000)
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.retryAfter).toBeGreaterThan(0)
  })

  it('keeps blocking while inside the same window', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('test:sticky', 1, 60_000)
    const later = await rateLimit('test:sticky', 1, 60_000)
    expect(later.allowed).toBe(false)
  })

  it('resets once the window has elapsed', async () => {
    await rateLimit('test:window', 1, 60_000)
    expect((await rateLimit('test:window', 1, 60_000)).allowed).toBe(false)

    vi.advanceTimersByTime(60_001)

    expect((await rateLimit('test:window', 1, 60_000)).allowed).toBe(true)
  })

  it('tracks keys independently', async () => {
    await rateLimit('test:a', 1, 60_000)
    await rateLimit('test:a', 1, 60_000)
    expect((await rateLimit('test:a', 1, 60_000)).allowed).toBe(false)
    expect((await rateLimit('test:b', 1, 60_000)).allowed).toBe(true)
  })

  it('fails open when Redis is configured but unreachable', async () => {
    // Availability must win over throttling: an outage in the limiter should
    // never take the whole ticketing site down.
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const r = await rateLimit('test:failopen', 1, 60_000)
    expect(r.allowed).toBe(true)

    fetchSpy.mockRestore()
  })
})

describe('applyLimitHeaders', () => {
  function fakeRes() {
    const headers: Record<string, string> = {}
    return { headers, setHeader: (k: string, v: string) => { headers[k] = v } }
  }

  it('reports blocking and sets Retry-After when over limit', () => {
    const res = fakeRes()
    const blocked = applyLimitHeaders(res, { allowed: false, remaining: 0, retryAfter: 42 })
    expect(blocked).toBe(true)
    expect(res.headers['Retry-After']).toBe('42')
    expect(res.headers['X-RateLimit-Remaining']).toBe('0')
  })

  it('does not block when under limit', () => {
    const res = fakeRes()
    const blocked = applyLimitHeaders(res, { allowed: true, remaining: 9, retryAfter: 42 })
    expect(blocked).toBe(false)
    expect(res.headers['Retry-After']).toBeUndefined()
  })
})

describe('clientIp', () => {
  it('takes the first entry of x-forwarded-for', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4')
  })

  it('falls back to the socket address', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } })).toBe('9.9.9.9')
  })

  it('never returns an empty string', () => {
    expect(clientIp({ headers: {} })).toBe('unknown')
  })
})

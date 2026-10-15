import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyCors } from '../api/_lib/http'

/**
 * Every endpoint used to reply with `Access-Control-Allow-Origin: *`, which
 * let any website on the internet call the unauthenticated ones (ticket
 * resend, registration) from a visitor's browser. These pin the replacement:
 * an allow-list, with support for the several aliases one Vercel project has.
 */
function fakeRes() {
  const headers: Record<string, string> = {}
  let ended = false
  let statusCode = 0
  return {
    headers,
    // Exposed under a different name so it cannot collide with the
    // `status(n)` chainable method below.
    get statusCode() { return statusCode },
    get ended() { return ended },
    setHeader: (k: string, v: string) => { headers[k] = v },
    status(s: number) { statusCode = s; return this },
    end() { ended = true; return this },
    json() { return this },
  }
}

describe('applyCors', () => {
  const savedOrigin = process.env.APP_ORIGIN

  beforeEach(() => {
    delete process.env.APP_ORIGIN
  })

  afterEach(() => {
    if (savedOrigin === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = savedOrigin
  })

  it('never emits a wildcard origin', () => {
    process.env.APP_ORIGIN = 'https://makeyourpass.vercel.app'
    const res = fakeRes()
    applyCors({ headers: { origin: 'https://evil.example.com' }, method: 'POST' }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('echoes the allowed origin back', () => {
    process.env.APP_ORIGIN = 'https://makeyourpass.vercel.app'
    const res = fakeRes()
    applyCors({ headers: { origin: 'https://makeyourpass.vercel.app' }, method: 'POST' }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://makeyourpass.vercel.app')
    expect(res.headers['Vary']).toBe('Origin')
  })

  it('accepts a comma-separated list, because the project has several aliases', () => {
    process.env.APP_ORIGIN =
      'https://makeyourpass.vercel.app,https://mec-campuspass.vercel.app,https://campuspass-silly-gooses-projects.vercel.app'

    for (const origin of [
      'https://makeyourpass.vercel.app',
      'https://mec-campuspass.vercel.app',
      'https://campuspass-silly-gooses-projects.vercel.app',
    ]) {
      const res = fakeRes()
      applyCors({ headers: { origin }, method: 'POST' }, res)
      expect(res.headers['Access-Control-Allow-Origin']).toBe(origin)
    }
  })

  it('tolerates whitespace and trailing slashes in the configured list', () => {
    process.env.APP_ORIGIN = ' https://a.example.com , https://b.example.com/ '
    const res = fakeRes()
    applyCors({ headers: { origin: 'https://b.example.com' }, method: 'POST' }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://b.example.com')
  })

  it('tolerates a trailing slash on the incoming Origin', () => {
    process.env.APP_ORIGIN = 'https://makeyourpass.vercel.app'
    const res = fakeRes()
    applyCors({ headers: { origin: 'https://makeyourpass.vercel.app/' }, method: 'POST' }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://makeyourpass.vercel.app')
  })

  it('falls back to the request host when APP_ORIGIN is unset', () => {
    const res = fakeRes()
    applyCors(
      {
        headers: {
          origin: 'https://makeyourpass.vercel.app',
          'x-forwarded-host': 'makeyourpass.vercel.app',
          'x-forwarded-proto': 'https',
        },
        method: 'POST',
      },
      res
    )
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://makeyourpass.vercel.app')
  })

  it('still rejects a foreign host even in host-fallback mode', () => {
    const res = fakeRes()
    applyCors(
      {
        headers: {
          origin: 'https://evil.example.com',
          'x-forwarded-host': 'makeyourpass.vercel.app',
          'x-forwarded-proto': 'https',
        },
        method: 'POST',
      },
      res
    )
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('sets no origin header for a same-origin request with no Origin header', () => {
    process.env.APP_ORIGIN = 'https://makeyourpass.vercel.app'
    const res = fakeRes()
    applyCors({ headers: {}, method: 'GET' }, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('short-circuits OPTIONS preflight with 204', () => {
    process.env.APP_ORIGIN = 'https://makeyourpass.vercel.app'
    const res = fakeRes()
    const handled = applyCors(
      { headers: { origin: 'https://makeyourpass.vercel.app' }, method: 'OPTIONS' },
      res
    )
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(204)
    expect(res.ended).toBe(true)
  })

  it('returns false for non-OPTIONS so the handler continues', () => {
    process.env.APP_ORIGIN = 'https://makeyourpass.vercel.app'
    const res = fakeRes()
    expect(applyCors({ headers: {}, method: 'POST' }, res)).toBe(false)
  })

  it('always sets nosniff', () => {
    const res = fakeRes()
    applyCors({ headers: {}, method: 'POST' }, res)
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
  })
})

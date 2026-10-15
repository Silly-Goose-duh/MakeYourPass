import { describe, it, expect, vi } from 'vitest'
import { fail } from '../api/_lib/http'

function fakeRes() {
  const headers: Record<string, string> = {}
  let statusCode = 0
  let payload: unknown = null
  return {
    headers,
    get statusCode() { return statusCode },
    get payload() { return payload },
    setHeader: (k: string, v: string) => { headers[k] = v },
    status(s: number) { statusCode = s; return this },
    json(b: unknown) { payload = b; return this },
    end() { return this },
  }
}

describe('fail', () => {
  it('never returns the internal error to the client', () => {
    const res = fakeRes()
    const err = new Error('column "profiles.secret" does not exist')
    fail(res, 500, 'Internal error', err)
    expect(res.statusCode).toBe(500)
    // The schema detail must not reach the caller.
    expect(JSON.stringify(res.payload)).not.toContain('secret')
    expect(res.payload).toEqual({ error: 'Internal error' })
  })

  it('maps an unreachable database to 503 with a useful message', () => {
    const res = fakeRes()
    const err = new Error(
      "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND isvylfovcwtlemjpkdqp.supabase.co"
    )
    fail(res, 500, 'Internal error', err)
    expect(res.statusCode).toBe(503)
    expect(res.payload.error).toMatch(/database is unreachable/i)
  })

  it('detects the error shape Supabase actually throws (object, not Error)', () => {
    const res = fakeRes()
    const err = {
      message: 'TypeError: fetch failed',
      details: 'getaddrinfo ENOTFOUND abc.supabase.co (ENOTFOUND)',
    }
    fail(res, 500, 'Internal error', err as unknown)
    expect(res.statusCode).toBe(503)
  })

  it('detects a nested cause', () => {
    const res = fakeRes()
    const err = { message: 'fetch failed', cause: new Error('ECONNREFUSED 10.0.0.1:5432') }
    fail(res, 500, 'Internal error', err as unknown)
    expect(res.statusCode).toBe(503)
  })

  it('does not rewrite client errors', () => {
    const res = fakeRes()
    fail(res, 400, 'Invalid request body', new Error('ENOTFOUND in the user input'))
    expect(res.statusCode).toBe(400)
    expect(res.payload).toEqual({ error: 'Invalid request body' })
  })

  it('works with no error argument', () => {
    const res = fakeRes()
    fail(res, 404, 'Registration not found')
    expect(res.statusCode).toBe(404)
    expect(res.payload).toEqual({ error: 'Registration not found' })
  })

  it('logs the detail server-side without leaking it in the response', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = fakeRes()
    fail(res, 500, 'Internal error', new Error('ENOTFOUND db.internal.example'))
    expect(spy).toHaveBeenCalled()
    expect(JSON.stringify(res.payload)).not.toContain('db.internal.example')
    spy.mockRestore()
  })
})

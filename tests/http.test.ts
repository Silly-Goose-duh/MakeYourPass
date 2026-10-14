import { describe, it, expect } from 'vitest'
import { escapeHtml, isEmail, isUuid, readBody } from '../api/_lib/http'

describe('escapeHtml', () => {
  it('escapes every character that can break out of an HTML email body', () => {
    // This is the exact vector behind the host-blast HTML injection flaw:
    // an org admin put raw markup into email sent from our own domain.
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    )
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    )
  })

  it('escapes ampersands before the other entities', () => {
    // Order matters: escaping & last would double-encode and mangle the text.
    expect(escapeHtml('Tom &amp; Jerry & <b>')).toBe(
      'Tom &amp;amp; Jerry &amp; &lt;b&gt;'
    )
  })

  it('escapes quotes so the value is safe inside an attribute', () => {
    expect(escapeHtml(`" onmouseover="alert(1)`)).toBe(
      '&quot; onmouseover=&quot;alert(1)'
    )
    expect(escapeHtml(`' onfocus='x`)).toBe('&#39; onfocus=&#39;x')
  })

  it('coerces non-string input without throwing', () => {
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('isUuid', () => {
  it('accepts a v4 uuid', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true)
  })

  it('rejects anything that is not a uuid', () => {
    // Registration ids reach database queries directly, so a loose check here
    // is what lets garbage flow into PostgREST.
    expect(isUuid('')).toBe(false)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301; DROP TABLE events')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(123 as unknown)).toBe(false)
    expect(isUuid("' OR '1'='1")).toBe(false)
  })

  it('rejects uuid-shaped strings with an invalid variant nibble', () => {
    // The regex pins version 1-5 and variant 8/9/a/b.
    expect(isUuid('3f2504e0-4f89-11d3-0a0c-0305e82c3301')).toBe(false)
  })
})

describe('isEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmail('student@college.edu')).toBe(true)
    expect(isEmail('  spaced@college.edu  ')).toBe(true)
  })

  it('rejects malformed addresses', () => {
    expect(isEmail('nope')).toBe(false)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('a b@c.com')).toBe(false)
    expect(isEmail('@college.edu')).toBe(false)
    expect(isEmail(null)).toBe(false)
  })
})

describe('readBody', () => {
  it('parses a JSON string body', () => {
    expect(readBody({ body: '{"a":1}' })).toEqual({ a: 1 })
  })

  it('passes an already-parsed object through', () => {
    expect(readBody({ body: { a: 1 } })).toEqual({ a: 1 })
  })

  it('returns an empty object for an absent body', () => {
    expect(readBody({ body: undefined })).toEqual({})
    expect(readBody({ body: null })).toEqual({})
    expect(readBody({ body: '' })).toEqual({})
  })

  it('returns null for malformed JSON so the caller can 400', () => {
    expect(readBody({ body: '{not json' })).toBeNull()
  })

  it('returns null for a JSON scalar body', () => {
    expect(readBody({ body: '"hello"' })).toBeNull()
    expect(readBody({ body: '42' })).toBeNull()
    expect(readBody({ body: 'null' })).toBeNull()
    expect(readBody({ body: 'true' })).toBeNull()
  })

  it('returns null for a JSON array body', () => {
    expect(readBody({ body: '[1,2,3]' })).toBeNull()
  })
})

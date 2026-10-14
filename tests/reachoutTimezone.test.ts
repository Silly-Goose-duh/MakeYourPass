import { describe, it, expect } from 'vitest'
import {
  dateInTz,
  tomorrowInTz,
  DEFAULT_EVENT_TIMEZONE,
} from '../api/reachout'

/**
 * The T-24h reminder cron used to compute "tomorrow" with
 *
 *   new Date(Date.UTC(y, m, d + 1)).toISOString().slice(0, 10)
 *
 * which is the UTC calendar day. The cron fires at 02:30 UTC, which is 08:00
 * IST — so for an Indian campus the job selected the wrong calendar day and
 * "see you tomorrow" emails landed on the wrong date.
 */
describe('dateInTz', () => {
  it('returns the calendar date in the requested zone', () => {
    // 2026-08-03T18:30:00Z is 2026-08-04 00:00 in Kolkata (+05:30).
    expect(dateInTz('Asia/Kolkata', new Date('2026-08-03T18:30:00Z'))).toBe('2026-08-04')
    // ...and still 2026-08-03 in UTC.
    expect(dateInTz('UTC', new Date('2026-08-03T18:30:00Z'))).toBe('2026-08-03')
  })

  it('handles zones behind UTC', () => {
    // 2026-08-04T02:00:00Z is 2026-08-03 22:00 in New York (-04:00).
    expect(dateInTz('America/New_York', new Date('2026-08-04T02:00:00Z'))).toBe('2026-08-03')
  })

  it('always returns a zero-padded YYYY-MM-DD', () => {
    const out = dateInTz('Asia/Kolkata', new Date('2026-01-05T04:00:00Z'))
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(out).toBe('2026-01-05')
  })

  it('falls back to UTC for an invalid zone instead of throwing', () => {
    // A typo in the EVENT_TIMEZONE env var must not take the cron down.
    expect(() => dateInTz('Not/AZone', new Date('2026-08-03T12:00:00Z'))).not.toThrow()
    expect(dateInTz('Not/AZone', new Date('2026-08-03T12:00:00Z'))).toBe('2026-08-03')
  })

  it('defaults to Asia/Kolkata for this product', () => {
    expect(DEFAULT_EVENT_TIMEZONE).toBe('Asia/Kolkata')
  })
})

describe('tomorrowInTz', () => {
  it('advances one calendar day in the local zone', () => {
    expect(tomorrowInTz('Asia/Kolkata', new Date('2026-08-03T10:00:00Z'))).toBe('2026-08-04')
  })

  it('differs from the naive UTC calculation across the day boundary', () => {
    // 18:30Z on 3 Aug is already 4 Aug in Kolkata. The old UTC code would have
    // selected 2026-08-04 as "today" and emailed about 2026-08-05, i.e. two
    // days out from the organiser's point of view.
    const now = new Date('2026-08-03T18:30:00Z')
    const naiveUtcTomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    )
      .toISOString()
      .slice(0, 10)

    expect(naiveUtcTomorrow).toBe('2026-08-04')
    expect(tomorrowInTz('Asia/Kolkata', now)).toBe('2026-08-05')
  })

  it('rolls over month boundaries', () => {
    expect(tomorrowInTz('UTC', new Date('2026-08-31T12:00:00Z'))).toBe('2026-09-01')
    expect(tomorrowInTz('UTC', new Date('2026-02-28T12:00:00Z'))).toBe('2026-03-01')
  })

  it('rolls over year boundaries', () => {
    expect(tomorrowInTz('UTC', new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(tomorrowInTz('UTC', new Date('2028-02-28T12:00:00Z'))).toBe('2028-02-29')
    expect(tomorrowInTz('UTC', new Date('2028-02-29T12:00:00Z'))).toBe('2028-03-01')
  })

  it('is unaffected by DST transitions in the local zone', () => {
    // US DST starts 2026-03-08. Plain "+24h in milliseconds" arithmetic would
    // drift here; calendar arithmetic on the local date parts must not.
    expect(tomorrowInTz('America/New_York', new Date('2026-03-07T20:00:00Z'))).toBe('2026-03-08')
    expect(tomorrowInTz('America/New_York', new Date('2026-03-08T20:00:00Z'))).toBe('2026-03-09')
    // DST ends 2026-11-01.
    expect(tomorrowInTz('America/New_York', new Date('2026-10-31T20:00:00Z'))).toBe('2026-11-01')
  })

  it('degrades to a 24h shift when the zone is unusable', () => {
    // Still returns a well-formed date rather than throwing inside the cron.
    const out = tomorrowInTz('Not/AZone', new Date('2026-08-03T12:00:00Z'))
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

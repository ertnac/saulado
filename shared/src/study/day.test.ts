import { describe, expect, it } from 'vitest'
import {
  addDaysToKey,
  dateToDayKey,
  dayKeyInZone,
  dayKeyToDate,
  daysBetweenKeys,
  isSameDayInZone,
  isValidTimeZone,
  startOfDayInZone,
} from './day.js'

/**
 * Day boundaries are the quiet correctness risk in the whole scheduler: every
 * assertion here is a case where using the server's clock instead of the user's
 * timezone produces a plausible, wrong answer — a streak that breaks at 7pm, a
 * card that comes due a day early, a "reviews today" count that resets at the
 * wrong hour.
 */

const AUCKLAND = 'Pacific/Auckland'
const NEW_YORK = 'America/New_York'
const KATHMANDU = 'Asia/Kathmandu' // UTC+5:45 — a non-whole-hour offset
const SANTIAGO = 'America/Santiago' // DST starts at midnight; 00:00 does not exist

describe('dayKeyInZone', () => {
  it('reads the calendar day the user is actually living in', () => {
    // 2026-08-08T11:00Z is already the 8th in UTC, but the 8th *evening* in
    // Auckland and still the 8th morning in New York.
    const at = new Date('2026-08-08T11:00:00.000Z')

    expect(dayKeyInZone(at, 'UTC')).toBe('2026-08-08')
    expect(dayKeyInZone(at, AUCKLAND)).toBe('2026-08-08')
    expect(dayKeyInZone(at, NEW_YORK)).toBe('2026-08-08')
  })

  it('disagrees with UTC when the user is on the other side of midnight', () => {
    // 23:00 UTC is already tomorrow in Auckland and still today in New York.
    // A streak computed in UTC would credit both to the same day.
    const at = new Date('2026-08-08T23:00:00.000Z')

    expect(dayKeyInZone(at, 'UTC')).toBe('2026-08-08')
    expect(dayKeyInZone(at, AUCKLAND)).toBe('2026-08-09')
    expect(dayKeyInZone(at, NEW_YORK)).toBe('2026-08-08')
  })

  it('handles offsets that are not whole hours', () => {
    // Kathmandu is UTC+5:45. Anything that rounds offsets to hours lands here.
    expect(dayKeyInZone(new Date('2026-08-08T18:20:00.000Z'), KATHMANDU)).toBe('2026-08-09')
    expect(dayKeyInZone(new Date('2026-08-08T18:10:00.000Z'), KATHMANDU)).toBe('2026-08-08')
  })
})

describe('startOfDayInZone', () => {
  it('returns the instant local midnight happened', () => {
    const at = new Date('2026-08-08T11:00:00.000Z')

    // New York in August is UTC-4, so midnight local is 04:00Z.
    expect(startOfDayInZone(at, NEW_YORK).toISOString()).toBe('2026-08-08T04:00:00.000Z')
    // Auckland in August is UTC+12, so the 8th began at 12:00Z on the 7th.
    expect(startOfDayInZone(at, AUCKLAND).toISOString()).toBe('2026-08-07T12:00:00.000Z')
  })

  it('is idempotent — the start of a day is on that day', () => {
    for (const zone of ['UTC', AUCKLAND, NEW_YORK, KATHMANDU, SANTIAGO]) {
      const at = new Date('2026-03-15T09:30:00.000Z')
      const start = startOfDayInZone(at, zone)

      expect(dayKeyInZone(start, zone)).toBe(dayKeyInZone(at, zone))
      expect(startOfDayInZone(start, zone).toISOString()).toBe(start.toISOString())
    }
  })

  it('uses the offset in force on that day, not the offset today', () => {
    // 2026-11-01: New York leaves DST at 02:00 local. Midnight is still UTC-4.
    const start = startOfDayInZone(new Date('2026-11-01T18:00:00.000Z'), NEW_YORK)
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z')

    // A week later the zone is UTC-5, so midnight is an hour later in UTC.
    const later = startOfDayInZone(new Date('2026-11-08T18:00:00.000Z'), NEW_YORK)
    expect(later.toISOString()).toBe('2026-11-08T05:00:00.000Z')
  })

  it('survives a day whose midnight never happens', () => {
    // Santiago's DST jump is at 00:00: 2026-09-06 goes 23:59:59 → 01:00:00, so
    // there is no local midnight to return. The first real instant of the day
    // is the only defensible answer.
    const at = new Date('2026-09-06T18:00:00.000Z')
    const start = startOfDayInZone(at, SANTIAGO)

    expect(dayKeyInZone(start, SANTIAGO)).toBe('2026-09-06')
    expect(start.getTime()).toBeLessThanOrEqual(at.getTime())
  })
})

describe('isSameDayInZone', () => {
  it('splits two instants that share a UTC day but not a local one', () => {
    const evening = new Date('2026-08-08T10:00:00.000Z') // 22:00 in Auckland
    const night = new Date('2026-08-08T13:00:00.000Z') // 01:00 next day

    expect(isSameDayInZone(evening, night, 'UTC')).toBe(true)
    expect(isSameDayInZone(evening, night, AUCKLAND)).toBe(false)
  })
})

describe('day keys as calendar arithmetic', () => {
  it('adds days without consulting a clock', () => {
    expect(addDaysToKey('2026-08-08', 1)).toBe('2026-08-09')
    expect(addDaysToKey('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31')
    // 2028 is a leap year; 2026 is not.
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('crosses a DST boundary without gaining or losing a day', () => {
    // The classic bug: adding 24h of milliseconds across a spring-forward lands
    // on 23:00 the previous day. Day keys have no clock to go wrong.
    expect(addDaysToKey('2026-03-07', 1)).toBe('2026-03-08')
    expect(daysBetweenKeys('2026-03-01', '2026-04-01')).toBe(31)
  })

  it('round-trips through the Date shape a SQL DATE column needs', () => {
    const key = '2026-08-08'
    const asDate = dayKeyToDate(key)

    expect(asDate.toISOString()).toBe('2026-08-08T00:00:00.000Z')
    expect(dateToDayKey(asDate)).toBe(key)
  })

  it('counts days between keys, signed', () => {
    expect(daysBetweenKeys('2026-08-08', '2026-08-09')).toBe(1)
    expect(daysBetweenKeys('2026-08-09', '2026-08-08')).toBe(-1)
    expect(daysBetweenKeys('2026-08-08', '2026-08-08')).toBe(0)
    expect(daysBetweenKeys('2026-08-08', '2027-08-08')).toBe(365)
  })
})

describe('isValidTimeZone', () => {
  /**
   * The contract is narrower than it looks: this answers "will `Intl` accept
   * this without throwing", because a `RangeError` from one bad settings row
   * would 500 every study route for that user. It is not a check for "is this a
   * good zone to store".
   */
  it('accepts anything Intl can resolve', () => {
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone(AUCKLAND)).toBe(true)
  })

  it('rejects a name Intl would throw on', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone('Europe')).toBe(false)
  })

  it('accepts a fixed UTC offset, which still yields correct day keys', () => {
    /**
     * ECMA-402 accepts offset zones, so `+05:45` does not throw — and since it
     * cannot be wrong about DST (it has none), the day maths below is right
     * rather than merely tolerated. Accepting it is safe; the fallback in
     * `loadSettings` exists for the names that genuinely throw.
     */
    expect(isValidTimeZone('+05:45')).toBe(true)
    expect(dayKeyInZone(new Date('2026-08-07T23:00:00.000Z'), '+05:45')).toBe('2026-08-08')
  })
})

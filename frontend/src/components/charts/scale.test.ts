import { describe, expect, it } from 'vitest'
import { barHeightPercent, longDate, niceCeiling, shortDate, weekdayIndex } from './scale'

/**
 * Chart arithmetic and date formatting.
 *
 * The date tests are the ones that matter. A day key is a calendar day, not an
 * instant, and formatting one through the browser's local timezone shifts it by
 * a day for half the planet — the same class of bug `shared/src/study/day.ts`
 * exists to prevent on the other side of the wire.
 */

describe('date labels', () => {
  it('reads a day key in UTC rather than the local zone', () => {
    // `new Date('2026-08-08')` is UTC midnight. Formatted through a negative
    // offset it is the 7th — so this assertion is what proves the formatter is
    // reading UTC components back out.
    expect(shortDate('2026-08-08')).toBe('8 Aug')
    expect(longDate('2026-08-08')).toBe('Sat 8 Aug')
  })

  it('handles the first and last day of a year', () => {
    expect(shortDate('2026-01-01')).toBe('1 Jan')
    expect(shortDate('2026-12-31')).toBe('31 Dec')
  })

  it('places a day on its true weekday', () => {
    // 2026-08-08 is a Saturday; 2026-08-09 a Sunday, which is column 0.
    expect(weekdayIndex('2026-08-08')).toBe(6)
    expect(weekdayIndex('2026-08-09')).toBe(0)
  })
})

describe('barHeightPercent', () => {
  it('is zero only for a value of zero', () => {
    expect(barHeightPercent(0, 100)).toBe(0)
  })

  it('gives a sub-pixel value a visible floor', () => {
    // 1 of 200 is 0.5% — under a pixel at any realistic chart height, which
    // would render a day of work as a day of nothing.
    expect(barHeightPercent(1, 200)).toBe(4)
  })

  it('scales proportionally above the floor', () => {
    expect(barHeightPercent(50, 100)).toBe(50)
    expect(barHeightPercent(100, 100)).toBe(100)
  })

  it('does not divide by zero when nothing has happened', () => {
    expect(barHeightPercent(0, 0)).toBe(0)
  })
})

describe('niceCeiling', () => {
  it('never returns zero, so it is always a safe denominator', () => {
    expect(niceCeiling(0)).toBe(1)
    expect(niceCeiling(-5)).toBe(1)
  })

  it('gives small counts a floor of 5', () => {
    // A single review against a ceiling of 1 is a full-height bar, which makes
    // the quietest possible day look identical to the busiest.
    expect(niceCeiling(1)).toBe(5)
    expect(niceCeiling(5)).toBe(5)
  })

  it('rounds up to a 1/2/5 step', () => {
    expect(niceCeiling(7)).toBe(10)
    expect(niceCeiling(12)).toBe(20)
    expect(niceCeiling(31)).toBe(50)
    expect(niceCeiling(64)).toBe(100)
  })

  it('is never below the value it is scaling', () => {
    for (const value of [1, 3, 9, 17, 44, 99, 101, 250, 999]) {
      expect(niceCeiling(value)).toBeGreaterThanOrEqual(value)
    }
  })
})

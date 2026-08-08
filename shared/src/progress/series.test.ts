import { describe, expect, it } from 'vitest'
import type { DayStat } from './types.js'
import {
  accuracyPercent,
  currentStreak,
  dayRange,
  fillDaySeries,
  longestStreak,
  windowStart,
} from './series.js'

/** Terse fixture — most of these tests care only about whether a day is active. */
function day(key: string, reviews = 1, correct = 1): DayStat {
  return { day: key, reviews, correct, goalMet: false }
}

describe('dayRange', () => {
  it('includes both ends', () => {
    expect(dayRange('2026-08-01', '2026-08-04')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ])
  })

  it('returns a single day when the ends match', () => {
    expect(dayRange('2026-08-01', '2026-08-01')).toEqual(['2026-08-01'])
  })

  it('returns nothing when the range is inverted', () => {
    expect(dayRange('2026-08-04', '2026-08-01')).toEqual([])
  })

  it('crosses a month boundary', () => {
    expect(dayRange('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('crosses a leap day', () => {
    expect(dayRange('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })
})

describe('windowStart', () => {
  it('counts inclusively, so a 7-day window starts 6 days back', () => {
    // The off-by-one that would put an eighth bar on a "last 7 days" chart.
    expect(windowStart('2026-08-08', 7)).toBe('2026-08-02')
    expect(dayRange(windowStart('2026-08-08', 7), '2026-08-08')).toHaveLength(7)
  })

  it('treats a zero-length window as one day', () => {
    expect(windowStart('2026-08-08', 0)).toBe('2026-08-08')
  })

  it('spans a year without drifting', () => {
    expect(dayRange(windowStart('2026-08-08', 365), '2026-08-08')).toHaveLength(365)
  })
})

describe('fillDaySeries', () => {
  it('fills untouched days with explicit zeroes', () => {
    const filled = fillDaySeries([day('2026-08-02', 5, 4)], '2026-08-01', '2026-08-03')

    expect(filled).toEqual([
      { day: '2026-08-01', reviews: 0, correct: 0, goalMet: false },
      { day: '2026-08-02', reviews: 5, correct: 4, goalMet: false },
      { day: '2026-08-03', reviews: 0, correct: 0, goalMet: false },
    ])
  })

  it('drops rows outside the window rather than clamping them to the edge', () => {
    // Clamping would fold July's reviews into 08-01 and overstate the first bar.
    const filled = fillDaySeries(
      [day('2026-07-15', 99, 99), day('2026-08-01', 3, 3)],
      '2026-08-01',
      '2026-08-02',
    )

    expect(filled.map((entry) => entry.reviews)).toEqual([3, 0])
  })

  it('preserves goalMet on days that have it', () => {
    const stats: DayStat[] = [{ day: '2026-08-01', reviews: 20, correct: 18, goalMet: true }]
    expect(fillDaySeries(stats, '2026-08-01', '2026-08-01')[0]?.goalMet).toBe(true)
  })
})

describe('accuracyPercent', () => {
  it('rounds to a whole percent', () => {
    expect(accuracyPercent(2, 3)).toBe(67)
  })

  it('is null when there is nothing to be accurate about', () => {
    // Not 0. A rest day is not a day of total failure, and plotting it at 0%
    // draws a cliff the user did not earn.
    expect(accuracyPercent(0, 0)).toBeNull()
  })

  it('is 0 for a day that was genuinely all wrong', () => {
    expect(accuracyPercent(0, 5)).toBe(0)
  })
})

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    const days = [day('2026-08-06'), day('2026-08-07'), day('2026-08-08')]
    expect(currentStreak(days, '2026-08-08')).toBe(3)
  })

  it('survives today being empty, because the day is not over', () => {
    // The core non-punitive rule: at 09:00 a month-long streak is still alive.
    const days = [day('2026-08-06'), day('2026-08-07'), day('2026-08-08', 0, 0)]
    expect(currentStreak(days, '2026-08-08')).toBe(2)
  })

  it('breaks once a whole day has passed without study', () => {
    const days = [day('2026-08-05'), day('2026-08-06'), day('2026-08-07', 0, 0)]
    expect(currentStreak(days, '2026-08-08')).toBe(0)
  })

  it('is 1 on the very first day of studying', () => {
    expect(currentStreak([day('2026-08-08')], '2026-08-08')).toBe(1)
  })

  it('is 0 for a user who has never studied', () => {
    expect(currentStreak([], '2026-08-08')).toBe(0)
  })

  it('ignores activity after today', () => {
    // A client clock ahead of the server must not inflate the streak.
    const days = [day('2026-08-08'), day('2026-08-09')]
    expect(currentStreak(days, '2026-08-08')).toBe(1)
  })
})

describe('longestStreak', () => {
  it('finds the longest run, not the most recent one', () => {
    const days = [
      day('2026-08-01'),
      day('2026-08-02'),
      day('2026-08-03'),
      day('2026-08-04', 0, 0),
      day('2026-08-05'),
    ]

    expect(longestStreak(days)).toBe(3)
  })

  it('is 0 when nothing was ever studied', () => {
    expect(longestStreak([day('2026-08-01', 0, 0)])).toBe(0)
  })

  it('does not join runs that are weeks apart', () => {
    // Guards the sparse-input case: without the adjacency check these two would
    // read as a streak of 2.
    expect(longestStreak([day('2026-08-01'), day('2026-09-01')])).toBe(1)
  })

  it('counts a whole unbroken window', () => {
    const days = dayRange('2026-08-01', '2026-08-10').map((key) => day(key))
    expect(longestStreak(days)).toBe(10)
  })
})

import { describe, expect, it } from 'vitest'
import {
  addDays,
  calculateNextReview,
  compareByDueDate,
  INITIAL_REVIEW_STATE,
  isDue,
  LEECH_THRESHOLD,
  MAX_INTERVAL_DAYS,
} from './sm2.js'
import type { ReviewState } from './sm2.js'

// Fixed clock and RNG. A scheduler tested against the real clock is a scheduler
// whose off-by-one you find in a user's review queue six weeks later.
const NOW = new Date('2026-01-15T10:00:00.000Z')
const noFuzz = { now: NOW, fuzz: false }

const state = (overrides: Partial<ReviewState> = {}): ReviewState => ({
  ...INITIAL_REVIEW_STATE,
  ...overrides,
})

describe('calculateNextReview — the SM-2 ladder', () => {
  it('schedules a first correct answer for 1 day', () => {
    const result = calculateNextReview('good', INITIAL_REVIEW_STATE, noFuzz)

    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
    expect(result.easeFactor).toBe(2.5)
  })

  it('schedules a second correct answer for 6 days', () => {
    const result = calculateNextReview('good', state({ interval: 1, repetitions: 1 }), noFuzz)

    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
  })

  it('multiplies by the ease factor from the third repetition on', () => {
    const result = calculateNextReview(
      'good',
      state({ interval: 6, repetitions: 2, easeFactor: 2.5 }),
      noFuzz,
    )

    expect(result.interval).toBe(15) // 6 * 2.5
  })
})

describe('calculateNextReview — lapses', () => {
  it('resets the interval to 1 day on a failure', () => {
    const result = calculateNextReview(
      'again',
      state({ interval: 90, repetitions: 6, easeFactor: 2.5 }),
      noFuzz,
    )

    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it('drops the ease factor by 0.2 on a failure', () => {
    const result = calculateNextReview('again', state({ easeFactor: 2.5 }), noFuzz)
    expect(result.easeFactor).toBeCloseTo(2.3)
  })

  it('increments the lapse counter', () => {
    const result = calculateNextReview('again', state({ lapses: 3 }), noFuzz)
    expect(result.lapses).toBe(4)
  })

  it('preserves the lapse counter on a success', () => {
    const result = calculateNextReview('good', state({ lapses: 3 }), noFuzz)
    expect(result.lapses).toBe(3)
  })

  it('flags a card as a leech at the threshold', () => {
    const result = calculateNextReview('again', state({ lapses: LEECH_THRESHOLD - 1 }), noFuzz)

    expect(result.lapses).toBe(LEECH_THRESHOLD)
    expect(result.isLeech).toBe(true)
  })

  it('does not flag a card below the threshold', () => {
    const result = calculateNextReview('again', state({ lapses: 0 }), noFuzz)
    expect(result.isLeech).toBe(false)
  })
})

describe('calculateNextReview — ease factor bounds', () => {
  it('never drops below 1.3 no matter how many failures', () => {
    let current = state({ easeFactor: 1.35 })

    for (let i = 0; i < 10; i += 1) {
      current = calculateNextReview('again', current, noFuzz)
    }

    expect(current.easeFactor).toBe(1.3)
  })

  it('never rises above 2.5 no matter how many easy grades', () => {
    let current = state({ easeFactor: 2.5 })

    for (let i = 0; i < 5; i += 1) {
      current = calculateNextReview('easy', current, noFuzz)
    }

    expect(current.easeFactor).toBe(2.5)
  })
})

describe('calculateNextReview — grades', () => {
  it('advances hard more slowly than good', () => {
    const previous = state({ interval: 30, repetitions: 5, easeFactor: 2.5 })
    const hard = calculateNextReview('hard', previous, noFuzz)
    const good = calculateNextReview('good', previous, noFuzz)

    expect(hard.interval).toBeLessThan(good.interval)
    expect(hard.interval).toBe(36) // 30 * 1.2
  })

  it('advances easy faster than good', () => {
    const previous = state({ interval: 30, repetitions: 5, easeFactor: 2.5 })
    const easy = calculateNextReview('easy', previous, noFuzz)
    const good = calculateNextReview('good', previous, noFuzz)

    expect(easy.interval).toBeGreaterThan(good.interval)
  })

  it('penalizes ease for hard but not for good', () => {
    expect(calculateNextReview('hard', state(), noFuzz).easeFactor).toBeCloseTo(2.35)
    expect(calculateNextReview('good', state(), noFuzz).easeFactor).toBe(2.5)
  })
})

describe('calculateNextReview — interval cap', () => {
  it('caps intervals at 365 days', () => {
    const result = calculateNextReview(
      'good',
      state({ interval: 300, repetitions: 10, easeFactor: 2.5 }),
      noFuzz,
    )

    expect(result.interval).toBe(MAX_INTERVAL_DAYS)
  })

  it('stays capped across repeated reviews', () => {
    let current = state({ interval: 365, repetitions: 12, easeFactor: 2.5 })

    for (let i = 0; i < 5; i += 1) {
      current = calculateNextReview('easy', current, noFuzz)
      expect(current.interval).toBeLessThanOrEqual(MAX_INTERVAL_DAYS)
    }
  })
})

describe('calculateNextReview — interval fuzz', () => {
  it('keeps fuzzed intervals within ±5%', () => {
    const previous = state({ interval: 100, repetitions: 5, easeFactor: 2.5 })

    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const result = calculateNextReview('good', previous, { now: NOW, random: () => roll })
      // Unfuzzed would be 250.
      expect(result.interval).toBeGreaterThanOrEqual(237)
      expect(result.interval).toBeLessThanOrEqual(263)
    }
  })

  it('scatters a batch of identical cards so they do not stay in lockstep', () => {
    const previous = state({ interval: 100, repetitions: 5, easeFactor: 2.5 })
    const intervals = new Set(
      [0, 0.2, 0.4, 0.6, 0.8, 1].map(
        (roll) => calculateNextReview('good', previous, { now: NOW, random: () => roll }).interval,
      ),
    )

    // The whole point of fuzz: one due date becomes several.
    expect(intervals.size).toBeGreaterThan(1)
  })

  it('leaves short intervals alone', () => {
    const first = calculateNextReview('good', INITIAL_REVIEW_STATE, { now: NOW, random: () => 0 })
    expect(first.interval).toBe(1)
  })

  it('never produces an interval below 1 day', () => {
    for (const roll of [0, 0.5, 1]) {
      const result = calculateNextReview('good', state({ interval: 1, repetitions: 3 }), {
        now: NOW,
        random: () => roll,
      })
      expect(result.interval).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('calculateNextReview — due dates', () => {
  it('derives the due date from the interval', () => {
    const result = calculateNextReview('good', state({ interval: 6, repetitions: 2 }), noFuzz)
    expect(result.dueDate).toEqual(addDays(NOW, result.interval))
  })

  it('schedules a lapsed card for tomorrow', () => {
    const result = calculateNextReview('again', state({ interval: 90, repetitions: 5 }), noFuzz)
    expect(result.dueDate).toEqual(addDays(NOW, 1))
  })
})

describe('addDays', () => {
  it('adds whole days', () => {
    expect(addDays(NOW, 1).toISOString()).toBe('2026-01-16T10:00:00.000Z')
    expect(addDays(NOW, 30).toISOString()).toBe('2026-02-14T10:00:00.000Z')
  })

  it('does not mutate its input', () => {
    const original = new Date(NOW.getTime())
    addDays(original, 10)
    expect(original).toEqual(NOW)
  })

  it('crosses year boundaries', () => {
    expect(addDays(new Date('2026-12-31T12:00:00.000Z'), 1).getUTCFullYear()).toBe(2027)
  })
})

describe('isDue', () => {
  it('is true for a past due date', () => {
    expect(isDue(addDays(NOW, -1), NOW)).toBe(true)
  })

  it('is true at exactly the due moment', () => {
    expect(isDue(NOW, NOW)).toBe(true)
  })

  it('is false for a future due date', () => {
    expect(isDue(addDays(NOW, 1), NOW)).toBe(false)
  })
})

describe('compareByDueDate', () => {
  it('sorts the most overdue card first', () => {
    const queue = [
      { dueDate: addDays(NOW, 5) },
      { dueDate: addDays(NOW, -10) },
      { dueDate: addDays(NOW, -1) },
    ]

    const sorted = [...queue].sort(compareByDueDate)
    expect(sorted[0]?.dueDate).toEqual(addDays(NOW, -10))
    expect(sorted[2]?.dueDate).toEqual(addDays(NOW, 5))
  })
})

describe('a realistic review history', () => {
  it('grows intervals on success and collapses them on a lapse', () => {
    let current: ReviewState = INITIAL_REVIEW_STATE

    current = calculateNextReview('good', current, noFuzz)
    expect(current.interval).toBe(1)

    current = calculateNextReview('good', current, noFuzz)
    expect(current.interval).toBe(6)

    current = calculateNextReview('good', current, noFuzz)
    expect(current.interval).toBe(15)

    // A failure sends it back to the start, with a permanently lower ease.
    current = calculateNextReview('again', current, noFuzz)
    expect(current.interval).toBe(1)
    expect(current.repetitions).toBe(0)
    expect(current.lapses).toBe(1)
    expect(current.easeFactor).toBeCloseTo(2.3)

    // Recovery climbs the ladder again, but more slowly than the first time.
    current = calculateNextReview('good', current, noFuzz)
    current = calculateNextReview('good', current, noFuzz)
    current = calculateNextReview('good', current, noFuzz)
    expect(current.interval).toBe(14) // 6 * 2.3, versus 15 before the lapse
  })
})

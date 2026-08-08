import { describe, expect, it } from 'vitest'
import {
  INITIAL_REVIEW_STATE,
  LEECH_THRESHOLD,
  MAX_INTERVAL_DAYS,
  addDays,
  calculateNextReview,
  dayKeyInZone,
  type Grade,
  type ReviewState,
} from '@saulado/shared'

/**
 * A 90-day simulation of the scheduler (plan §4.3).
 *
 * The unit tests in `shared/src/scheduler/sm2.test.ts` check one review at a
 * time. The failures that matter in a spaced repetition system are not one
 * review being wrong — they are *drift*: intervals that creep toward zero so the
 * app degrades into a daily grind, or toward infinity so a card the user is
 * quietly forgetting never comes back. Neither shows up in a single-step
 * assertion. Both show up over three months.
 *
 * Deterministic throughout: `random` is injected, so a failure here is a real
 * regression rather than an unlucky seed.
 */

const START = new Date('2026-08-08T09:00:00.000Z')

/** A fixed sequence standing in for `Math.random`, so fuzz is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    // xorshift — not good randomness, but stable across platforms and versions,
    // which is what a regression test needs.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return Math.abs(state % 10000) / 10000
  }
}

interface SimResult {
  reviews: number
  finalState: ReviewState
  intervals: number[]
  reviewDays: string[]
}

/**
 * Runs one card through `days` of simulated study.
 *
 * The card is reviewed only when due, exactly as the real queue would serve it,
 * so the intervals compound the way they do in production rather than being
 * applied back-to-back.
 */
function simulate(days: number, gradeFor: (reviewIndex: number) => Grade, seed = 12345): SimResult {
  const random = seededRandom(seed)
  let state: ReviewState = INITIAL_REVIEW_STATE
  let due = START
  let reviews = 0
  const intervals: number[] = []
  const reviewDays: string[] = []

  for (let day = 0; day < days; day++) {
    const today = addDays(START, day)
    if (today.getTime() < due.getTime()) continue

    const outcome = calculateNextReview(gradeFor(reviews), state, { now: today, random })

    reviews += 1
    intervals.push(outcome.interval)
    reviewDays.push(dayKeyInZone(today, 'UTC'))
    state = {
      easeFactor: outcome.easeFactor,
      interval: outcome.interval,
      repetitions: outcome.repetitions,
      lapses: outcome.lapses,
    }
    due = outcome.dueDate
  }

  return { reviews, finalState: state, intervals, reviewDays }
}

describe('90-day simulation — a card answered correctly every time', () => {
  const result = simulate(90, () => 'good')

  it('is reviewed a handful of times, not daily', () => {
    /**
     * The headline property. A card known perfectly should cost the user almost
     * nothing after the first fortnight — 1, 6, ~15, ~37, ~92 days. If this
     * number ever climbs toward 90 the intervals have stopped compounding and
     * the app has become a daily grind.
     */
    expect(result.reviews).toBeLessThanOrEqual(6)
    expect(result.reviews).toBeGreaterThanOrEqual(4)
  })

  it('grows the interval monotonically', () => {
    for (let i = 1; i < result.intervals.length; i++) {
      expect(result.intervals[i]).toBeGreaterThan(result.intervals[i - 1] ?? 0)
    }
  })

  it('follows the SM-2 ladder on the first two steps', () => {
    expect(result.intervals[0]).toBe(1)
    expect(result.intervals[1]).toBe(6)
  })

  it('holds the ease factor at 2.5 — a clean pass neither rewards nor punishes', () => {
    expect(result.finalState.easeFactor).toBe(2.5)
  })

  it('records no lapses', () => {
    expect(result.finalState.lapses).toBe(0)
  })

  it('never schedules two reviews on the same day', () => {
    expect(new Set(result.reviewDays).size).toBe(result.reviewDays.length)
  })
})

describe('90-day simulation — a card always answered wrong', () => {
  const result = simulate(90, () => 'again')

  it('comes back every single day', () => {
    // A card the user never gets right must not drift away from them. 90 days,
    // 90 reviews — an `again` always resets to tomorrow.
    expect(result.reviews).toBe(90)
    expect(result.intervals.every((interval) => interval === 1)).toBe(true)
  })

  it('bottoms the ease factor out at 1.3 rather than below it', () => {
    // Unclamped, -0.2 per failure would drive this negative and start producing
    // intervals in the past.
    expect(result.finalState.easeFactor).toBe(1.3)
  })

  it('flags the card as a leech well before 90 days', () => {
    expect(result.finalState.lapses).toBeGreaterThanOrEqual(LEECH_THRESHOLD)
  })
})

describe('90-day simulation — a card the user keeps forgetting', () => {
  // Right, right, wrong, repeating: the classic "almost learned" card.
  const result = simulate(90, (index) => (index % 3 === 2 ? 'again' : 'good'))

  it('keeps the card in circulation instead of pushing it away', () => {
    expect(result.reviews).toBeGreaterThan(20)
  })

  it('drives the ease factor down as the failures accumulate', () => {
    // The point of the ease factor: a hard card should be shown more often than
    // an easy one even when both are technically "passing".
    expect(result.finalState.easeFactor).toBeLessThan(2.5)
    expect(result.finalState.easeFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('never lets an interval exceed the cap', () => {
    expect(Math.max(...result.intervals)).toBeLessThanOrEqual(MAX_INTERVAL_DAYS)
  })
})

describe('interval fuzz breaks up a batch', () => {
  it('scatters cards imported together across different days', () => {
    /**
     * Why fuzz exists (plan §2.6). Without it, 200 cards imported on one day
     * come back as a 200-card day forever — the whole batch marches in lockstep
     * through identical intervals. This asserts the batch has split apart, which
     * is the property, rather than asserting a specific interval, which would
     * just be pinning the RNG.
     */
    const state: ReviewState = { easeFactor: 2.5, interval: 30, repetitions: 4, lapses: 0 }

    const intervals = new Set(
      Array.from(
        { length: 40 },
        (_, seed) =>
          calculateNextReview('good', state, { now: START, random: seededRandom(seed + 1) })
            .interval,
      ),
    )

    expect(intervals.size).toBeGreaterThan(1)
  })

  it('keeps the scatter within ±5%', () => {
    // Fuzz must not be so wide it overrides the algorithm's judgement.
    const state: ReviewState = { easeFactor: 2.0, interval: 100, repetitions: 5, lapses: 0 }

    for (let seed = 1; seed <= 40; seed++) {
      const { interval } = calculateNextReview('good', state, {
        now: START,
        random: seededRandom(seed),
      })

      expect(interval).toBeGreaterThanOrEqual(190)
      expect(interval).toBeLessThanOrEqual(210)
    }
  })

  it('leaves short intervals alone', () => {
    // Shifting a 1-day interval is user-visible for no benefit.
    const state: ReviewState = { easeFactor: 2.5, interval: 1, repetitions: 1, lapses: 0 }

    for (let seed = 1; seed <= 10; seed++) {
      const { interval } = calculateNextReview('good', state, {
        now: START,
        random: seededRandom(seed),
      })

      expect(interval).toBe(6)
    }
  })
})

describe('the 365-day cap holds under compounding', () => {
  it('never exceeds the cap however long the card is known', () => {
    /**
     * Beyond a year SM-2's confidence is not earned — it is extrapolation from
     * data the algorithm does not have. Uncapped, a card answered `easy`
     * repeatedly reaches intervals measured in decades, which is indistinguishable
     * from deleting it.
     */
    const result = simulate(3650, () => 'easy')

    expect(Math.max(...result.intervals)).toBeLessThanOrEqual(MAX_INTERVAL_DAYS)
    expect(result.finalState.interval).toBe(MAX_INTERVAL_DAYS)
  })
})

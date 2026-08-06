import type { Grade } from '../cloze/types.js'

/**
 * The scheduling state carried by a single card, per user.
 *
 * Mirrors the SM-2 variables from `CLAUDE.md` plus a lapse counter (plan §2.6).
 * Deliberately a plain value object with no dates in it — `dueDate` is derived
 * from `interval` at review time, so a card's state stays meaningful even if it
 * is reviewed late.
 */
export interface ReviewState {
  /** Difficulty multiplier, clamped to [1.3, 2.5]. */
  easeFactor: number
  /** Days until the next review. */
  interval: number
  /** Consecutive successful reviews. Reset to 0 on a lapse. */
  repetitions: number
  /** Total times this card has been failed, across its whole history. */
  lapses: number
}

export interface ReviewOutcome extends ReviewState {
  /** When this card comes back, derived from `interval`. */
  dueDate: Date
  /**
   * True once the card has been failed too many times to be worth drilling.
   * Surfaced to the user so they can rewrite or delete it — a leech is almost
   * always a badly written card, not a hard fact.
   */
  isLeech: boolean
}

export interface ScheduleOptions {
  /** Injected for determinism in tests. Defaults to the current time. */
  now?: Date
  /** Injected for determinism in tests. Defaults to `Math.random`. */
  random?: () => number
  /** Apply interval fuzz. Defaults to true; turn off only in tests. */
  fuzz?: boolean
}

/** Starting state for a card that has never been reviewed. */
export const INITIAL_REVIEW_STATE: ReviewState = {
  easeFactor: 2.5,
  interval: 0,
  repetitions: 0,
  lapses: 0,
}

const MIN_EASE_FACTOR = 1.3
const MAX_EASE_FACTOR = 2.5

/** Beyond a year, SM-2's confidence isn't earned (plan §2.6). */
export const MAX_INTERVAL_DAYS = 365

/** Failure count at which a card is flagged for rewriting (plan §2.6). */
export const LEECH_THRESHOLD = 8

/**
 * Ease adjustment per grade.
 *
 * `again` and `good` come straight from `CLAUDE.md`. `hard` and `easy` exist
 * because a multi-blank card grades on a spectrum — "3 of 4 blanks right" is
 * genuinely different information from "all wrong", and collapsing it to a
 * boolean throws that away.
 */
const EASE_DELTA: Record<Grade, number> = {
  again: -0.2,
  hard: -0.15,
  good: 0,
  easy: 0.15,
}

const clampEase = (value: number): number =>
  Math.min(MAX_EASE_FACTOR, Math.max(MIN_EASE_FACTOR, value))

/**
 * Advances a card's schedule after a review.
 *
 * SM-2 as specified in `CLAUDE.md`, with the three production additions from
 * plan §2.6: interval fuzz, a 365-day cap, and a lapse counter.
 *
 * `now` and `random` are injectable because a scheduler that reads the clock
 * and the RNG directly is not testable — and an untestable scheduler is one
 * whose off-by-one you discover from a user's review queue six weeks later.
 */
export function calculateNextReview(
  grade: Grade,
  state: ReviewState = INITIAL_REVIEW_STATE,
  options: ScheduleOptions = {},
): ReviewOutcome {
  const { now = new Date(), random = Math.random, fuzz = true } = options

  const easeFactor = clampEase(state.easeFactor + EASE_DELTA[grade])

  if (grade === 'again') {
    // A lapse resets the ladder. No fuzz: "tomorrow" should mean tomorrow, and
    // the user needs to see a failed card again promptly.
    const lapses = state.lapses + 1
    return {
      easeFactor,
      interval: 1,
      repetitions: 0,
      lapses,
      dueDate: addDays(now, 1),
      isLeech: lapses >= LEECH_THRESHOLD,
    }
  }

  const repetitions = state.repetitions + 1
  const rawInterval = nextInterval(grade, state.interval, easeFactor, repetitions)
  const fuzzed = fuzz ? applyFuzz(rawInterval, random) : rawInterval
  const interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, fuzzed))

  return {
    easeFactor,
    interval,
    repetitions,
    lapses: state.lapses,
    dueDate: addDays(now, interval),
    isLeech: state.lapses >= LEECH_THRESHOLD,
  }
}

/**
 * The SM-2 interval ladder: 1 day, then 6, then multiply by the ease factor.
 *
 * `hard` uses a fixed 1.2 multiplier instead of the ease factor, so a
 * partially-correct card still moves forward but far more slowly than a clean
 * pass. `easy` adds a 1.3 bonus on top of the normal step.
 */
function nextInterval(
  grade: Exclude<Grade, 'again'>,
  currentInterval: number,
  easeFactor: number,
  repetitions: number,
): number {
  if (repetitions === 1) return grade === 'easy' ? 3 : 1
  if (repetitions === 2) return grade === 'hard' ? 3 : grade === 'easy' ? 8 : 6

  const base = Math.max(1, currentInterval)

  if (grade === 'hard') return Math.round(base * 1.2)
  if (grade === 'easy') return Math.round(base * easeFactor * 1.3)
  return Math.round(base * easeFactor)
}

/**
 * Scatters the interval by ±5% (plan §2.6).
 *
 * Without it, a 200-card import reviewed on one day comes back as a 200-card
 * day forever — the whole batch marches in lockstep through identical
 * intervals. Fuzz breaks the batch apart within a few reviews.
 *
 * Intervals below 3 days are left alone: rounding makes fuzz a no-op there
 * anyway, and shifting a 1-day interval is user-visible for no benefit.
 */
function applyFuzz(interval: number, random: () => number): number {
  if (interval < 3) return interval
  const factor = 0.95 + random() * 0.1
  return Math.round(interval * factor)
}

/**
 * Adds whole days to a date.
 *
 * Uses `setDate`, which is calendar-aware: adding 1 day across a DST boundary
 * yields the same wall-clock time the next day. Adding `n * 86400000`
 * milliseconds would drift by an hour twice a year, which over a 365-day
 * interval quietly shifts a card's due date to the previous day.
 */
export function addDays(from: Date, days: number): Date {
  const result = new Date(from.getTime())
  result.setDate(result.getDate() + days)
  return result
}

/** True when the card is due at `now`. Overdue cards are due. */
export function isDue(dueDate: Date, now: Date = new Date()): boolean {
  return dueDate.getTime() <= now.getTime()
}

/**
 * Sorts a review queue: most overdue first (plan §2.4 / `CLAUDE.md`).
 *
 * Ordering by due date ascending means the longest-waiting card is seen first,
 * which is also the one whose memory is decaying fastest.
 */
export function compareByDueDate(a: { dueDate: Date }, b: { dueDate: Date }): number {
  return a.dueDate.getTime() - b.dueDate.getTime()
}

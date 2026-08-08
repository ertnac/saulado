import { addDaysToKey, daysBetweenKeys, type DayKey } from '../study/day.js'
import type { DayStat } from './types.js'

/**
 * Turning sparse rows into a dense series.
 *
 * `user_daily_stats` only has rows for days the user actually studied — writing
 * a zero row for every idle day would mean a write per user per day forever, to
 * store the absence of an event. Correct storage, wrong shape for a chart: a
 * bar chart fed sparse data draws Monday next to Friday and silently lies about
 * the shape of a week.
 *
 * So the densifying happens here, in one place both sides can use, rather than
 * in each chart component where it would drift.
 */

/**
 * Every day from `from` to `to` inclusive, oldest first.
 *
 * Day keys rather than instants throughout — see `study/day.ts`. Adding 24h to
 * a `Date` is wrong across a DST boundary; adding 1 to a calendar day is not.
 */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const span = daysBetweenKeys(from, to)
  if (span < 0) return []

  const days: DayKey[] = []
  for (let offset = 0; offset <= span; offset++) {
    days.push(addDaysToKey(from, offset))
  }

  return days
}

/** The first day of a window of `length` days ending on `end`, inclusive. */
export function windowStart(end: DayKey, length: number): DayKey {
  // `length - 1` because the window includes both ends: a 7-day window ending
  // today runs from 6 days ago, not 7. Off by one here shows up as an eighth
  // bar on a "last 7 days" chart.
  return addDaysToKey(end, -(Math.max(1, length) - 1))
}

/**
 * Fills a sparse series so every day in the window is present.
 *
 * Days with no row become explicit zeroes. Rows outside the window are dropped
 * rather than clamped — a stat from before the window is not this window's
 * data, and folding it into the edge bar would overstate the first day.
 */
export function fillDaySeries(stats: DayStat[], from: DayKey, to: DayKey): DayStat[] {
  const bySeriesDay = new Map(stats.map((stat) => [stat.day, stat]))

  return dayRange(from, to).map(
    (day) => bySeriesDay.get(day) ?? { day, reviews: 0, correct: 0, goalMet: false },
  )
}

/**
 * Accuracy as a percentage, or `null` when there is nothing to be accurate
 * about.
 *
 * `null` rather than 0 is the whole point. Zero reviews is not zero percent
 * correct, and a trend line that plots idle days at 0% draws a cliff every
 * weekend that no user earned. Callers render the gap; they do not average it.
 */
export function accuracyPercent(correct: number, reviews: number): number | null {
  if (reviews <= 0) return null
  return Math.round((correct / reviews) * 100)
}

/**
 * Consecutive days ending at `today`, counting back through `days`.
 *
 * Today is allowed to be empty without breaking the streak — a user at 09:00
 * has not studied yet, and their month-long streak is intact until midnight.
 * That single allowance is the difference between a streak that motivates and
 * one that punishes people for opening the app in the morning.
 *
 * `days` must be dense and oldest-first; {@link fillDaySeries} guarantees both.
 */
export function currentStreak(days: DayStat[], today: DayKey): number {
  const studied = new Set(days.filter((day) => day.reviews > 0).map((day) => day.day))

  // Anchor on today when it has reviews, otherwise on yesterday. Anchoring
  // blindly on today would report 0 for every user who has not studied yet
  // today, which is most of them for most of the day.
  let cursor = studied.has(today) ? today : addDaysToKey(today, -1)

  let streak = 0
  while (studied.has(cursor)) {
    streak++
    cursor = addDaysToKey(cursor, -1)
  }

  return streak
}

/** The longest run of consecutive studied days anywhere in `days`. */
export function longestStreak(days: DayStat[]): number {
  let longest = 0
  let run = 0
  let previous: DayKey | null = null

  for (const day of days) {
    if (day.reviews <= 0) {
      run = 0
      previous = null
      continue
    }

    // Dense input makes this a formality, but a caller passing sparse rows
    // would otherwise get consecutive-looking runs out of days weeks apart.
    run = previous !== null && daysBetweenKeys(previous, day.day) === 1 ? run + 1 : 1
    previous = day.day
    longest = Math.max(longest, run)
  }

  return longest
}

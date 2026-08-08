import type { ProgressRange, ProgressResponse, SetProgress } from '@saulado/shared'
import {
  addDaysToKey,
  dayKeyToDate,
  fillDaySeries,
  GRADE_CODES,
  RANGE_DAYS,
  startOfDayInZone,
  windowStart,
  type DayKey,
} from '@saulado/shared'
import { prisma } from '../db/client.js'
import { loadSettings, todayFor } from '../study/settings.js'
import { getStreak, readDayStats } from './streak.js'

/**
 * The progress page payload (plan §5.1).
 *
 * Two different sources, on purpose:
 *
 * - The **day series** comes from `user_daily_stats`, the rollup. It is what
 *   makes a 365-day view one indexed range scan instead of a scan of every
 *   review the user has ever done.
 * - The **per-set breakdown** comes from `reviews`, the log, because the rollup
 *   has no set dimension. Adding one would mean a row per user per day per set,
 *   which is the cardinality the rollup exists to avoid.
 *
 * The two can therefore drift, which is what `scripts/backfill-daily-stats.ts`
 * exists to repair. The log is authoritative; the rollup is a cache with a
 * rebuild path.
 */

/**
 * A review counts as correct when **every** blank was right.
 *
 * This has to match `grading.ts`'s `correct` flag exactly, because that flag is
 * what `user_daily_stats.correct_count` was incremented by. `correct` there is
 * `isCardCorrect`, which is all-blanks-right, and that maps to `good` or `easy`
 * — never `hard`, which is *some* blanks right. Using `grade > 0` here would
 * count `hard` and make this table disagree with the chart above it on the same
 * page, for the same window.
 */
const CORRECT_GRADE = { gte: GRADE_CODES.good }

export async function getProgress(
  userId: string,
  range: ProgressRange,
  now: Date,
): Promise<ProgressResponse> {
  const settings = await loadSettings(userId)
  const today = todayFor(settings, now)
  const from = windowStart(today, RANGE_DAYS[range])

  const [sparse, streak, perSet] = await Promise.all([
    readDayStats(userId, from, today),
    getStreak(userId, today),
    readPerSet(userId, from, today, settings.timezone),
  ])

  const days = fillDaySeries(sparse, from, today)

  return {
    range,
    days,
    totals: {
      reviews: days.reduce((sum, day) => sum + day.reviews, 0),
      correct: days.reduce((sum, day) => sum + day.correct, 0),
      // Days with activity, not days in the window. "You studied on 12 of the
      // last 30 days" is a fact; rendering 12/30 as a percentage is a judgement.
      activeDays: days.filter((day) => day.reviews > 0).length,
    },
    streak,
    perSet,
  }
}

/**
 * Per-set totals over the window, from the review log.
 *
 * The timezone conversion is the fiddly part. `reviews.reviewed_at` is an
 * instant; the window is a pair of calendar days in the user's zone. Comparing
 * the instant against UTC midnight would put an evening review in Auckland on
 * the wrong day and, at the window edge, in the wrong window entirely.
 *
 * The upper bound is the start of the day *after* the window, held exclusive, so
 * a review at 23:59:59.999 on the last day is still inside it.
 */
async function readPerSet(
  userId: string,
  from: DayKey,
  to: DayKey,
  timezone: string,
): Promise<SetProgress[]> {
  const windowStartInstant = startOfDayInZone(dayKeyToDate(from), timezone)
  const windowEndInstant = startOfDayInZone(dayKeyToDate(addDaysToKey(to, 1)), timezone)
  const inWindow = { userId, reviewedAt: { gte: windowStartInstant, lt: windowEndInstant } }

  /*
    Three grouped queries rather than one join. Including the set on every review
    row would return one row per review — tens of thousands for a 365-day window
    on an active user — to compute a handful of sums.

    `correct` needs its own query because `groupBy` cannot count all rows and
    rows-matching-a-predicate in the same pass.
  */
  const [reviewRows, correctRows, sets] = await Promise.all([
    prisma.review.groupBy({ by: ['cardId'], where: inWindow, _count: { _all: true } }),
    prisma.review.groupBy({
      by: ['cardId'],
      where: { ...inWindow, grade: CORRECT_GRADE },
      _count: { _all: true },
    }),
    prisma.studySet.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        _count: { select: { cards: true } },
        cards: { select: { id: true } },
      },
    }),
  ])

  const reviewsPerCard = new Map(reviewRows.map((row) => [row.cardId, row._count._all]))
  const correctPerCard = new Map(correctRows.map((row) => [row.cardId, row._count._all]))

  return (
    sets
      .map((set) => {
        const cardIds = set.cards.map((card) => card.id)

        return {
          studySetId: set.id,
          title: set.title,
          reviews: cardIds.reduce((sum, id) => sum + (reviewsPerCard.get(id) ?? 0), 0),
          correct: cardIds.reduce((sum, id) => sum + (correctPerCard.get(id) ?? 0), 0),
          cardsStudied: cardIds.filter((id) => reviewsPerCard.has(id)).length,
          cardCount: set._count.cards,
        }
      })
      /*
      Sets with no activity in the window are dropped rather than listed at zero.
      The table sits under charts scoped to the same window, so a wall of zero
      rows would imply the user failed at those sets rather than not opening
      them. Archived sets are included when they *were* studied in the window —
      this is a record of what happened, not a list of work outstanding.
    */
      .filter((set) => set.reviews > 0)
      .sort((a, b) => b.reviews - a.reviews)
  )
}

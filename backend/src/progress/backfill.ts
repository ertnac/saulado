import { dayKeyInZone, dayKeyToDate, GRADE_CODES, type DayKey } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { DEFAULT_SETTINGS } from '../study/settings.js'

/**
 * Rebuilding `user_daily_stats` from the review log (plan §5.1).
 *
 * The rollup is a cache. `reviews` is the source of truth, and the schema
 * comment on `user_daily_stats` promises the rollup can be rebuilt from it —
 * this is the code that makes that promise true rather than aspirational.
 *
 * Needed whenever the two can drift:
 *
 * - a review written before the rollup existed (every review from Phase 4's
 *   early commits, and any seeded data)
 * - a user changing timezone, which moves which calendar day past reviews
 *   belong to — the rollup rows were written under the old zone and are simply
 *   wrong under the new one
 * - a partial restore, or a transaction that failed between the two writes
 *
 * ## What cannot be rebuilt
 *
 * `goalMet` is a **snapshot** of whether the day's reviews met the goal *as it
 * was that day*. The review log does not record the goal, and `user_settings`
 * holds only the current one, so a day's `goalMet` is unrecoverable once lost.
 *
 * This script therefore never clears a `goalMet` that is already true. For rows
 * it creates from scratch it evaluates against the *current* goal and says so
 * in the output, because an approximation the operator knows about is better
 * than either a silent guess or a permanently blank column.
 */

export interface BackfillOptions {
  /** Restrict to one user. Omit to process every user. */
  userId?: string
  /** Write the changes. Default is a dry run that only reports drift. */
  apply?: boolean
  /** Where progress goes. Injectable so tests can assert on it silently. */
  log?: (message: string) => void
}

export interface BackfillReport {
  usersScanned: number
  reviewsScanned: number
  /** Days whose stored counts disagreed with the log. */
  daysCorrected: number
  /** Days present in the log with no rollup row at all. */
  daysCreated: number
  /** Rollup rows with no reviews behind them. Deleted only under `--apply`. */
  daysOrphaned: number
  applied: boolean
}

/** Every blank right — the same predicate `grading.ts` increments on. */
const CORRECT_GRADE_FLOOR: number = GRADE_CODES.good

/** Reviews are read in pages so one prolific user cannot exhaust memory. */
const REVIEW_PAGE_SIZE = 5_000

interface DayTally {
  reviews: number
  correct: number
}

/**
 * Recomputes one user's daily tallies from their reviews.
 *
 * The day key is computed in the user's *current* timezone, which is the
 * intended behaviour: after a move, "which day did I study on" should be
 * answered in the zone the user is now in, and that is precisely the drift this
 * script exists to reconcile.
 */
async function tallyReviews(
  userId: string,
  timezone: string,
): Promise<{ byDay: Map<DayKey, DayTally>; scanned: number }> {
  const byDay = new Map<DayKey, DayTally>()
  let scanned = 0
  let cursor: string | undefined

  for (;;) {
    const page = await prisma.review.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      take: REVIEW_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, grade: true, reviewedAt: true },
    })

    if (page.length === 0) break

    for (const review of page) {
      const day = dayKeyInZone(review.reviewedAt, timezone)
      const tally = byDay.get(day) ?? { reviews: 0, correct: 0 }

      tally.reviews++
      if (review.grade >= CORRECT_GRADE_FLOOR) tally.correct++
      byDay.set(day, tally)
    }

    scanned += page.length
    cursor = page[page.length - 1]?.id
    if (page.length < REVIEW_PAGE_SIZE) break
  }

  return { byDay, scanned }
}

export async function backfillDailyStats(options: BackfillOptions = {}): Promise<BackfillReport> {
  const log =
    options.log ??
    ((message: string) => {
      console.log(message)
    })
  const apply = options.apply === true

  const users = await prisma.user.findMany({
    where: options.userId === undefined ? {} : { id: options.userId },
    select: { id: true, email: true, settings: { select: { timezone: true, dailyGoal: true } } },
  })

  const report: BackfillReport = {
    usersScanned: 0,
    reviewsScanned: 0,
    daysCorrected: 0,
    daysCreated: 0,
    daysOrphaned: 0,
    applied: apply,
  }

  for (const user of users) {
    const timezone = user.settings?.timezone ?? DEFAULT_SETTINGS.timezone
    const dailyGoal = user.settings?.dailyGoal ?? DEFAULT_SETTINGS.dailyGoal

    const [{ byDay, scanned }, existing] = await Promise.all([
      tallyReviews(user.id, timezone),
      prisma.userDailyStats.findMany({
        where: { userId: user.id },
        select: { day: true, reviewsCount: true, correctCount: true, goalMet: true },
      }),
    ])

    report.usersScanned++
    report.reviewsScanned += scanned

    const storedByDay = new Map(
      existing.map((row) => [
        // UTC components, because a DATE column round-trips as UTC midnight.
        row.day.toISOString().slice(0, 10),
        row,
      ]),
    )

    for (const [day, tally] of byDay) {
      const stored = storedByDay.get(day)

      if (stored === undefined) {
        report.daysCreated++
        log(
          `  + ${user.email} ${day}: ${String(tally.reviews)} reviews, ` +
            `${String(tally.correct)} correct (goalMet approximated from the current goal)`,
        )

        if (apply) {
          await prisma.userDailyStats.create({
            data: {
              userId: user.id,
              day: dayKeyToDate(day),
              reviewsCount: tally.reviews,
              correctCount: tally.correct,
              goalMet: tally.reviews >= dailyGoal,
            },
          })
        }
        continue
      }

      if (stored.reviewsCount === tally.reviews && stored.correctCount === tally.correct) continue

      report.daysCorrected++
      log(
        `  ~ ${user.email} ${day}: ${String(stored.reviewsCount)}/${String(stored.correctCount)} ` +
          `→ ${String(tally.reviews)}/${String(tally.correct)}`,
      )

      if (apply) {
        await prisma.userDailyStats.update({
          where: { userId_day: { userId: user.id, day: dayKeyToDate(day) } },
          data: {
            reviewsCount: tally.reviews,
            correctCount: tally.correct,
            // Latched: a day already earned stays earned. Only ever promoted,
            // never cleared, because the goal that earned it is not recoverable.
            goalMet: stored.goalMet || tally.reviews >= dailyGoal,
          },
        })
      }
    }

    for (const [day] of storedByDay) {
      if (byDay.has(day)) continue

      // A rollup row with no reviews behind it. Most likely a timezone change
      // moved the reviews to an adjacent day and left this one stranded.
      report.daysOrphaned++
      log(`  - ${user.email} ${day}: no reviews behind this row`)

      if (apply) {
        await prisma.userDailyStats.delete({
          where: { userId_day: { userId: user.id, day: dayKeyToDate(day) } },
        })
      }
    }
  }

  return report
}

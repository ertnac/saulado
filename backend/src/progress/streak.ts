import type { DayStat, StreakSummary } from '@saulado/shared'
import {
  currentStreak,
  dateToDayKey,
  dayKeyToDate,
  fillDaySeries,
  longestStreak,
  windowStart,
  type DayKey,
} from '@saulado/shared'
import { prisma } from '../db/client.js'

/**
 * Reading `user_daily_stats` (plan §5.1).
 *
 * Every function here works in **day keys**, never instants. `user_daily_stats.day`
 * is a SQL `DATE` already written in the user's own timezone by `grading.ts`, so
 * the zone conversion happened at write time and must not happen again on read —
 * doing it twice shifts every row by the offset and breaks the streak for anyone
 * not on UTC.
 *
 * The one thing to keep in mind: rows exist only for days the user studied. A
 * dense series is produced here with `fillDaySeries` rather than stored, because
 * storing a zero row per user per idle day is a write forever to record that
 * nothing happened.
 */

/** Prisma rows → the shared `DayStat` shape, sparse and oldest-first. */
export async function readDayStats(userId: string, from: DayKey, to: DayKey): Promise<DayStat[]> {
  const rows = await prisma.userDailyStats.findMany({
    where: { userId, day: { gte: dayKeyToDate(from), lte: dayKeyToDate(to) } },
    orderBy: { day: 'asc' },
    select: { day: true, reviewsCount: true, correctCount: true, goalMet: true },
  })

  return rows.map((row) => ({
    // `dateToDayKey` reads the UTC components, which is exactly right: Prisma
    // hands a DATE back as UTC midnight, and the calendar day is what was
    // stored. Using local getters here would move the date by a day for any
    // server west of Greenwich.
    day: dateToDayKey(row.day),
    reviews: row.reviewsCount,
    correct: row.correctCount,
    goalMet: row.goalMet,
  }))
}

/**
 * The window a streak has to be computed over.
 *
 * A streak is unbounded in principle — a user studying daily for three years has
 * a 1,095-day streak — but scanning every row on every dashboard load gets
 * slower the more loyal the user is, which is the wrong incentive. So the read
 * is windowed, and the window is widened only when the streak reaches its edge.
 */
const STREAK_WINDOW_DAYS = 400

/**
 * Current and longest streak, in the user's timezone.
 *
 * `longest` is scoped to the same window as `current`, which is a deliberate
 * simplification: an all-time longest would need a full-table scan on every
 * dashboard load. 400 days covers more than a year, and a user who beats a
 * streak older than that is being told their *recent* best — understated, never
 * overstated, which is the safe direction for a number that motivates.
 */
export async function getStreak(userId: string, today: DayKey): Promise<StreakSummary> {
  const from = windowStart(today, STREAK_WINDOW_DAYS)
  const sparse = await readDayStats(userId, from, today)
  const days = fillDaySeries(sparse, from, today)

  return {
    current: currentStreak(days, today),
    longest: longestStreak(days),
    studiedToday: sparse.some((stat) => stat.day === today && stat.reviews > 0),
  }
}

/** Today's row, or an honest zero for a user who has not started yet. */
export async function getToday(
  userId: string,
  today: DayKey,
  dailyGoal: number,
): Promise<{ reviews: number; correct: number; goal: number; goalMet: boolean }> {
  const row = await prisma.userDailyStats.findUnique({
    where: { userId_day: { userId, day: dayKeyToDate(today) } },
    select: { reviewsCount: true, correctCount: true, goalMet: true },
  })

  return {
    reviews: row?.reviewsCount ?? 0,
    correct: row?.correctCount ?? 0,
    // The *current* goal, so the ring's denominator matches what the user set.
    // `goalMet` stays latched from the row, so lowering the goal cannot revoke
    // a day already earned while raising it cannot retroactively un-earn one.
    goal: dailyGoal,
    goalMet: row?.goalMet ?? false,
  }
}

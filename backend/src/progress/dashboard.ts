import type { DashboardResponse, RecentSet } from '@saulado/shared'
import { fillDaySeries, windowStart } from '@saulado/shared'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { getDueCounts } from '../study/due-counts.js'
import { loadSettings, todayFor } from '../study/settings.js'
import { getStreak, getToday, readDayStats } from './streak.js'

/**
 * The dashboard payload (plan §5.1 — "one request, not six").
 *
 * One request to the *client*, and one round of concurrent queries to the
 * database. Both halves matter: six sequential awaits would arrive together but
 * take six round-trip times, which on a free-tier Postgres in another region is
 * the difference between a dashboard that appears and one that assembles.
 *
 * Everything below is derived from tables the study flow already writes. Nothing
 * here is a new source of truth, so nothing here can disagree with the study
 * screen about what is due.
 */

/** How many days the sparkline covers. Seven, so it reads as "this week". */
const SPARKLINE_DAYS = 7

/** How many sets the dashboard lists. Enough to be useful, short enough to scan. */
const RECENT_SET_LIMIT = 4

export async function getDashboard(userId: string, now: Date): Promise<DashboardResponse> {
  const settings = await loadSettings(userId)
  const today = todayFor(settings, now)
  const sparkFrom = windowStart(today, SPARKLINE_DAYS)

  /*
    `getDueCounts` re-reads settings internally. Left alone rather than
    refactored to take them: it is the same query the library and study screens
    run, and having one canonical "what is due" function matters more than
    saving a cached row read. If it ever shows up in a profile, the fix is to
    thread settings through it, not to reimplement the counting here.
  */
  const [due, streak, todayProgress, sparkSparse, recentSets] = await Promise.all([
    getDueCounts(userId, now),
    getStreak(userId, today),
    getToday(userId, today, settings.dailyGoal),
    readDayStats(userId, sparkFrom, today),
    readRecentSets(userId),
  ])

  return {
    totalDue: due.totalDue,
    // Both totals come off the response rather than being summed from `counts`.
    // Those entries roll up each set's subtree, so a card under a grandchild
    // appears in three of them — correct per badge, triple-counted in aggregate.
    newCards: due.totalNew,
    // Same discriminator the dashboard already used in Phase 4: `counts` is
    // empty both for a caught-up user and for one who has never studied, and
    // only a schedule row tells those apart.
    hasStudied: due.scheduledCards > 0,
    streak,
    today: todayProgress,
    recentSets: recentSets.map((set) => ({
      ...set,
      // Joined here rather than in SQL: the due counts are already loaded, and
      // a per-set correlated subquery would add N round-trips to save one map.
      // Subtree-rolled, so this is the same figure the library badge shows.
      dueCount: due.counts.find((entry) => entry.studySetId === set.id)?.due ?? 0,
    })),
    sparkline: fillDaySeries(sparkSparse, sparkFrom, today),
  }
}

/**
 * The sets worth offering a way back into.
 *
 * Ordered by most recently *studied*, falling back to most recently updated for
 * sets never studied — a set created five minutes ago and not yet studied is
 * more relevant than one reviewed last month, and ordering purely by study time
 * would bury it below sets the user has moved on from.
 *
 * Archived sets are excluded, matching every other "what should I do now"
 * surface: putting a set away should remove it from the places that suggest work.
 */
async function readRecentSets(userId: string): Promise<Omit<RecentSet, 'dueCount'>[]> {
  const sets = await prisma.studySet.findMany({
    where: { userId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: RECENT_SET_LIMIT * 4,
    select: {
      id: true,
      title: true,
      _count: { select: { cards: true } },
    },
  })

  if (sets.length === 0) return []

  const setIds = sets.map((s) => s.id)

  const activity = await prisma.$queryRaw<{ setId: string; lastReviewedAt: Date | null }[]>`
    SELECT card.study_set_id as "setId", MAX(schedule.last_reviewed_at) as "lastReviewedAt"
    FROM study_cards card
    JOIN card_schedules schedule ON schedule.card_id = card.id
    WHERE card.study_set_id IN (${Prisma.join(setIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND schedule.user_id = ${userId}::uuid
      AND schedule.last_reviewed_at IS NOT NULL
    GROUP BY card.study_set_id
  `

  const activityMap = new Map(activity.map((a) => [a.setId, a.lastReviewedAt]))

  const withActivity = sets.map((set) => {
    const lastStudied = activityMap.get(set.id) ?? null
    return {
      id: set.id,
      title: set.title,
      cardCount: set._count.cards,
      lastStudiedAt: lastStudied?.toISOString() ?? null,
    }
  })

  return withActivity
    .sort((a, b) => {
      if (a.lastStudiedAt === null && b.lastStudiedAt === null) return 0
      if (a.lastStudiedAt === null) return -1
      if (b.lastStudiedAt === null) return 1
      return b.lastStudiedAt.localeCompare(a.lastStudiedAt)
    })
    .slice(0, RECENT_SET_LIMIT)
}

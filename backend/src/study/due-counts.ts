import type { DueCountsResponse } from '@saulado/shared'
import { dayKeyToDate } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { loadSettings, todayFor } from './settings.js'

/**
 * Per-set due counts for the library.
 *
 * Drives the "Study (12)" badge on each set card, so it runs on every library
 * load and has to stay cheap. Two `groupBy` queries rather than a per-set loop:
 * a user with 40 sets would otherwise issue 80 round-trips to render one page.
 *
 * These counts are *uncapped* — they answer "how much is waiting", not "how much
 * will this session serve". A user with 300 due cards should see 300, then get a
 * capped session when they start one; showing the capped number would make the
 * backlog look like it was shrinking on its own.
 */
export async function getDueCounts(userId: string, now: Date): Promise<DueCountsResponse> {
  const settings = await loadSettings(userId)
  const today = dayKeyToDate(todayFor(settings, now))

  // Cards with no blanks are excluded here for the same reason they are excluded
  // from the queue: an unhighlighted card cannot be answered correctly, so
  // counting it would promise a session that cannot be finished.
  const studiable = { set: { userId }, answers: { some: {} } }

  const [dueRows, newRows] = await Promise.all([
    prisma.studyCard.groupBy({
      by: ['studySetId'],
      where: { ...studiable, schedules: { some: { userId, dueAt: { lte: today } } } },
      _count: { _all: true },
    }),
    prisma.studyCard.groupBy({
      by: ['studySetId'],
      where: { ...studiable, schedules: { none: { userId } } },
      _count: { _all: true },
    }),
  ])

  const counts = new Map<string, { studySetId: string; due: number; newCards: number }>()

  for (const row of dueRows) {
    counts.set(row.studySetId, {
      studySetId: row.studySetId,
      due: row._count._all,
      newCards: 0,
    })
  }

  for (const row of newRows) {
    const entry = counts.get(row.studySetId)
    if (entry) entry.newCards = row._count._all
    else
      counts.set(row.studySetId, {
        studySetId: row.studySetId,
        due: 0,
        newCards: row._count._all,
      })
  }

  const list = [...counts.values()]

  return {
    counts: list,
    /**
     * Due only — new cards are not "owed".
     *
     * The dashboard's headline number is a debt the user has accrued. Folding in
     * new cards would make a freshly imported 500-card set read as 500 overdue
     * reviews on day one, which is exactly the wall the daily cap exists to
     * avoid showing.
     */
    totalDue: list.reduce((sum, entry) => sum + entry.due, 0),
  }
}

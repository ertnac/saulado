import type { DueCountsResponse } from '@saulado/shared'
import { dayKeyToDate } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { loadSetNodes, rollUpSubtree } from '../routes/set-tree.js'
import { loadSettings, todayFor } from './settings.js'

/**
 * Per-set due and mastery counts for the library.
 *
 * Drives the "Study (12)" badge and mastery progress on each set card, so it
 * runs on every library load and has to stay cheap.
 *
 * Each badge counts the set's **subtree**, matching what studying that set will
 * actually serve. A parent reading 0 while its children hold 40 is a badge that
 * lies about the button next to it.
 *
 * A card is considered **mastered** once it has achieved at least 2 consecutive
 * successful review sessions (`repetitions >= 2`), as tracked by the SM-2 engine.
 */
export async function getDueCounts(userId: string, now: Date): Promise<DueCountsResponse> {
  const settings = await loadSettings(userId)
  const today = dayKeyToDate(todayFor(settings, now))

  // Cards with no blanks are excluded here for the same reason they are excluded
  // from the queue: an unhighlighted card cannot be answered correctly, so
  // counting it would promise a session that cannot be finished.
  //
  // Archived sets are excluded too, matching the all-sets queue.
  const studiable = { set: { userId, archivedAt: null }, answers: { some: {} } }

  const [dueRows, newRows, masteredRows, scheduledCards, nodes] = await Promise.all([
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
    prisma.studyCard.groupBy({
      by: ['studySetId'],
      where: { ...studiable, schedules: { some: { userId, repetitions: { gte: 2 } } } },
      _count: { _all: true },
    }),
    // Not filtered by `studiable`: this answers "has this user ever studied",
    // and archiving a set or un-highlighting a card does not undo that. Scoped
    // to the user's own sets so a shared set could never make it non-zero.
    prisma.cardSchedule.count({ where: { userId, card: { set: { userId } } } }),
    loadSetNodes(userId),
  ])

  const ownDue = new Map(dueRows.map((row) => [row.studySetId, row._count._all]))
  const ownNew = new Map(newRows.map((row) => [row.studySetId, row._count._all]))
  const ownMastered = new Map(masteredRows.map((row) => [row.studySetId, row._count._all]))

  const subtreeDue = rollUpSubtree(nodes, ownDue)
  const subtreeNew = rollUpSubtree(nodes, ownNew)
  const subtreeMastered = rollUpSubtree(nodes, ownMastered)

  const list = nodes
    .map((node) => ({
      studySetId: node.id,
      due: subtreeDue.get(node.id) ?? 0,
      newCards: subtreeNew.get(node.id) ?? 0,
      mastered: subtreeMastered.get(node.id) ?? 0,
    }))
    .filter((entry) => entry.due > 0 || entry.newCards > 0 || (entry.mastered ?? 0) > 0)

  return {
    counts: list,
    totalDue: sumOf(ownDue),
    totalNew: sumOf(ownNew),
    totalMastered: sumOf(ownMastered),
    scheduledCards,
  }
}

function sumOf(counts: ReadonlyMap<string, number>): number {
  return [...counts.values()].reduce((sum, count) => sum + count, 0)
}

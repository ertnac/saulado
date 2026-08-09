import type { DueCountsResponse } from '@saulado/shared'
import { dayKeyToDate } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { loadSetNodes, rollUpSubtree } from '../routes/set-tree.js'
import { loadSettings, todayFor } from './settings.js'

/**
 * Per-set due counts for the library.
 *
 * Drives the "Study (12)" badge on each set card, so it runs on every library
 * load and has to stay cheap. Two `groupBy` queries rather than a per-set loop:
 * a user with 40 sets would otherwise issue 80 round-trips to render one page.
 *
 * Each badge counts the set's **subtree**, matching what studying that set will
 * actually serve. A parent reading 0 while its children hold 40 is a badge that
 * lies about the button next to it.
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
  //
  // Archived sets are excluded too, matching the all-sets queue. These numbers are
  // a workload — a set the user has put away is not work they owe, and counting it
  // would make archiving fail to reduce the figure it was used to reduce.
  const studiable = { set: { userId, archivedAt: null }, answers: { some: {} } }

  const [dueRows, newRows, scheduledCards, nodes] = await Promise.all([
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
    // Not filtered by `studiable`: this answers "has this user ever studied",
    // and archiving a set or un-highlighting a card does not undo that. Scoped
    // to the user's own sets so a shared set could never make it non-zero.
    prisma.cardSchedule.count({ where: { userId, card: { set: { userId } } } }),
    loadSetNodes(userId),
  ])

  const ownDue = new Map(dueRows.map((row) => [row.studySetId, row._count._all]))
  const ownNew = new Map(newRows.map((row) => [row.studySetId, row._count._all]))

  const subtreeDue = rollUpSubtree(nodes, ownDue)
  const subtreeNew = rollUpSubtree(nodes, ownNew)

  // Only sets with something waiting. `rollUpSubtree` returns every set the user
  // owns, including the empty ones, and shipping a row of two zeroes per set
  // would change what an empty `counts` array means — see `scheduledCards`.
  const list = nodes
    .map((node) => ({
      studySetId: node.id,
      due: subtreeDue.get(node.id) ?? 0,
      newCards: subtreeNew.get(node.id) ?? 0,
    }))
    .filter((entry) => entry.due > 0 || entry.newCards > 0)

  return {
    counts: list,
    /**
     * Due only — new cards are not "owed".
     *
     * The dashboard's headline number is a debt the user has accrued. Folding in
     * new cards would make a freshly imported 500-card set read as 500 overdue
     * reviews on day one, which is exactly the wall the daily cap exists to
     * avoid showing.
     *
     * Both totals are summed from the **own** counts, not from `counts` above. A
     * card in a grandchild appears in three subtree totals, so adding `counts`
     * up would report it three times — each row is correct on its own and wrong
     * in aggregate, which is the trap a rolled-up list invites. Computed here,
     * where the own-counts maps exist, rather than left to each caller.
     */
    totalDue: sumOf(ownDue),
    totalNew: sumOf(ownNew),
    scheduledCards,
  }
}

function sumOf(counts: ReadonlyMap<string, number>): number {
  return [...counts.values()].reduce((sum, count) => sum + count, 0)
}

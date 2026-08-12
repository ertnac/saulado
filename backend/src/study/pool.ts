import { prisma } from '../db/client.js'
import { ApiError } from '../http/errors.js'
import { subtreeIds } from '../routes/set-tree.js'
import type { PoolCard } from './card-source.js'

/**
 * Card pools for the explicitly-chosen study modes.
 *
 * Separate from `loadCandidates` in `session.ts`, which is due-only by design.
 * Memorization and Review are deliberate drills over a whole set — filtering
 * them to what the scheduler thinks is due would make "study this set" quietly
 * mean "study the eleven cards of it that are due", which is the one thing the
 * user did not ask for.
 */

/**
 * Every studiable card in a set and its descendants.
 *
 * `answers: { some: {} }` is the load-bearing filter, exactly as in
 * `loadCandidates`: a card saved without highlights grades `again` forever, so
 * including one puts a card in the queue that no amount of knowing the material
 * can clear.
 *
 * Archived descendants are included. Asking for a set by id is an explicit
 * override — the same rule the due-based path already applies.
 */
export async function loadSetPool(userId: string, studySetId: string): Promise<PoolCard[]> {
  const rows = await prisma.studyCard.findMany({
    where: {
      studySetId: { in: await subtreeIds(userId, studySetId) },
      answers: { some: {} },
    },
    select: { id: true, studySetId: true, createdAt: true },
  })

  return rows.map((row) => ({
    cardId: row.id,
    studySetId: row.studySetId,
    createdAt: row.createdAt,
  }))
}

/**
 * The cards a prior session left blank, in that session's presentation order.
 *
 * Ownership is checked on the *session*, not on the cards: a retake is defined
 * by "the pass I just finished", so a session id belonging to someone else is a
 * 404 for the same reason every other session route treats it as one — a 403
 * would confirm the row exists, which is all id enumeration needs.
 */
export async function loadRetakePool(
  userId: string,
  sessionId: string,
): Promise<{ cardIds: string[]; studySetId: string | null }> {
  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: {
      studySetId: true,
      cards: {
        where: { hadEmptyBlank: true },
        orderBy: { position: 'asc' },
        select: { cardId: true },
      },
    },
  })

  if (!session) throw new ApiError('NOT_FOUND', 'That study session could not be found.')

  return {
    cardIds: session.cards.map((card) => card.cardId),
    studySetId: session.studySetId,
  }
}

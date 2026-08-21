import type { BlankWidthMode, SessionCard } from '@saulado/shared'
import {
  LEECH_THRESHOLD,
  countBlanks,
  toSessionSegments,
  generateBlankOptions,
} from '@saulado/shared'
import { prisma } from '../db/client.js'

/**
 * Turning stored cards into the shape the study view receives.
 *
 * The one rule: **no answer text crosses this boundary.** `toSessionSegments`
 * emits the paragraph *around* the blanks, and under the default blank width
 * mode it also flattens per-blank widths so a slot cannot hint at the length of
 * what goes in it.
 *
 * This is why study mode does not reuse `GET /api/cards/:id`. That endpoint
 * returns `answers` with `answerText` — correct for the editor, and a complete
 * answer key for anyone with devtools open during a review.
 */

/** How many cards' segments are sent at a time (plan §4.1, "first batch"). */
export const SESSION_BATCH_SIZE = 20

export interface RenderableCard {
  id: string
  studySetId: string
  paragraph: string
  tags: string[]
  answers: { startOffset: number; endOffset: number; answerText: string; altAnswers: string[] }[]
}

export function toSessionCard(
  card: RenderableCard,
  options: {
    isNew: boolean
    lapses: number
    blankWidthMode: BlankWidthMode
    allSetAnswers: string[]
  },
): SessionCard {
  const segments = toSessionSegments(card.paragraph, card.answers, options.blankWidthMode)

  const blankOptions = card.answers.map((ans) =>
    generateBlankOptions(
      [ans.answerText, ...ans.altAnswers],
      options.allSetAnswers,
      card.paragraph,
    ),
  )

  const result: SessionCard = {
    cardId: card.id,
    studySetId: card.studySetId,
    segments,
    blankCount: countBlanks(segments),
    tags: card.tags,
    isNew: options.isNew,
    isLeech: options.lapses >= LEECH_THRESHOLD,
    blankOptions,
    blankAnswers: card.answers.map((a) => a.answerText),
    cardAnswers: card.answers.map((a) => ({
      answerText: a.answerText,
      altAnswers: a.altAnswers,
    })),
  }
  return result
}

/**
 * Loads the cards for a batch of queue slots, in queue order.
 *
 * `findMany` with an `in` filter returns rows in whatever order Postgres likes,
 * so the result is re-sorted against the slot order rather than trusted. A queue
 * that silently reorders itself between the build and the render would undo the
 * overdue prioritisation the source just computed.
 */
export async function loadSessionCards(
  slots: readonly { cardId: string; isNew: boolean }[],
  userId: string,
  blankWidthMode: BlankWidthMode,
): Promise<SessionCard[]> {
  if (slots.length === 0) return []

  const cardIds = slots.map((slot) => slot.cardId)

  const [cards, schedules] = await Promise.all([
    prisma.studyCard.findMany({
      // Scoped through the set even though the ids came from this user's own
      // session. Defence in depth: a queue row is only ever written from a
      // scoped query, but this is the read that would leak if that ever changed.
      where: { id: { in: cardIds }, set: { userId } },
      select: {
        id: true,
        studySetId: true,
        paragraph: true,
        tags: true,
        answers: {
          orderBy: { ordinal: 'asc' },
          select: {
            startOffset: true,
            endOffset: true,
            answerText: true,
            altAnswers: true,
          },
        },
      },
    }),
    prisma.cardSchedule.findMany({
      where: { userId, cardId: { in: cardIds } },
      select: { cardId: true, lapses: true },
    }),
  ])

  const setIds = Array.from(new Set(cards.map((card) => card.studySetId)))
  const setAnswersRows = await prisma.cardAnswer.findMany({
    where: { card: { studySetId: { in: setIds } } },
    select: { answerText: true, altAnswers: true, card: { select: { studySetId: true } } },
  })

  const answersBySet = new Map<string, string[]>()
  for (const row of setAnswersRows) {
    const setId = row.card.studySetId
    const arr = answersBySet.get(setId) ?? []
    arr.push(row.answerText, ...row.altAnswers)
    answersBySet.set(setId, arr)
  }

  const byId = new Map(cards.map((card) => [card.id, card]))
  const lapsesById = new Map(schedules.map((row) => [row.cardId, row.lapses]))

  return slots.flatMap((slot) => {
    const card = byId.get(slot.cardId)
    // A card deleted mid-session simply drops out of the queue. Throwing here
    // would make one stale row able to break resuming the whole session.
    if (!card) return []

    return [
      toSessionCard(card, {
        isNew: slot.isNew,
        lapses: lapsesById.get(slot.cardId) ?? 0,
        blankWidthMode,
        allSetAnswers: answersBySet.get(card.studySetId) ?? [],
      }),
    ]
  })
}

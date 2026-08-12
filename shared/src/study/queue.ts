/**
 * Queue composition.
 *
 * Plan §4.1 asks for due cards first, then up to `newCardsPerDay` unseen ones,
 * "interleaved ~1 new per 4 reviews". The ratio is not cosmetic — it is the
 * difference between a session that feels like maintenance and one that feels
 * like homework. All-new-first front-loads the hardest cards onto the freshest
 * attention and then leaves a long tail of easy reviews; all-new-last means a
 * user who quits early never learns anything new.
 *
 * Pure and array-in/array-out so the ordering rules can be tested without a
 * database. The backend's `SpacedRepetitionSource` supplies the rows.
 */

import type { Grade } from '../cloze/types.js'

/** One new card per this many due cards. */
export const NEW_CARD_INTERLEAVE = 4

/** What the queue needs to know about a card to order it. */
export interface QueueEntry {
  cardId: string
  /** Null for a card with no schedule row — never studied. */
  dueAt: Date | null
  lapses: number
}

/**
 * Orders due cards: oldest first, ties broken by lapses descending.
 *
 * The tie-break matters more than it looks. A day's due cards usually share a
 * `due_at`, so without it the order is whatever Postgres returns — effectively
 * random, and stable only by accident. Putting the most-lapsed cards first
 * means the ones the user keeps forgetting get the attention that is left
 * before the session is abandoned.
 */
export function compareDue(a: QueueEntry, b: QueueEntry): number {
  const aDue = a.dueAt?.getTime() ?? 0
  const bDue = b.dueAt?.getTime() ?? 0
  if (aDue !== bDue) return aDue - bDue
  if (a.lapses !== b.lapses) return b.lapses - a.lapses
  // Final tie-break on id, so the same inputs always give the same queue.
  // Without it, "resume the session" could reorder cards under the user.
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0
}

/**
 * Weaves new cards into the due queue at roughly `1 : every` .
 *
 * The first slot goes to a **due** card deliberately. Opening on something
 * familiar is what makes a session feel startable; opening on an unseen card
 * makes it feel like work before the user has any momentum.
 *
 * When one list runs out the other simply continues — so a first-ever session
 * (no due cards at all) is all new, and a backlog day is all reviews, without
 * either case needing a branch here.
 */
export function interleaveNew<T>(
  due: readonly T[],
  fresh: readonly T[],
  every = NEW_CARD_INTERLEAVE,
): T[] {
  if (fresh.length === 0) return [...due]
  if (due.length === 0) return [...fresh]

  const queue: T[] = []
  let dueIndex = 0
  let freshIndex = 0

  while (dueIndex < due.length || freshIndex < fresh.length) {
    for (let taken = 0; taken < every && dueIndex < due.length; taken++) {
      const card = due[dueIndex++]
      if (card !== undefined) queue.push(card)
    }

    if (freshIndex < fresh.length) {
      const card = fresh[freshIndex++]
      if (card !== undefined) queue.push(card)
    } else if (dueIndex >= due.length) {
      break
    }
  }

  return queue
}

/** Returns a float in `[0, 1)`. Injectable so a test can pin the order. */
export type Rng = () => number

/**
 * Fisher-Yates, on a copy.
 *
 * Two reasons the shuffle is a real algorithm rather than a sort on a random
 * key: an unbiased shuffle is one pass instead of a comparator that is asked to
 * be inconsistent (which `Array.sort` is entitled to turn into any permutation,
 * including a barely-shuffled one), and `rng` being a parameter is what lets the
 * tests assert a specific order instead of asserting "not the input order" and
 * flaking one run in `n!`.
 *
 * Randomising a queue does not make a resumed session reorder: the built queue
 * is written to `study_session_cards.position` at session start, and every later
 * read comes back from those rows rather than from a rebuild.
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = result[i]
    const b = result[j]
    // Indices are in range by construction; the guard is for `noUncheckedIndexedAccess`.
    if (a !== undefined && b !== undefined) {
      result[i] = b
      result[j] = a
    }
  }

  return result
}

/**
```,StartLine:84,TargetContent:
 * Where a card graded `again` goes back into the queue.
 *
 * Not the front — re-showing a card the user just failed tests short-term
 * memory rather than recall, and the "correct" answer that follows is worth
 * nothing. Not the back either, since a session the user abandons early would
 * never resurface it. {@link REQUEUE_GAP} cards later is far enough to have
 * forgotten the reveal and near enough to still be in the session.
 */
export const REQUEUE_GAP = 5

export function requeuePosition(currentIndex: number, queueLength: number): number {
  return Math.min(currentIndex + REQUEUE_GAP, queueLength)
}

/**
 * How many times one card may be shown in a single session.
 *
 * Without a cap, a card the user simply does not know yet loops forever and the
 * session cannot end — the queue refills itself faster than it drains. Two
 * attempts gives one honest retry; after that the card is due tomorrow anyway,
 * which is where a card you cannot recall twice in five minutes belongs.
 */
export const MAX_SESSION_ATTEMPTS = 2

/** Whether a graded card comes back around in this session. */
export function shouldRequeue(grade: Grade, attempts: number): boolean {
  return grade === 'again' && attempts < MAX_SESSION_ATTEMPTS
}

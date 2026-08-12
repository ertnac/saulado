import type { Grade, SessionMode, Rng } from '@saulado/shared'
import { compareDue, interleaveNew, shouldRequeue, shuffle, type QueueEntry } from '@saulado/shared'

/**
 * The card-source seam (plan §2.4).
 *
 * Study mode asks two questions of a source: *what next*, and *what does a grade
 * mean*. Spaced repetition is one set of answers to those; it is not the only
 * one Saulado will need. Phase 9 wants a `QuizSource` (a fixed set of cards, no
 * scheduling at all) and a `CrammingSource` (loop the whole set until every card
 * is right, tonight, without touching long-term schedules).
 *
 * The interface exists now, with one implementation, so those two arrive as new
 * classes rather than as `if (mode === 'cram')` branches through the session
 * route. The distinguishing behaviour is in {@link CardSource.onGraded}: cramming
 * re-queues without rescheduling, a quiz does neither, and spaced repetition
 * does both. Fold that decision into the route and the route becomes the place
 * every future mode has to be understood from.
 *
 * Nothing here touches Prisma. A source is handed rows and returns an order, so
 * queue composition is unit-testable without a database — the ordering rules are
 * where the subtle bugs live, not in the fetching.
 */

/** A card the source may choose to include, with what it needs to rank it. */
export interface CandidateCard extends QueueEntry {
  studySetId: string
}

/** One slot in the built queue. */
export interface QueueSlot {
  cardId: string
  position: number
  /** No schedule row existed — the user has never seen this card. */
  isNew: boolean
}

/** What a source decides after a card is graded. */
export interface GradeVerdict {
  /** Show the card again later in this same session. */
  requeue: boolean
  /**
   * Write the new SM-2 state to `card_schedules`.
   *
   * False for sequential drill, and for a card that was not actually due —
   * studying ahead should not be able to reset a schedule the user has earned.
   */
  reschedule: boolean
  /**
   * Write a `Review` row and roll up daily stats.
   *
   * False only for `retake`, which is an explicitly practice-only pass: the
   * blank the user is finishing was already graded and counted when they left
   * it blank, and counting the finish too would let one card book two reviews.
   */
  record: boolean
}

export interface CardSource {
  /** Identifies the source in the session row and in logs. */
  readonly kind: SessionMode
  /** The full queue, in presentation order. Called once, at session start. */
  build(): QueueSlot[]
  /** The next unserved card, or `null`. Drives `next()`/`size()` in tests. */
  next(): QueueSlot | null
  /** Cards not yet served by {@link next}. */
  size(): number
  /** Total cards planned for the session — the denominator of `7 / 24`. */
  total(): number
  onGraded(cardId: string, grade: Grade, attempts: number): GradeVerdict
}

export interface SpacedRepetitionOptions {
  /** Cards with a schedule row whose `dueAt` is on or before today. */
  due: readonly CandidateCard[]
  /** Cards with no schedule row at all. */
  fresh: readonly CandidateCard[]
  /** `user_settings.new_cards_per_day`, minus any new cards already studied today. */
  newCardsPerDay: number
  /**
   * `user_settings.daily_goal` used as a review cap (plan §4.3).
   *
   * A user who imports 400 cards and comes back a month later should be offered
   * a session, not a wall. Capping is why the queue is built and persisted up
   * front instead of streamed: the count has to be knowable to be shown.
   */
  dailyCap: number
  /** Reviews already done today, which the cap is measured against. */
  reviewsToday?: number
}

export class SpacedRepetitionSource implements CardSource {
  readonly kind = 'spaced' as const

  private queue: QueueSlot[] | null = null
  private cursor = 0

  constructor(private readonly options: SpacedRepetitionOptions) {}

  build(): QueueSlot[] {
    if (this.queue !== null) return this.queue

    const { due, fresh, newCardsPerDay, dailyCap, reviewsToday = 0 } = this.options

    // The cap counts reviews already done today, so studying twice in one day
    // does not hand out two full sessions.
    const remaining = Math.max(0, dailyCap - reviewsToday)

    const dueIds = [...due].sort(compareDue).map((card) => card.cardId)

    // New cards are ordered by id rather than by creation date. A set imported
    // in one transaction shares a `created_at` to the millisecond, so ordering
    // on it is ordering on nothing — and an arbitrary-but-stable order at least
    // survives a session resume.
    const freshIds = [...fresh]
      .sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0))
      .slice(0, Math.max(0, newCardsPerDay))
      .map((card) => card.cardId)

    // Due cards are capped first and new cards fill what is left. Trimming the
    // interleaved queue instead would drop whichever kind happened to sort last,
    // which on a backlog day means the new cards silently never appear.
    const cappedDue = dueIds.slice(0, remaining)
    const cappedFresh = freshIds.slice(0, Math.max(0, remaining - cappedDue.length))
    const freshSet = new Set(cappedFresh)

    this.queue = interleaveNew(cappedDue, cappedFresh).map((cardId, position) => ({
      cardId,
      position,
      isNew: freshSet.has(cardId),
    }))

    return this.queue
  }

  next(): QueueSlot | null {
    const queue = this.build()
    return this.cursor < queue.length ? (queue[this.cursor++] ?? null) : null
  }

  size(): number {
    return Math.max(0, this.build().length - this.cursor)
  }

  total(): number {
    return this.build().length
  }

  /**
   * `again` means the card comes back — but only twice per session, and only
   * within the session. The schedule is always written: a failure is real
   * information about the card, and withholding it would let a user farm
   * `again`s to keep a card out of tomorrow's queue.
   */
  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return SpacedRepetitionSource.verdict(grade, attempts)
  }

  /**
   * The same rule, reachable without a built queue.
   *
   * Grading happens one request at a time and has no session-wide queue in
   * memory — it has a row in `study_session_cards` and a grade. Exposing the
   * decision statically lets that path ask the source what a grade means without
   * constructing an instance around empty candidate lists, which would read as
   * though the queue mattered here when it does not.
   */
  static verdict(grade: Grade, attempts: number): GradeVerdict {
    return { requeue: shouldRequeue(grade, attempts), reschedule: true, record: true }
  }
}

/**
 * A card from a whole-set pool.
 *
 * Distinct from {@link CandidateCard}: the two new modes do not rank by due date
 * or lapses at all, so carrying `dueAt`/`lapses` here would be four fields of
 * scheduling state that nothing in these sources reads.
 */
export interface PoolCard {
  cardId: string
  studySetId: string
  createdAt: Date
}

/** Creation order, tie-broken on id so the same pool always builds the same queue. */
function byCreation(a: PoolCard, b: PoolCard): number {
  const delta = a.createdAt.getTime() - b.createdAt.getTime()
  if (delta !== 0) return delta
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0
}

/** Walks a fixed list of card ids. Shared by all three whole-set sources. */
abstract class FixedQueueSource implements CardSource {
  abstract readonly kind: SessionMode

  protected queue: QueueSlot[] | null = null
  private cursor = 0

  abstract build(): QueueSlot[]

  next(): QueueSlot | null {
    const queue = this.build()
    return this.cursor < queue.length ? (queue[this.cursor++] ?? null) : null
  }

  size(): number {
    return Math.max(0, this.build().length - this.cursor)
  }

  total(): number {
    return this.build().length
  }

  abstract onGraded(cardId: string, grade: Grade, attempts: number): GradeVerdict

  /**
   * `isNew` is false for every card in a whole-set pool.
   *
   * The flag drives a "first time seeing this" badge, and a drill over an entire
   * set says nothing about whether the user has met a given card — it did not
   * consult `card_schedules` to build the queue.
   */
  protected toSlots(cardIds: readonly string[]): QueueSlot[] {
    return cardIds.map((cardId, position) => ({ cardId, position, isNew: false }))
  }
}

/**
 * Every card in the set, in the order they were written.
 *
 * The point is learning a set the way its author laid it out — chapter order,
 * argument order, chronology. That is also its weakness, which is what
 * {@link ShuffledSource} is for: sequence becomes a cue, and a card recalled
 * because it follows the last one was not really recalled.
 */
export class SequentialSource extends FixedQueueSource {
  readonly kind = 'sequential' as const

  constructor(private readonly options: { cards: readonly PoolCard[] }) {
    super()
  }

  build(): QueueSlot[] {
    this.queue ??= this.toSlots([...this.options.cards].sort(byCreation).map((c) => c.cardId))
    return this.queue
  }

  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return verdictFor('sequential', {
      grade,
      attempts,
      hadEmptyBlank: false,
      isDue: false,
      correct: grade !== 'again',
    })
  }
}

/**
 * Every card in the set, randomised.
 *
 * Sorted before shuffling so an all-zero test `rng` has something deterministic
 * to permute — the sort costs nothing and makes the ordering tests pinnable.
 */
export class ShuffledSource extends FixedQueueSource {
  readonly kind = 'shuffled' as const

  constructor(private readonly options: { cards: readonly PoolCard[]; rng?: Rng }) {
    super()
  }

  build(): QueueSlot[] {
    this.queue ??= this.toSlots(
      shuffle(
        [...this.options.cards].sort(byCreation).map((c) => c.cardId),
        this.options.rng,
      ),
    )
    return this.queue
  }

  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return verdictFor('shuffled', {
      grade,
      attempts,
      hadEmptyBlank: false,
      isDue: false,
      correct: grade !== 'again',
    })
  }
}

/**
 * The cards a prior session left blank, in that session's presentation order.
 *
 * Handed ids rather than rows because the ordering decision was already made —
 * re-sorting here would present the retake in a different order than the pass
 * it is finishing, for no gain.
 */
export class RetakeSource extends FixedQueueSource {
  readonly kind = 'retake' as const

  constructor(private readonly options: { cards: readonly string[] }) {
    super()
  }

  build(): QueueSlot[] {
    this.queue ??= this.toSlots(this.options.cards)
    return this.queue
  }

  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return verdictFor('retake', {
      grade,
      attempts,
      hadEmptyBlank: false,
      isDue: false,
      correct: grade !== 'again',
    })
  }
}

/** Everything a mode needs to decide what a graded answer means. */
export interface GradeInput {
  grade: Grade
  /** Attempts *including* this one. */
  attempts: number
  /** At least one blank was submitted empty. */
  hadEmptyBlank: boolean
  /** The card's schedule was due on or before today — false for a card with no schedule row. */
  isDue: boolean
  correct: boolean
}

/**
 * What a grade means, per mode.
 *
 * A lookup table rather than a chain of `if (mode === …)` through the grading
 * transaction. Grading holds a session row and a grade, not a built queue, so it
 * cannot ask a source instance — and constructing one around empty card lists
 * just to reach `onGraded` would read as though the queue mattered here.
 *
 * The rules, and why:
 *
 * - **A blank never requeues** in the two new modes. It goes to the retake list
 *   instead, which is the whole feature: an unanswered card is a different thing
 *   from a wrong one and gets a different offer.
 * - **Sequential never reschedules.** Walking a set in order means the sequence
 *   is carrying part of the recall, so the result is not honest evidence about
 *   any single card.
 * - **Shuffled reschedules a *due* card either way, and a not-due card only when
 *   it was answered correctly.** Studying ahead should be able to earn a longer
 *   interval and must never be able to reset one — otherwise drilling a set the
 *   day before an exam would drop every card in it back to a one-day interval.
 * - **Retake decides nothing at all.** The blank was already graded and counted
 *   when the user left it blank.
 */
export function verdictFor(mode: SessionMode, input: GradeInput): GradeVerdict {
  const { grade, attempts, hadEmptyBlank, isDue, correct } = input
  const requeue = !hadEmptyBlank && shouldRequeue(grade, attempts)

  switch (mode) {
    case 'spaced':
      return { requeue: shouldRequeue(grade, attempts), reschedule: true, record: true }
    case 'sequential':
      return { requeue, reschedule: false, record: true }
    case 'shuffled':
      return { requeue, reschedule: isDue || correct, record: true }
    case 'retake':
      return { requeue: false, reschedule: false, record: false }
    default: {
      const exhaustive: never = mode
      throw new Error(`Unknown study mode: ${String(exhaustive)}`)
    }
  }
}

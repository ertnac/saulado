import type { Grade } from '@saulado/shared'
import { compareDue, interleaveNew, shouldRequeue, type QueueEntry } from '@saulado/shared'

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
   * False for cramming: a 2am panic session should not tell the scheduler the
   * user has learned anything durable.
   */
  reschedule: boolean
}

export interface CardSource {
  /** Identifies the source in the session row and in logs. */
  readonly kind: string
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
  readonly kind = 'spaced-repetition'

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
    return { requeue: shouldRequeue(grade, attempts), reschedule: true }
  }
}

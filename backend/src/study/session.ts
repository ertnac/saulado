import type {
  DayKey,
  SessionSummary,
  StudySession,
  UserSettings,
  SessionMode,
  StartableMode,
} from '@saulado/shared'
import { cardLabel, codeToGrade, dayKeyToDate } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { ApiError } from '../http/errors.js'
import { subtreeIds } from '../routes/set-tree.js'
import {
  SpacedRepetitionSource,
  RetakeSource,
  SequentialSource,
  ShuffledSource,
  type CardSource,
  type CandidateCard,
} from './card-source.js'
import { loadRetakePool, loadSetPool } from './pool.js'
import { readProgress } from './grading.js'
import { loadSessionCards } from './render.js'
import { loadSettings, todayFor } from './settings.js'

/**
 * The session lifecycle: start, resume, finish.
 *
 * A session is persisted rather than held in memory because the client cannot be
 * trusted to survive. Phones background tabs, browsers reload, users close the
 * laptop mid-card. Plan §4.2 asks for interruption recovery, and the only way to
 * resume a queue is to have written it down — a queue rebuilt on reload would
 * reorder under the user and re-serve cards they had already answered.
 */

/**
 * Starts a session, or returns the one already in progress.
 *
 * Returning the existing session rather than creating a second is deliberate.
 * Two open sessions over the same cards would double-count the daily cap, and
 * the "resume where you left off" affordance would have to guess which one the
 * user meant.
 */
export interface StartSessionOptions {
  studySetId?: string
  mode: StartableMode
  retakeOf?: string
}

export async function startSession(
  userId: string,
  options: StartSessionOptions,
  now: Date,
): Promise<StudySession> {
  const settings = await loadSettings(userId)
  const mode: SessionMode = options.retakeOf ? 'retake' : options.mode

  /**
   * A retake resolves its pool and its set before anything else.
   *
   * The set has to come from the session being retaken rather than from the
   * request: the retake prompt is offered from a summary screen that may have
   * been left open across a navigation, and taking the set from the prior
   * session is the only reading that cannot disagree with the cards.
   */
  const retake = options.retakeOf ? await loadRetakePool(userId, options.retakeOf) : null

  if (retake && retake.cardIds.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Nothing was left blank in that session.')
  }

  const studySetId = retake ? (retake.studySetId ?? undefined) : options.studySetId

  const existing = await prisma.studySession.findFirst({
    where: { userId, completedAt: null, studySetId: studySetId ?? null, mode },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  })

  if (existing) {
    const resumed = await getSession(userId, existing.id)

    // (docblock unchanged — an open session with an empty queue is spent, not
    // resumable. See the original comment, which stays exactly as it is.)
    if (resumed.queue.length > 0) return resumed

    await prisma.studySession.update({
      where: { id: existing.id },
      data: { completedAt: now },
    })
  }

  if (studySetId) {
    const set = await prisma.studySet.findFirst({
      where: { id: studySetId, userId },
      select: { id: true },
    })
    if (!set) throw new ApiError('NOT_FOUND', 'That study set could not be found.')
  }

  const source = await buildSource(userId, { ...options, mode, studySetId }, retake, settings, now)
  const slots = source.build()

  if (slots.length === 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'This set has no cards to study yet. Add cards with blanks to begin.',
    )
  }

  const session = await prisma.studySession.create({
    data: {
      userId,
      studySetId: studySetId ?? null,
      mode,
      startedAt: now,
      cards: {
        create: slots.map((slot) => ({
          cardId: slot.cardId,
          position: slot.position,
          isNew: slot.isNew,
        })),
      },
    },
    select: { id: true },
  })

  return getSession(userId, session.id)
}

/**
 * Picks the source for a mode.
 *
 * A switch here rather than in the route, so the route stays what it is today:
 * resolve the caller, read the clock, hand off. Only `spaced` consults the
 * scheduler — the two drill modes deliberately skip the daily cap and the
 * new-card interleave, because a user who asked to study a set asked for the
 * set, not for the scheduler's opinion of it.
 */
async function buildSource(
  userId: string,
  options: Omit<StartSessionOptions, 'mode'> & { mode: SessionMode },
  retake: { cardIds: string[] } | null,
  settings: UserSettings,
  now: Date,
): Promise<CardSource> {
  if (options.mode === 'retake') {
    return new RetakeSource({ cards: retake?.cardIds ?? [] })
  }

  if (options.mode === 'sequential' || options.mode === 'shuffled') {
    // The schema guarantees a set id for these two modes.
    const cards = await loadSetPool(userId, options.studySetId ?? '')
    return options.mode === 'sequential'
      ? new SequentialSource({ cards })
      : new ShuffledSource({ cards })
  }

  const today = todayFor(settings, now)
  const { due, fresh } = await loadCandidates(userId, options.studySetId, today)

  return new SpacedRepetitionSource({
    due,
    fresh,
    newCardsPerDay: settings.newCardsPerDay,
    dailyCap: dailyCapFor(settings),
    reviewsToday: await countReviewsToday(userId, today),
    allowReviewAhead: true,
  })
}

/**
 * Candidate cards for a queue.
 *
 * `answers: { some: {} }` is the load-bearing filter. Phase 3 lets a card be
 * saved with no highlights yet ("highlighting can come later"), and `gradeCard`
 * grades an empty card `again` — so an unhighlighted card in the queue is a
 * permanent failure loop the user cannot escape by knowing the material.
 *
 * **A set by id means its whole subtree.** "Study this chapter" has to cover its
 * sections, or a parent holding nothing directly reads as having nothing to
 * study while its children hold forty cards. `subtreeIds` is already user-scoped,
 * which is why the `set: { userId }` term is absent from that branch.
 *
 * Archived sets are excluded from an all-sets sweep but *not* from a session the
 * user asked for by id — and that now extends down the subtree: an archived child
 * inside an explicitly-requested parent is included. Archiving exists to get a
 * set out of the way, so leaving its cards in the daily queue would mean the one
 * thing archiving promises never happens; asking for the parent by id is an
 * explicit override, and mirrors the library, where an archived set is hidden
 * from the list but still opens.
 */
async function loadCandidates(
  userId: string,
  studySetId: string | undefined,
  today: DayKey,
): Promise<{ due: CandidateCard[]; fresh: CandidateCard[]; isReviewAhead: boolean }> {
  const scope = {
    ...(studySetId
      ? { studySetId: { in: await subtreeIds(userId, studySetId) } }
      : { set: { userId, archivedAt: null } }),
    answers: { some: {} },
  }

  const [dueRows, freshRows] = await Promise.all([
    prisma.studyCard.findMany({
      where: {
        ...scope,
        schedules: { some: { userId, dueAt: { lte: dayKeyToDate(today) } } },
      },
      select: {
        id: true,
        studySetId: true,
        schedules: { where: { userId }, select: { dueAt: true, lapses: true } },
      },
    }),
    prisma.studyCard.findMany({
      // `none` rather than a left join: a card is new when *this user* has no
      // schedule row for it. Scoping by userId matters once sets are shareable.
      where: { ...scope, schedules: { none: { userId } } },
      select: { id: true, studySetId: true },
    }),
  ])

  // If there are no due cards and no unstudied cards, pull all cards in the scope so the user can review them anytime!
  if (dueRows.length === 0 && freshRows.length === 0) {
    const allRows = await prisma.studyCard.findMany({
      where: scope,
      select: {
        id: true,
        studySetId: true,
        schedules: { where: { userId }, select: { dueAt: true, lapses: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return {
      due: allRows.map((row) => ({
        cardId: row.id,
        studySetId: row.studySetId,
        dueAt: row.schedules[0]?.dueAt ?? null,
        lapses: row.schedules[0]?.lapses ?? 0,
      })),
      fresh: [],
      isReviewAhead: true,
    }
  }

  return {
    due: dueRows.map((row) => ({
      cardId: row.id,
      studySetId: row.studySetId,
      dueAt: row.schedules[0]?.dueAt ?? null,
      lapses: row.schedules[0]?.lapses ?? 0,
    })),
    fresh: freshRows.map((row) => ({
      cardId: row.id,
      studySetId: row.studySetId,
      dueAt: null,
      lapses: 0,
    })),
    isReviewAhead: false,
  }
}

/**
 * The review cap for one day.
 *
 * The goal is a target, not a ceiling — a user who sets 20 and has 60 due should
 * be able to clear the backlog. The cap exists to keep a 400-card import from
 * rendering as an unfinishable wall, so it sits well above the goal.
 */
function dailyCapFor(settings: UserSettings): number {
  return Math.max(settings.dailyGoal * 5, 100)
}

async function countReviewsToday(userId: string, today: DayKey): Promise<number> {
  const stats = await prisma.userDailyStats.findUnique({
    where: { userId_day: { userId, day: dayKeyToDate(today) } },
    select: { reviewsCount: true },
  })

  return stats?.reviewsCount ?? 0
}

/**
 * Reads a session for resuming.
 *
 * `queue` holds only what is *left* — rows with no `answeredAt`, in position
 * order. A re-queued card reappears here because grading moved its position
 * without setting `answeredAt`, so a resume picks it up exactly where the
 * in-session retry had put it.
 */
export async function getSession(userId: string, sessionId: string): Promise<StudySession> {
  const settings = await loadSettings(userId)

  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: {
      id: true,
      studySetId: true,
      mode: true,
      startedAt: true,
      completedAt: true,
      cards: {
        where: { answeredAt: null },
        orderBy: { position: 'asc' },
        select: { cardId: true, isNew: true },
      },
    },
  })

  if (!session) throw new ApiError('NOT_FOUND', 'That study session could not be found.')

  const [queue, progress] = await Promise.all([
    loadSessionCards(session.cards, userId, settings.blankWidthMode),
    readProgress(prisma, session.id),
  ])

  return {
    id: session.id,
    studySetId: session.studySetId,
    mode: session.mode,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    queue,
    progress,
  }
}

/**
 * Finishes a session and returns its summary.
 *
 * Idempotent: completing an already-complete session returns the same summary
 * rather than erroring. The client calls this when the queue empties, and a
 * retry after a dropped response must not turn a finished session into a 400.
 */
export async function completeSession(
  userId: string,
  sessionId: string,
  now: Date,
): Promise<SessionSummary> {
  const settings = await loadSettings(userId)

  const existing = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, completedAt: true },
  })

  if (!existing) throw new ApiError('NOT_FOUND', 'That study session could not be found.')

  if (!existing.completedAt) {
    await prisma.studySession.update({
      where: { id: sessionId },
      data: { completedAt: now },
    })
  }

  return buildSummary(userId, sessionId, settings, now)
}

async function buildSummary(
  userId: string,
  sessionId: string,
  settings: UserSettings,
  now: Date,
): Promise<SessionSummary> {
  const session = await prisma.studySession.findFirstOrThrow({
    where: { id: sessionId, userId },
    select: {
      id: true,
      mode: true,
      startedAt: true,
      completedAt: true,
      cards: {
        where: { answeredAt: { not: null } },
        orderBy: { position: 'asc' },
        // The paragraph is selected only to derive a label from, and the set id
        // only to link to — see the `.map` below. Sending the paragraphs
        // themselves would be both far more bytes than the summary renders and
        // the answers' surrounding context arriving after the user has already
        // been graded on it.
        select: {
          cardId: true,
          grade: true,
          correct: true,
          hadEmptyBlank: true,
          card: { select: { paragraph: true, studySetId: true } },
        },
      },
    },
  })

  const completedAt = session.completedAt ?? now
  const cardsSeen = session.cards.length
  const correctCards = session.cards.filter((card) => card.correct === true).length

  const today = todayFor(settings, now)
  const stats = await prisma.userDailyStats.findUnique({
    where: { userId_day: { userId, day: dayKeyToDate(today) } },
    select: { reviewsCount: true, goalMet: true },
  })

  return {
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    cardsSeen,
    correctCards,
    // Guarded rather than computed blind: a session completed with nothing
    // answered would otherwise report `NaN`, which renders as "NaN%".
    accuracy: cardsSeen === 0 ? 0 : correctCards / cardsSeen,
    durationMs: Math.max(0, completedAt.getTime() - session.startedAt.getTime()),
    toRevisit: session.cards
      .filter((card) => {
        const grade = card.grade === null ? null : codeToGrade(card.grade)
        return grade === 'again' || grade === 'hard'
      })
      .map((card) => ({
        cardId: card.cardId,
        studySetId: card.card.studySetId,
        label: cardLabel(card.card.paragraph),
      })),
    mode: session.mode,
    /**
     * Cards left blank, offered back as a retake.
     *
     * Filtered from the rows already in hand rather than queried again — the
     * summary has every answered card of the session loaded for `toRevisit`.
     *
     * A retake session reports none: nothing it does is recorded, so a second
     * retake would be a pass over a pass, and the offer would never stop.
     */
    unanswered:
      session.mode === 'retake'
        ? []
        : session.cards
            .filter((card) => card.hadEmptyBlank)
            .map((card) => ({
              cardId: card.cardId,
              studySetId: card.card.studySetId,
              label: cardLabel(card.card.paragraph),
            })),
    reviewsToday: stats?.reviewsCount ?? 0,
    dailyGoal: settings.dailyGoal,
    goalMet: stats?.goalMet ?? false,
  }
}

export { buildSummary, dailyCapFor, loadCandidates }

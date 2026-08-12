import type { Prisma } from '@prisma/client'
import type { AnswerResponse, BlankResult, Grade, SubmitAnswerRequest } from '@saulado/shared'
import {
  LEECH_THRESHOLD,
  calculateNextReview,
  checkAnswers,
  dayKeyInZone,
  dayKeyToDate,
  gradeCard,
  gradeToCode,
  isCardCorrect,
  requeuePosition,
} from '@saulado/shared'
import { prisma } from '../db/client.js'
import { ApiError } from '../http/errors.js'
import { verdictFor } from './card-source.js'
import { loadSettings } from './settings.js'

/**
 * Grading one card.
 *
 * Two properties this module exists to hold:
 *
 * **Grading is server-side.** The answers are read here and compared here; the
 * client sends what the user typed and is told the verdict. Grading in the
 * browser would mean shipping the answer key to be checked against, and the leak
 * would be invisible in the UI — see `shared/src/study/types.ts`.
 *
 * **One review is one transaction.** A review touches four tables:
 * `card_schedules` (overwritten), `reviews` (appended), `user_daily_stats`
 * (incremented) and `study_session_cards` (advanced). A partial write here is
 * not a lost update, it is a *wrong* one — a schedule pushed to next month with
 * no review row means the card silently vanishes from the queue and the user's
 * accuracy is computed from a log missing an entry. All four move together or
 * none do.
 */

export interface GradeContext {
  userId: string
  sessionId: string
  body: SubmitAnswerRequest
  now: Date
}

export async function submitAnswer(context: GradeContext): Promise<AnswerResponse> {
  const settings = await loadSettings(context.userId)
  const todayKey = dayKeyInZone(context.now, settings.timezone)
  const today = dayKeyToDate(todayKey)

  return prisma.$transaction(async (tx) => {
    const session = await tx.studySession.findFirst({
      where: { id: context.sessionId, userId: context.userId },
      select: { id: true, completedAt: true, mode: true },
    })

    // 404 rather than 403 for someone else's session, as everywhere else — a 403
    // confirms the row exists, which is all id enumeration needs.
    if (!session) throw new ApiError('NOT_FOUND', 'That study session could not be found.')
    if (session.completedAt) {
      throw new ApiError('VALIDATION_ERROR', 'This session has already finished.')
    }

    const slot = await tx.studySessionCard.findUnique({
      where: { sessionId_cardId: { sessionId: session.id, cardId: context.body.cardId } },
    })

    if (!slot) throw new ApiError('NOT_FOUND', 'That card is not in this session.')

    /**
     * Idempotency, checked inside the transaction.
     *
     * A double-tap sends the same key twice; the second replays the stored
     * result and writes nothing. Checking here rather than before the
     * transaction is what makes it hold under a real race — two concurrent
     * requests carrying one key serialise on this row, so the loser sees the
     * winner's key rather than an empty column.
     */
    if (slot.idempotencyKey === context.body.idempotencyKey && slot.lastResult !== null) {
      return slot.lastResult as unknown as AnswerResponse
    }

    const card = await tx.studyCard.findFirst({
      where: { id: context.body.cardId, set: { userId: context.userId } },
      select: {
        id: true,
        answers: {
          orderBy: { ordinal: 'asc' },
          select: { ordinal: true, answerText: true, altAnswers: true },
        },
      },
    })

    if (!card) throw new ApiError('NOT_FOUND', 'That card could not be found.')

    const { results, grade, correct } = gradeSubmission(
      card.answers,
      context.body,
      settings.typoTolerance,
    )

    const hadEmptyBlank =
      context.body.revealed !== true && results.some((result) => result.submitted.trim() === '')

    const schedule = await tx.cardSchedule.findUnique({
      where: { userId_cardId: { userId: context.userId, cardId: card.id } },
      select: {
        easeFactor: true,
        intervalDays: true,
        repetitions: true,
        lapses: true,
        dueAt: true,
      },
    })

    const isDue = schedule ? schedule.dueAt <= today : false

    const outcome = calculateNextReview(
      grade,
      schedule
        ? {
            easeFactor: Number(schedule.easeFactor),
            interval: schedule.intervalDays,
            repetitions: schedule.repetitions,
            lapses: schedule.lapses,
          }
        : undefined,
      { now: context.now },
    )

    /**
     * The due day is derived in the user's zone, not truncated from the instant.
     *
     * `calculateNextReview` returns a `Date` — an instant `interval` days out.
     * Truncating that to a UTC day puts a card reviewed at 22:00 in Auckland on
     * the wrong calendar day, so "due tomorrow" arrives either today or the day
     * after depending on what hour the user happened to study.
     */
    const dueKey = dayKeyInZone(outcome.dueDate, settings.timezone)

    const scheduleData = {
      easeFactor: outcome.easeFactor,
      intervalDays: outcome.interval,
      repetitions: outcome.repetitions,
      lapses: outcome.lapses,
      dueAt: dayKeyToDate(dueKey),
      lastReviewedAt: context.now,
    }

    const attempts = slot.attempts + 1
    const verdict = verdictFor(session.mode, {
      grade,
      attempts,
      hadEmptyBlank,
      isDue,
      correct,
    })

    if (verdict.reschedule) {
      await tx.cardSchedule.upsert({
        where: { userId_cardId: { userId: context.userId, cardId: card.id } },
        create: { userId: context.userId, cardId: card.id, ...scheduleData },
        update: scheduleData,
      })
    }

    if (verdict.record) {
      await tx.review.create({
        data: {
          userId: context.userId,
          cardId: card.id,
          grade: gradeToCode(grade),
          blankResults: results as unknown as Prisma.InputJsonValue,
          durationMs: context.body.durationMs ?? null,
          reviewedAt: context.now,
        },
      })

      await upsertDailyStats(tx, {
        userId: context.userId,
        day: today,
        correct,
        dailyGoal: settings.dailyGoal,
      })
    }

    const queueLength = await tx.studySessionCard.count({ where: { sessionId: session.id } })

    await tx.studySessionCard.update({
      where: { id: slot.id },
      data: {
        attempts,
        hadEmptyBlank,
        ...(verdict.requeue
          ? { position: requeuePosition(slot.position, queueLength) }
          : { answeredAt: context.now, grade: gradeToCode(grade), correct }),
      },
    })

    const response: AnswerResponse = {
      results,
      grade,
      correct,
      dueAt: verdict.reschedule
        ? dueKey
        : schedule
          ? dayKeyInZone(schedule.dueAt, settings.timezone)
          : dueKey,
      intervalDays: outcome.interval,
      // Only the review that *crosses* the threshold reports it, so the notice
      // appears once rather than on every later failure of the same card.
      isLeech: outcome.isLeech && (schedule?.lapses ?? 0) < LEECH_THRESHOLD,
      requeued: verdict.requeue,
      progress: await readProgress(tx, session.id),
    }

    // Stored last, with the progress the caller is about to see, so a replayed
    // request reports the same `7 / 24` rather than a stale one.
    await tx.studySessionCard.update({
      where: { id: slot.id },
      data: {
        idempotencyKey: context.body.idempotencyKey,
        lastResult: response as unknown as Prisma.InputJsonValue,
      },
    })

    return response
  })
}

/**
 * Aligns submissions to the card's blanks and grades them.
 *
 * Matched by `ordinal`, never by array position: a client that omits an
 * untouched blank, or sends them out of order, must not have its answers checked
 * against the wrong ones. A missing blank becomes `''`, which `checkAnswer`
 * never counts as correct.
 */
export function gradeSubmission(
  answers: readonly { ordinal: number; answerText: string; altAnswers: string[] }[],
  body: Pick<SubmitAnswerRequest, 'blanks' | 'revealed'>,
  typoTolerance: boolean,
): { results: BlankResult[]; grade: Grade; correct: boolean } {
  const submitted = new Map(body.blanks.map((blank) => [blank.ordinal, blank.submitted]))
  const revealed = body.revealed === true

  // A reveal is not a submission. Whatever sits in the inputs is discarded, so a
  // filled-in blank cannot ride along with the escape hatch and inflate the
  // schedule (plan §4.2).
  const inputs = answers.map((answer) => (revealed ? '' : (submitted.get(answer.ordinal) ?? '')))
  const checks = checkAnswers(inputs, answers, { typoTolerance })

  const results: BlankResult[] = answers.map((answer, index) => ({
    ordinal: answer.ordinal,
    submitted: inputs[index] ?? '',
    correct: checks[index]?.correct ?? false,
    matchType: checks[index]?.matchType ?? 'wrong',
    canonical: checks[index]?.canonical ?? answer.answerText,
  }))

  return {
    results,
    grade: revealed ? 'again' : gradeCard(checks),
    // `isCardCorrect` rather than `grade === 'good'`: the definition of a
    // correct card lives in shared, and a second one here would drift.
    correct: !revealed && isCardCorrect(checks),
  }
}

/**
 * The daily rollup, incremented in the same transaction as the review.
 *
 * `goalMet` is latched, never recomputed downward. It needs a second statement
 * because the increment above cannot compare against its own result — and it is
 * only ever set true, so lowering tomorrow's goal cannot retract a day the user
 * already earned.
 */
async function upsertDailyStats(
  tx: Prisma.TransactionClient,
  input: { userId: string; day: Date; correct: boolean; dailyGoal: number },
): Promise<void> {
  const key = { userId_day: { userId: input.userId, day: input.day } }

  const stats = await tx.userDailyStats.upsert({
    where: key,
    create: {
      userId: input.userId,
      day: input.day,
      reviewsCount: 1,
      correctCount: input.correct ? 1 : 0,
      goalMet: input.dailyGoal <= 1,
    },
    update: {
      reviewsCount: { increment: 1 },
      correctCount: input.correct ? { increment: 1 } : undefined,
    },
    select: { reviewsCount: true, goalMet: true },
  })

  if (!stats.goalMet && stats.reviewsCount >= input.dailyGoal) {
    await tx.userDailyStats.update({ where: key, data: { goalMet: true } })
  }
}

/**
 * Progress, read from the session rows rather than counted in memory.
 *
 * `total` counts every row; `answered` counts only rows with `answeredAt`, so a
 * card re-queued for another attempt is not counted yet. That is what keeps
 * `7 / 24` monotonic — an `again` neither advances the numerator nor grows the
 * denominator, and one card seen twice cannot push the count past the total.
 */
export async function readProgress(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<AnswerResponse['progress']> {
  const [total, answered, correct] = await Promise.all([
    tx.studySessionCard.count({ where: { sessionId } }),
    tx.studySessionCard.count({ where: { sessionId, answeredAt: { not: null } } }),
    tx.studySessionCard.count({ where: { sessionId, correct: true } }),
  ])

  return { answered, total, correct }
}

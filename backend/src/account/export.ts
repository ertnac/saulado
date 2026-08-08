import type {
  DataExport,
  ExportedCard,
  ExportedDayStat,
  ExportedReview,
  ExportedSchedule,
  ExportedSet,
} from '@saulado/shared'
import { DEFAULT_SET_COLOR, GRADE_CODES, dateToDayKey, isSetColor } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { toPublicSettings, toPublicUser } from '../auth/session.js'
import { ApiError } from '../http/errors.js'
import { DEFAULT_SETTINGS } from '../study/settings.js'

/**
 * Building the full data export (plan §6.5).
 *
 * Assembled in memory and returned whole rather than streamed. That is a
 * deliberate ceiling: a user with 10,000 cards produces a few megabytes, which
 * is fine, and a user with a million produces something no browser wants to be
 * handed anyway. If the library sizes here ever justify it, the fix is NDJSON
 * streaming per table — but building that now would be guessing at a shape
 * nobody has hit.
 *
 * Everything is fetched scoped by `userId`. There is no join here that could
 * reach another user's rows, which matters more in this file than in most:
 * an export bug does not throw, it silently hands one user another user's notes.
 */

/** Every blank right — the same predicate `grading.ts` and `progress.ts` use. */
const CORRECT_GRADE_FLOOR: number = GRADE_CODES.good

export async function buildExport(userId: string): Promise<DataExport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { settings: true },
  })

  /**
   * `GET /export` takes no password, so it has no `reauthenticate` in front of
   * it to notice a deleted account first. `requireAuth` only checks a signature,
   * so a token can outlive its row — and `findUniqueOrThrow` would turn that
   * into a 500 for what is really an expired credential.
   */
  if (!user) throw new ApiError('TOKEN_INVALID', 'That account no longer exists.')

  const sets = await loadSets(userId)

  const [reviews, dailyStats] = await Promise.all([
    prisma.review.findMany({
      where: { userId },
      orderBy: { reviewedAt: 'asc' },
      select: { cardId: true, grade: true, reviewedAt: true, durationMs: true },
    }),
    prisma.userDailyStats.findMany({
      where: { userId },
      orderBy: { day: 'asc' },
      select: { day: true, reviewsCount: true, correctCount: true, goalMet: true },
    }),
  ])

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    account: toPublicUser(user),
    settings: user.settings ? toPublicSettings(user.settings) : DEFAULT_SETTINGS,
    sets: sets.map(toExportedSet),
    reviews: reviews.map((review): ExportedReview => ({
      cardId: review.cardId,
      grade: review.grade,
      /**
       * Derived, not stored — there is no `reviews.correct` column. Writing
       * the boolean out anyway means an importer or a spreadsheet does not
       * have to know that `2` means "got it right", which is knowledge that
       * lives in this codebase and nowhere in the file.
       */
      correct: review.grade >= CORRECT_GRADE_FLOOR,
      reviewedAt: review.reviewedAt.toISOString(),
      durationMs: review.durationMs,
    })),
    dailyStats: dailyStats.map((stat): ExportedDayStat => ({
      // A DATE comes back as UTC midnight; the calendar day is what was
      // stored, so read the UTC components rather than the local ones.
      day: dateToDayKey(stat.day),
      reviews: stat.reviewsCount,
      correct: stat.correctCount,
      goalMet: stat.goalMet,
    })),
  }
}

/**
 * Sets, cards, answers and schedules in one query.
 *
 * The nesting is Prisma's, not a hand-rolled join, so a card can only ever
 * appear under its own set. `schedules` is filtered by `userId` even though the
 * cards already belong to this user: a schedule row is keyed by (user, card),
 * and a shared-sets feature would make the unfiltered version leak another
 * user's review state through their copy of the card.
 *
 * A named function rather than an inline call so the row types below can be
 * derived from it. Deriving beats restating them: the include shape and the
 * types that describe it cannot drift apart if there is only one of each.
 */
function loadSets(userId: string) {
  return prisma.studySet.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: {
      cards: {
        orderBy: { createdAt: 'asc' },
        include: {
          answers: { orderBy: { ordinal: 'asc' } },
          schedules: { where: { userId } },
        },
      },
    },
  })
}

type SetWithCards = Awaited<ReturnType<typeof loadSets>>[number]
type CardWithRelations = SetWithCards['cards'][number]

function toExportedSet(set: SetWithCards): ExportedSet {
  return {
    id: set.id,
    title: set.title,
    description: set.description,
    // The column is TEXT; narrow it back to the union on the way out, falling
    // back rather than emitting a value the type says cannot exist.
    color: isSetColor(set.color) ? set.color : DEFAULT_SET_COLOR,
    archivedAt: set.archivedAt?.toISOString() ?? null,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    cards: set.cards.map(toExportedCard),
  }
}

function toExportedCard(card: CardWithRelations): ExportedCard {
  const schedule = card.schedules[0]

  return {
    id: card.id,
    title: card.title,
    paragraph: card.paragraph,
    answers: card.answers.map((answer) => ({
      // `id` is in the contract because `ordinal` is a position, not an
      // identity: re-importing a card whose blanks were reordered needs
      // something stable to match on, and nothing else here is.
      id: answer.id,
      startOffset: answer.startOffset,
      endOffset: answer.endOffset,
      answerText: answer.answerText,
      altAnswers: answer.altAnswers,
      ordinal: answer.ordinal,
    })),
    tags: card.tags,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    schedule: schedule ? toExportedSchedule(schedule) : null,
  }
}

function toExportedSchedule(schedule: CardWithRelations['schedules'][number]): ExportedSchedule {
  return {
    dueAt: dateToDayKey(schedule.dueAt),
    intervalDays: schedule.intervalDays,
    /**
     * `Number`, because `ease_factor` is `DECIMAL(3,2)` and Prisma hands it back
     * as a `Decimal` object. `JSON.stringify` would render it as
     * `{"s":1,"e":0,"d":[2,5]}` — internal representation, not a number, and an
     * importer reading it back would get nonsense.
     */
    easeFactor: Number(schedule.easeFactor),
    repetitions: schedule.repetitions,
    lapses: schedule.lapses,
    lastReviewedAt: schedule.lastReviewedAt?.toISOString() ?? null,
  }
}

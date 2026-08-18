import { Router } from 'express'
import type { CardResponse, CardsResponse, TagsResponse } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { sendError } from '../http/errors.js'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateBody, validateQuery } from '../http/validate.js'
import {
  createCardSchema,
  listCardsQuerySchema,
  updateCardSchema,
  type CreateCardBody,
  type ListCardsQuery,
  type UpdateCardBody,
} from './cards.schemas.js'
import {
  decodeCursor,
  deriveAnswers,
  findOwnedCard,
  findOwnedSet,
  keysetWhere,
  requireUserId,
  sendNotFound,
  toPage,
  toStudyCard,
  toStudyCardSummary,
} from './cards.shared.js'

/**
 * Cards hang off sets, and sets belong to users, so ownership is always one join
 * away: `where: { set: { userId } }`. Every route here is authenticated.
 */
export const cardsRouter: Router = Router()
cardsRouter.use(requireAuth)

const cardInclude = {
  answers: { orderBy: { ordinal: 'asc' } },
} as const

const summarySelect = {
  id: true,
  studySetId: true,
  paragraph: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { answers: true } },
} as const

// ── List cards in a set ─────────────────────────────────────────────────────

/**
 * Mounted under `/api/sets/:setId/cards`. Nested because a card list is only
 * ever meaningful within a set, and the nesting makes the ownership check
 * unavoidable rather than optional.
 */
export const setCardsRouter: Router = Router({ mergeParams: true })
setCardsRouter.use(requireAuth)

setCardsRouter.get(
  '/',
  validateQuery(listCardsQuerySchema),
  asyncHandler(async (req, res) => {
    const { cursor, limit, tag } = req.query as unknown as ListCardsQuery
    const setId = req.params.setId ?? ''

    // Ownership is checked before the list query rather than folded into it, so
    // "someone else's set" and "your set, no cards" stay distinguishable — the
    // first is a 404, the second an empty page.
    if (!(await findOwnedSet(setId, requireUserId(req)))) {
      sendNotFound(res, 'set')
      return
    }

    const decoded = cursor ? decodeCursor(cursor) : null
    if (cursor && !decoded) {
      sendError(res, 'VALIDATION_ERROR', 'That page link is no longer valid.')
      return
    }

    const rows = await prisma.studyCard.findMany({
      where: {
        studySetId: setId,
        // `hasEvery`, not `hasSome`: multiple tags narrow the list rather than
        // widening it. Served by the GIN index via `@>`.
        ...(tag.length > 0 ? { tags: { hasEvery: tag } } : {}),
        ...(decoded ? keysetWhere(decoded, 'createdAt') : {}),
      },
      select: summarySelect,
      // Newest first, matching idx_cards_set. A card just added should be at the
      // top, where the user is looking for it.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const page = toPage(rows, limit, (row) => row.createdAt)
    const body: CardsResponse = {
      items: page.items.map(toStudyCardSummary),
      nextCursor: page.nextCursor,
    }

    res.json(body)
  }),
)

// ── Create a card ───────────────────────────────────────────────────────────

setCardsRouter.post(
  '/',
  validateBody(createCardSchema),
  asyncHandler(async (req, res) => {
    const { paragraph, answers, tags } = req.body as CreateCardBody
    const setId = req.params.setId ?? ''

    const derived = deriveAnswers(paragraph, answers)
    if ('error' in derived) {
      sendError(res, 'VALIDATION_ERROR', derived.error, { fields: { answers: derived.error } })
      return
    }

    const card = await prisma.$transaction(async (tx) => {
      const set = await tx.studySet.findFirst({
        where: { id: setId, userId: requireUserId(req) },
        select: { id: true },
      })
      if (!set) return null

      return tx.studyCard.create({
        data: {
          studySetId: setId,
          paragraph,
          tags: tags ?? [],
          answers: { create: derived.answers },
        },
        include: cardInclude,
      })
    })

    if (!card) {
      sendNotFound(res, 'set')
      return
    }

    const body: CardResponse = { card: toStudyCard(card) }
    res.status(201).json(body)
  }),
)

// ── Read one card ───────────────────────────────────────────────────────────

cardsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const card = await prisma.studyCard.findFirst({
      where: { id: req.params.id, set: { userId: requireUserId(req) } },
      include: cardInclude,
    })

    if (!card) {
      sendNotFound(res, 'card')
      return
    }

    const body: CardResponse = { card: toStudyCard(card) }
    res.json(body)
  }),
)

// ── Update a card ───────────────────────────────────────────────────────────

cardsRouter.patch(
  '/:id',
  validateBody(updateCardSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as UpdateCardBody
    const cardId = req.params.id ?? ''
    const userId = requireUserId(req)

    const existing = await findOwnedCard(cardId, userId)
    if (!existing) {
      sendNotFound(res, 'card')
      return
    }

    // A move must land in a set the caller also owns, or a card could be pushed
    // into someone else's library.
    if (body.studySetId && body.studySetId !== existing.studySetId) {
      if (!(await findOwnedSet(body.studySetId, userId))) {
        sendNotFound(res, 'set')
        return
      }
    }

    /**
     * The paragraph and its blanks are replaced together or not at all — the
     * schema enforces that they arrive as a pair. Re-anchoring happened
     * client-side so the user could resolve orphans first; here the answers are
     * re-derived from scratch against the new paragraph, so a stale offset
     * becomes a validation error rather than stored corruption.
     */
    const rewriting = 'paragraph' in body && 'answers' in body
    let derivedAnswers: Awaited<ReturnType<typeof deriveAnswers>> | null = null

    if (rewriting) {
      const paragraph = body.paragraph ?? ''
      derivedAnswers = deriveAnswers(paragraph, body.answers ?? [])

      if ('error' in derivedAnswers) {
        sendError(res, 'VALIDATION_ERROR', derivedAnswers.error, {
          fields: { answers: derivedAnswers.error },
        })
        return
      }
    }

    const card = await prisma.$transaction(async (tx) => {
      await tx.studyCard.update({
        where: { id: cardId },
        data: {
          ...('tags' in body ? { tags: body.tags ?? [] } : {}),
          ...(body.studySetId ? { studySetId: body.studySetId } : {}),
          ...(rewriting ? { paragraph: body.paragraph } : {}),
        },
      })

      if (derivedAnswers && 'answers' in derivedAnswers) {
        /**
         * Delete-then-recreate rather than diffing. Answer rows carry no state
         * of their own — no review history hangs off them (Phase 4 keys reviews
         * to the card) — so a diff would be more code for the same result. It
         * also sidesteps the `(card_id, ordinal)` uniqueness constraint, which a
         * partial in-place update would trip while ordinals are mid-shuffle.
         */
        await tx.cardAnswer.deleteMany({ where: { cardId } })
        await tx.cardAnswer.createMany({
          data: derivedAnswers.answers.map((answer) => ({ ...answer, cardId })),
        })
      }

      return tx.studyCard.findUniqueOrThrow({ where: { id: cardId }, include: cardInclude })
    })

    const response: CardResponse = { card: toStudyCard(card) }
    res.json(response)
  }),
)

// ── Delete a card ───────────────────────────────────────────────────────────

cardsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    // Answers cascade with the card, per the schema relation.
    const result = await prisma.studyCard.deleteMany({
      where: { id: req.params.id, set: { userId: requireUserId(req) } },
    })

    if (result.count === 0) {
      sendNotFound(res, 'card')
      return
    }

    res.status(204).send()
  }),
)

// ── Tags ────────────────────────────────────────────────────────────────────

export const tagsRouter: Router = Router()
tagsRouter.use(requireAuth)

tagsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    /**
     * `unnest` in raw SQL rather than reading every card and counting in JS.
     * Tags live in a `TEXT[]` column, so Prisma has no groupBy for their
     * elements; fetching all of a user's cards to count tags client-side would
     * scale with the library, not with the number of distinct tags.
     *
     * Parameterised — `$queryRaw` with a tagged template sends `userId` as a
     * bound parameter, not string-interpolated SQL.
     */
    const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT tag, COUNT(*)::bigint AS count
      FROM study_cards c
      JOIN study_sets s ON s.id = c.study_set_id
      CROSS JOIN LATERAL unnest(c.tags) AS tag
      WHERE s.user_id = ${requireUserId(req)}::uuid
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `

    const body: TagsResponse = {
      // `COUNT(*)` comes back as bigint, which `JSON.stringify` throws on.
      tags: rows.map((row) => ({ tag: row.tag, count: Number(row.count) })),
    }

    res.json(body)
  }),
)

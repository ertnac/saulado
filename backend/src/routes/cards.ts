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
    const { cursor, limit } = req.query as unknown as ListCardsQuery
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
    const { paragraph, answers } = req.body as CreateCardBody
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

tagsRouter.get('/', (_req, res) => {
  const body: TagsResponse = { tags: [] }
  res.json(body)
})

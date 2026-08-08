import { Router } from 'express'
import type { SetResponse, SetsResponse } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { sendError } from '../http/errors.js'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateBody, validateQuery } from '../http/validate.js'
import {
  createSetSchema,
  listSetsQuerySchema,
  updateSetSchema,
  type CreateSetBody,
  type ListSetsQuery,
  type UpdateSetBody,
} from './cards.schemas.js'
import {
  decodeCursor,
  keysetWhere,
  requireUserId,
  sendNotFound,
  toPage,
  toStudySet,
} from './cards.shared.js'

export const setsRouter: Router = Router()

/**
 * Sets are per-user, so every route here is authenticated and every query is
 * scoped by `req.userId` in its where clause. See `cards.shared.ts` for why the
 * scoping lives in the query rather than in a post-fetch ownership check.
 */
setsRouter.use(requireAuth)

/** Columns the wire shape needs, including the denormalised card count. */
const setSelect = {
  id: true,
  title: true,
  description: true,
  color: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { cards: true } },
} as const

// ── List ────────────────────────────────────────────────────────────────────

setsRouter.get(
  '/',
  validateQuery(listSetsQuerySchema),
  asyncHandler(async (req, res) => {
    const { cursor, limit, archived } = req.query as unknown as ListSetsQuery

    const decoded = cursor ? decodeCursor(cursor) : null
    if (cursor && !decoded) {
      sendError(res, 'VALIDATION_ERROR', 'That page link is no longer valid.')
      return
    }

    const rows = await prisma.studySet.findMany({
      where: {
        userId: requireUserId(req),
        // `archived=true` asks for the archive, anything else means active only.
        // A null check rather than a boolean column: see the schema comment on
        // why `archivedAt` carries a timestamp.
        archivedAt: archived ? { not: null } : null,
        ...(decoded ? keysetWhere(decoded, 'updatedAt') : {}),
      },
      select: setSelect,
      // Most recently touched first — a set the user just edited should be at the
      // top of their list, not buried by creation order.
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      // One extra row answers "is there a next page?" without a second COUNT.
      take: limit + 1,
    })

    const page = toPage(rows, limit, (row) => row.updatedAt)
    const body: SetsResponse = {
      items: page.items.map(toStudySet),
      nextCursor: page.nextCursor,
    }

    res.json(body)
  }),
)

// ── Create ──────────────────────────────────────────────────────────────────

setsRouter.post(
  '/',
  validateBody(createSetSchema),
  asyncHandler(async (req, res) => {
    const { title, description, color } = req.body as CreateSetBody

    const set = await prisma.studySet.create({
      data: {
        userId: requireUserId(req),
        title,
        // `?? null` not `|| null`: an absent description and an explicit null
        // both mean "no description", and the column is nullable.
        description: description ?? null,
        // Absent means take the schema default rather than writing 'slate' here
        // and having two places to change when the default moves.
        ...(color ? { color } : {}),
      },
      select: setSelect,
    })

    const body: SetResponse = { set: toStudySet(set) }
    res.status(201).json(body)
  }),
)

// ── Read one ────────────────────────────────────────────────────────────────

setsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const set = await prisma.studySet.findFirst({
      where: { id: req.params.id, userId: requireUserId(req) },
      select: setSelect,
    })

    if (!set) {
      sendNotFound(res, 'set')
      return
    }

    const body: SetResponse = { set: toStudySet(set) }
    res.json(body)
  }),
)

// ── Update ──────────────────────────────────────────────────────────────────

setsRouter.patch(
  '/:id',
  validateBody(updateSetSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as UpdateSetBody
    const setId = req.params.id

    /**
     * `updateMany` rather than `update`, because it takes a full where clause.
     * `update` accepts only a unique selector, so scoping by owner would mean
     * fetching the row, checking `userId`, then updating — a read-then-write race
     * and one more branch that can be forgotten. `updateMany` returns a count,
     * which is exactly the "did this belong to you" signal needed.
     */
    const result = await prisma.studySet.updateMany({
      where: { id: setId, userId: requireUserId(req) },
      data: {
        ...('title' in body ? { title: body.title } : {}),
        // `in` rather than truthiness: `description: null` clears the field and
        // must be distinguishable from an absent key, or a description can never
        // be removed once written.
        ...('description' in body ? { description: body.description ?? null } : {}),
        ...('color' in body ? { color: body.color } : {}),
        ...('archived' in body ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
    })

    if (result.count === 0) {
      sendNotFound(res, 'set')
      return
    }

    const set = await prisma.studySet.findFirstOrThrow({
      where: { id: setId, userId: requireUserId(req) },
      select: setSelect,
    })

    const response: SetResponse = { set: toStudySet(set) }
    res.json(response)
  }),
)

// ── Delete ──────────────────────────────────────────────────────────────────

setsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    /**
     * Hard delete. Cards and their answers go with it via `onDelete: Cascade`,
     * declared in the schema rather than done in application code so a set can
     * never be removed while leaving orphaned cards behind.
     *
     * Archiving is the reversible option and is what the UI offers first; this
     * endpoint is the deliberate, confirmed destructive path.
     */
    const result = await prisma.studySet.deleteMany({
      where: { id: req.params.id, userId: requireUserId(req) },
    })

    if (result.count === 0) {
      sendNotFound(res, 'set')
      return
    }

    // 204: the resource is gone, there is nothing meaningful to return.
    res.status(204).send()
  }),
)

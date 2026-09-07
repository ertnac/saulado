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
import { assertPlacement, loadSetNodes, rollUpSubtree } from './set-tree.js'

export const setsRouter: Router = Router()

/**
 * Sets are per-user, so every route here is authenticated and every query is
 * scoped by `req.userId` in its where clause. See `cards.shared.ts` for why the
 * scoping lives in the query rather than in a post-fetch ownership check.
 */
setsRouter.use(requireAuth)

/** Columns the wire shape needs, including the two denormalised counts. */
const setSelect = {
  id: true,
  title: true,
  parentId: true,
  color: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  // `children` is the *direct* child count. Descendants are not reachable from a
  // relation count at any depth — `subtreeCardCounts` handles those.
  _count: { select: { cards: true, children: true } },
} as const

/**
 * Cards per set, rolled up through the hierarchy, for the whole user at once.
 *
 * Two queries regardless of how many sets are on the page: one flat `{id,
 * parentId}` list and one `groupBy`. The alternative — a count per row — is the
 * N+1 the set list already avoids for its own card count, and nesting would make
 * it worse rather than better.
 *
 * The `groupBy` covers *every* set the user owns, not just the page. It has to:
 * a root's total includes children that are not on this page and, under the
 * `?parent=` filter, are not on any page the client will fetch.
 */
async function subtreeCardCounts(userId: string): Promise<Map<string, number>> {
  const [nodes, grouped] = await Promise.all([
    loadSetNodes(userId),
    prisma.studyCard.groupBy({
      by: ['studySetId'],
      where: { set: { userId } },
      _count: { _all: true },
    }),
  ])

  const own = new Map(grouped.map((row) => [row.studySetId, row._count._all]))
  return rollUpSubtree(nodes, own)
}

// ── List ────────────────────────────────────────────────────────────────────

setsRouter.get(
  '/',
  validateQuery(listSetsQuerySchema),
  asyncHandler(async (req, res) => {
    const { cursor, limit, archived, parent } = req.query as unknown as ListSetsQuery
    const userId = requireUserId(req)

    const decoded = cursor ? decodeCursor(cursor) : null
    if (cursor && !decoded) {
      sendError(res, 'VALIDATION_ERROR', 'That page link is no longer valid.')
      return
    }

    const rows = await prisma.studySet.findMany({
      where: {
        userId,
        // One level of the tree per request, or all levels when parent is 'all'.
        ...(parent === 'all' ? {} : { parentId: parent }),
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
    const subtree = await subtreeCardCounts(userId)
    const body: SetsResponse = {
      items: page.items.map((row) => toStudySet(row, subtree.get(row.id) ?? row._count.cards)),
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
    const { title, parentId, color } = req.body as CreateSetBody
    const userId = requireUserId(req)

    // Throws before anything is written: an unowned, cyclic or too-deep parent is
    // rejected rather than persisted and cleaned up. `null` here is always legal
    // — a set with no parent is a root.
    await assertPlacement(userId, null, parentId ?? null)

    const set = await prisma.studySet.create({
      data: {
        userId,
        title,
        // `?? null` not `|| null`: an absent parent and an explicit null both
        // mean "put this at the root", and the column is nullable.
        parentId: parentId ?? null,
        // Absent means take the schema default rather than writing 'slate' here
        // and having two places to change when the default moves.
        ...(color ? { color } : {}),
      },
      select: setSelect,
    })

    // A set that did not exist a moment ago holds nothing and contains nothing,
    // so its subtree total is its own count. No rollup query for this one.
    const body: SetResponse = { set: toStudySet(set, set._count.cards) }
    res.status(201).json(body)
  }),
)

// ── Read one ────────────────────────────────────────────────────────────────

setsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req)

    const set = await prisma.studySet.findFirst({
      where: { id: req.params.id, userId },
      select: setSelect,
    })

    if (!set) {
      sendNotFound(res, 'set')
      return
    }

    const subtree = await subtreeCardCounts(userId)
    const body: SetResponse = { set: toStudySet(set, subtree.get(set.id) ?? set._count.cards) }
    res.json(body)
  }),
)

// ── Update ──────────────────────────────────────────────────────────────────

setsRouter.patch(
  '/:id',
  validateBody(updateSetSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as UpdateSetBody
    // `?? ''` matching the rest of the router: `/:id` cannot match without it,
    // and an empty id is a non-uuid that owns nothing, so it falls through to
    // the same 404 an unowned id gets rather than needing a branch of its own.
    const setId = req.params.id ?? ''
    const userId = requireUserId(req)

    /**
     * Placement is checked before the write, and only when the request actually
     * moves the set. A separate read is acceptable here because re-parenting is a
     * deliberate one-off action, not a hot path — and there is no way to express
     * "not one of your own descendants" as a column constraint.
     *
     * An unowned `setId` still falls through to the 404 below: `updateMany`
     * returns a count of zero, and nothing here reveals whether the id exists.
     */
    if ('parentId' in body) {
      await assertPlacement(userId, setId, body.parentId ?? null)
    }

    /**
     * `updateMany` rather than `update`, because it takes a full where clause.
     * `update` accepts only a unique selector, so scoping by owner would mean
     * fetching the row, checking `userId`, then updating — a read-then-write race
     * and one more branch that can be forgotten. `updateMany` returns a count,
     * which is exactly the "did this belong to you" signal needed.
     */
    const result = await prisma.studySet.updateMany({
      where: { id: setId, userId },
      data: {
        ...('title' in body ? { title: body.title } : {}),
        // `in` rather than truthiness: `parentId: null` moves the set back to the
        // root and must be distinguishable from an absent key, or a set can never
        // leave the parent it was first put in.
        ...('parentId' in body ? { parentId: body.parentId ?? null } : {}),
        ...('color' in body ? { color: body.color } : {}),
        ...('archived' in body ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
    })

    if (result.count === 0) {
      sendNotFound(res, 'set')
      return
    }

    const set = await prisma.studySet.findFirstOrThrow({
      where: { id: setId, userId },
      select: setSelect,
    })

    const subtree = await subtreeCardCounts(userId)
    const response: SetResponse = { set: toStudySet(set, subtree.get(set.id) ?? set._count.cards) }
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
     * Child sets cascade too, recursively, through the same self-FK — deleting a
     * set takes its whole subtree. That is why `childCount` is on the wire shape:
     * the confirm dialog has to say so before the user agrees.
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

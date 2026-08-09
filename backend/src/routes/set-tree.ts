import { SET_DEPTH_MAX } from '@saulado/shared'
import { prisma } from '../db/client.js'
import { ApiError } from '../http/errors.js'

/**
 * The set hierarchy, in one place.
 *
 * Sets nest as an **adjacency list** — one nullable `parentId` per row. Every
 * question that needs more than one level ("what is underneath this set?", "may
 * this set move there?") is answered here, so the rules about depth, ownership
 * and cycles exist once rather than in each route that touches them.
 *
 * **No recursive CTE.** Both functions load every `{id, parentId}` the user owns
 * in a single query and walk it in memory. A user has tens of sets, not
 * thousands: the whole map is a few kilobytes, the walk is microseconds, and it
 * stays inside Prisma's typed API instead of adding a second raw-SQL surface
 * next to `search/search.ts`. `WITH RECURSIVE` becomes the right call if sets
 * ever become shareable and a tree can span users — it does not today.
 *
 * Every query here is scoped by `userId`. A tree walk that crossed accounts
 * would be a way to discover another user's set ids by probing `parentId`.
 */

export interface SetNode {
  id: string
  parentId: string | null
}

/** Every set the user owns, as a flat `{id, parentId}` list. */
export async function loadSetNodes(userId: string): Promise<SetNode[]> {
  return prisma.studySet.findMany({
    where: { userId },
    select: { id: true, parentId: true },
  })
}

/** Groups nodes by parent so the walk is one map lookup per level. */
function childIndex(nodes: readonly SetNode[]): Map<string | null, string[]> {
  const index = new Map<string | null, string[]>()

  for (const node of nodes) {
    const siblings = index.get(node.parentId)
    if (siblings) siblings.push(node.id)
    else index.set(node.parentId, [node.id])
  }

  return index
}

/**
 * Walks a subtree from `rootId`, inclusive, over an already-built child index.
 *
 * The `visited` set is not defensive padding. `assertPlacement` prevents cycles
 * on the way in, but a cycle that reached the table some other way — a bad
 * manual UPDATE, a restored backup — would turn this into an infinite loop
 * holding a request open. Terminating on bad data beats hanging on it.
 */
function walkSubtree(rootId: string, index: Map<string | null, string[]>): string[] {
  const collected: string[] = []
  const visited = new Set<string>()
  const queue: string[] = [rootId]

  while (queue.length > 0) {
    const id = queue.pop()
    if (id === undefined || visited.has(id)) continue

    visited.add(id)
    collected.push(id)

    const children = index.get(id)
    if (children) queue.push(...children)
  }

  return collected
}

/**
 * Every set id in the subtree rooted at `rootId`, including `rootId` itself.
 *
 * Returns `[rootId]` when the user does not own it. Callers use the result as an
 * `IN` list, so a non-owned root yields a query matching nothing — the same
 * outcome as the ownership check they would otherwise write, without a second
 * round-trip. Callers that need to *report* a missing set still check for it
 * themselves; `getSession` does exactly that before it gets here.
 */
export async function subtreeIds(userId: string, rootId: string): Promise<string[]> {
  return walkSubtree(rootId, childIndex(await loadSetNodes(userId)))
}

/**
 * Turns per-set numbers into per-set subtree totals.
 *
 * The rollup behind both `StudySet.subtreeCardCount` and the library's due
 * badge. A parent showing 0 while its children hold 40 is the bug nesting would
 * otherwise ship with, and it has to be fixed in exactly one place or the two
 * numbers disagree.
 *
 * Walks *up* from each set adding its own figure to every ancestor, rather than
 * down from each set summing its descendants. Both are correct; going up visits
 * each set once per level of its own depth, which is bounded by `SET_DEPTH_MAX`,
 * so the whole rollup is O(n) with a constant of 3.
 *
 * Pure and total: sets absent from `own` contribute 0, and every set in `nodes`
 * appears in the result even when its subtree is empty, so callers never have to
 * distinguish "no cards" from "not counted".
 */
export function rollUpSubtree(
  nodes: readonly SetNode[],
  own: ReadonlyMap<string, number>,
): Map<string, number> {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]))
  const totals = new Map<string, number>(nodes.map((node) => [node.id, 0]))

  for (const node of nodes) {
    const value = own.get(node.id) ?? 0
    if (value === 0) continue

    // `seen` guards the same corrupt-data cycle `walkSubtree` guards, for the
    // same reason: this loop would otherwise not terminate.
    const seen = new Set<string>()
    let cursor: string | null = node.id

    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor)
      totals.set(cursor, (totals.get(cursor) ?? 0) + value)
      cursor = parentOf.get(cursor) ?? null
    }
  }

  return totals
}

/** Depth of a set counted in levels, where a root sits at 1. */
function depthOf(id: string | null, parentOf: Map<string, string | null>): number {
  let depth = 0
  let cursor = id
  const seen = new Set<string>()

  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor)
    depth += 1
    cursor = parentOf.get(cursor) ?? null
  }

  return depth
}

/** Tallest branch below `id`, in levels. A leaf is 1. */
function heightOf(id: string, index: Map<string | null, string[]>): number {
  let height = 0
  let frontier = [id]
  const visited = new Set<string>()

  while (frontier.length > 0) {
    height += 1
    const next: string[] = []

    for (const node of frontier) {
      if (visited.has(node)) continue
      visited.add(node)
      next.push(...(index.get(node) ?? []))
    }

    frontier = next
  }

  return height
}

/**
 * Rejects an illegal placement before it is written.
 *
 * Four ways a placement can be wrong, and all four have to be caught here
 * because Postgres enforces none of them:
 *
 * 1. **A parent the user does not own.** Reported as 404, never 403 — a 403
 *    would confirm the id exists, turning this into an oracle for enumerating
 *    other people's sets.
 * 2. **A set parented to itself.**
 * 3. **A set parented to one of its own descendants.** This is the one that
 *    matters: it detaches the whole branch from every root, and since nothing
 *    lists it any more, the sets simply vanish from the UI while staying in the
 *    table.
 * 4. **Too deep.** Checked as *existing depth of the new parent* plus *height of
 *    the moving subtree*, not just the parent's depth. Moving a two-level branch
 *    under a level-2 set is illegal even though the parent itself has room, and
 *    checking only the parent would let the branch's own leaves land at level 4.
 *
 * `setId` is null when creating — there is no subtree to carry yet, so the
 * height term is 1. A null `parentId` is always legal: everything may become a
 * root.
 */
export async function assertPlacement(
  userId: string,
  setId: string | null,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return

  if (setId !== null && parentId === setId) {
    throw new ApiError('VALIDATION_ERROR', 'A set cannot be inside itself.', {
      parentId: 'Choose a different parent set.',
    })
  }

  const nodes = await loadSetNodes(userId)

  if (!nodes.some((node) => node.id === parentId)) {
    throw new ApiError('NOT_FOUND', 'That parent set could not be found.')
  }

  const index = childIndex(nodes)

  if (setId !== null) {
    const descendants = new Set(walkSubtree(setId, index))
    if (descendants.has(parentId)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'A set cannot be moved inside one of its own sub-sets.',
        { parentId: 'Choose a set outside this one.' },
      )
    }
  }

  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]))
  const movingHeight = setId === null ? 1 : heightOf(setId, index)

  if (depthOf(parentId, parentOf) + movingHeight > SET_DEPTH_MAX) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Sets can only be nested ${String(SET_DEPTH_MAX)} levels deep.`,
      { parentId: 'This would nest the set too deeply.' },
    )
  }
}

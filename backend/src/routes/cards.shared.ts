import type { Request, Response } from 'express'
import type { CardAnswer, StudyCard, StudyCardSummary, StudySet } from '@saulado/shared'
import {
  assignOrdinals,
  createAnswer,
  ClozeError,
  isSetColor,
  validateAnswers,
  DEFAULT_SET_COLOR,
} from '@saulado/shared'
import { prisma } from '../db/client.js'
import { sendError } from '../http/errors.js'

/**
 * Shared machinery for the sets and cards routes.
 *
 * Three concerns live here because both routers need all three: ownership
 * lookups, cursor pagination, and turning client offsets into stored answers.
 */

// ── Ownership ───────────────────────────────────────────────────────────────

/**
 * `req.userId` is typed `string | undefined`, and Prisma treats `undefined` as
 * "no filter" — `where: { userId: undefined }` returns every row in the table.
 * Rather than trusting middleware ordering, every handler derives the owner id
 * through here, which asserts the field is present. If `requireAuth` is ever
 * omitted from a route, this is where the build fails, loudly.
 */
export function requireUserId(req: Request): string {
  if (typeof req.userId !== 'string') {
    throw new Error('requireAuth must run before this handler')
  }
  return req.userId
}

/**
 * Every read and write is scoped by `userId` in the *where clause*, not checked
 * after the fact. A `findUnique({ where: { id } })` followed by an
 * `if (row.userId !== userId)` is one forgotten branch away from an IDOR, and
 * the forgotten branch is invisible in review. Scoping the query means the
 * database cannot return someone else's row in the first place.
 */

/**
 * Resolves a set the caller owns, or `null`.
 *
 * Returning `null` for "exists but belongs to someone else" is deliberate: the
 * caller sends 404, never 403 (plan §3.1). A 403 confirms the id is real, which
 * turns id enumeration into a membership oracle — "this set exists and is not
 * yours" is information the requester has no right to.
 */
export async function findOwnedSet(setId: string, userId: string): Promise<{ id: string } | null> {
  return prisma.studySet.findFirst({
    where: { id: setId, userId },
    select: { id: true },
  })
}

/** Same contract as {@link findOwnedSet}, one join further out. */
export async function findOwnedCard(
  cardId: string,
  userId: string,
): Promise<{ id: string; studySetId: string; paragraph: string } | null> {
  return prisma.studyCard.findFirst({
    where: { id: cardId, set: { userId } },
    select: { id: true, studySetId: true, paragraph: true },
  })
}

/** The 404 body used for every not-yours-or-not-there case. */
export function sendNotFound(res: Response, what: 'set' | 'card'): void {
  sendError(res, 'NOT_FOUND', what === 'set' ? 'Set not found.' : 'Card not found.')
}

// ── Cursor pagination ───────────────────────────────────────────────────────

/**
 * A keyset cursor: the sort key of the last row on the previous page, plus its
 * id.
 *
 * The id is not decoration. `updatedAt` and `createdAt` are not unique — two
 * sets saved in the same millisecond, or seeded in one transaction, share a
 * timestamp. A cursor on the timestamp alone either skips the tied rows or
 * repeats them forever. `(timestamp, id)` is a total order, so every row appears
 * exactly once across pages.
 *
 * Encoded as base64url JSON so it is opaque to the client: nobody should be
 * building one by hand, and an opaque cursor is free to change shape later.
 */
export interface Cursor {
  at: string
  id: string
}

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString('base64url')
}

/**
 * Decodes a cursor, or returns `null` if it is unusable.
 *
 * A malformed cursor is a 400, not a 500 — it usually means a hand-edited URL or
 * a stale bookmark, and neither deserves a stack trace.
 */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Cursor).at !== 'string' ||
      typeof (parsed as Cursor).id !== 'string'
    ) {
      return null
    }

    const cursor = parsed as Cursor
    if (Number.isNaN(Date.parse(cursor.at))) return null

    return cursor
  } catch {
    return null
  }
}

/**
 * The `WHERE` half of keyset pagination, for a DESC sort on `(field, id)`.
 *
 * Reads as "strictly after the cursor row in the sort order": an earlier
 * timestamp, or the same timestamp with a smaller id. This is what makes the
 * page stable — unlike `OFFSET`, a row inserted or deleted above the cursor
 * between requests cannot shift the window and cause a skip or a repeat.
 */
export function keysetWhere(
  cursor: Cursor,
  field: 'updatedAt' | 'createdAt',
): { OR: Record<string, unknown>[] } {
  const at = new Date(cursor.at)

  return {
    OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: cursor.id } }],
  }
}

/**
 * Splits an over-fetched result into a page and its next cursor.
 *
 * The query asks for `limit + 1` rows; the extra row is never returned, it only
 * answers "is there more?". Doing it this way means no second `COUNT(*)` over
 * the whole matching set just to decide whether to render a "Load more" button.
 */
export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortKey: (row: T) => Date,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(sortKey(last), last.id) : null,
  }
}

// ── Wire shapes ─────────────────────────────────────────────────────────────

/**
 * Dates leave the API as ISO strings, never `Date`.
 *
 * `JSON.parse` has no idea a string was ever a date, so typing the wire contract
 * with `Date` would be a lie the compiler accepts and every consumer trips over
 * at `.getTime()`. Converting here, once, keeps `@saulado/shared` honest.
 */
type SetRow = {
  id: string
  title: string
  parentId: string | null
  color: string
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  _count: { cards: number; children: number }
}

/**
 * `subtreeCardCount` is passed in rather than read off the row.
 *
 * Prisma's `_count` covers direct relations only, so a set's descendants are not
 * countable from a single row however the select is written. The caller runs one
 * `groupBy` for the whole page and rolls it up through the parent map — see
 * `subtreeCardCounts` in `sets.ts`. Making it a required argument rather than
 * defaulting to `_count.cards` is deliberate: a silent default would report a
 * parent's subtree as its own cards, which is precisely the "0 due while the
 * children hold 40" bug nesting exists to avoid, and it would do it invisibly.
 */
export function toStudySet(row: SetRow, subtreeCardCount: number): StudySet {
  return {
    id: row.id,
    title: row.title,
    parentId: row.parentId,
    // The column is a plain string, so a colour retired from SET_COLORS in a
    // later release would still be sitting in old rows. Falling back keeps those
    // sets rendering instead of failing a type assertion at the edge.
    color: isSetColor(row.color) ? row.color : DEFAULT_SET_COLOR,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cardCount: row._count.cards,
    subtreeCardCount,
    childCount: row._count.children,
  }
}

type AnswerRow = {
  id: string
  startOffset: number
  endOffset: number
  answerText: string
  altAnswers: string[]
  ordinal: number
}

type CardRow = {
  id: string
  studySetId: string
  paragraph: string
  createdAt: Date
  updatedAt: Date
  answers: AnswerRow[]
}

export function toStudyCard(row: CardRow): StudyCard {
  return {
    id: row.id,
    studySetId: row.studySetId,
    paragraph: row.paragraph,
    answers: row.answers.map((answer): CardAnswer => ({
      id: answer.id,
      startOffset: answer.startOffset,
      endOffset: answer.endOffset,
      answerText: answer.answerText,
      altAnswers: answer.altAnswers,
      ordinal: answer.ordinal,
    })),
    tags: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * The list shape: everything except the answers themselves.
 *
 * A list view shows a preview and a blank count, so shipping the answer text for
 * every card on the page would be both wasted bytes and — once study mode reads
 * the same endpoint — the answers sitting in the browser before the user has
 * tried to recall them.
 */
export function toStudyCardSummary(
  row: Omit<CardRow, 'answers'> & { _count: { answers: number } },
) {
  return {
    id: row.id,
    studySetId: row.studySetId,
    paragraph: row.paragraph,
    tags: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    answerCount: row._count.answers,
  } satisfies StudyCardSummary
}

// ── Server-side answer derivation ───────────────────────────────────────────

export interface DerivedAnswer {
  startOffset: number
  endOffset: number
  answerText: string
  altAnswers: string[]
  ordinal: number
}

/**
 * Turns client-sent ranges into storable answers.
 *
 * The client sends offsets and alternatives; **the text is sliced here, from the
 * paragraph the server is about to store** (plan §3.2). Accepting a
 * client-supplied `answerText` would let a caller claim the range covering "CPU"
 * reads "anything", and would quietly disable the corruption tripwire in
 * `validateAnswers` — it would be comparing client data against client data.
 *
 * `assignOrdinals` sorts by `startOffset` and numbers from zero, so the first
 * blank in the paragraph is always ordinal 0 regardless of the order the user
 * highlighted things in. `validateAnswers` then re-checks the whole set,
 * catching overlaps that only exist in combination.
 */
export function deriveAnswers(
  paragraph: string,
  inputs: readonly { startOffset: number; endOffset: number; altAnswers?: string[] }[],
): { answers: DerivedAnswer[] } | { error: string } {
  const drafts: ReturnType<typeof createAnswer>[] = []

  for (const [index, input] of inputs.entries()) {
    try {
      drafts.push(
        createAnswer(paragraph, input.startOffset, input.endOffset, input.altAnswers ?? []),
      )
    } catch (err) {
      if (err instanceof ClozeError) {
        return { error: `Blank ${String(index + 1)}: ${err.message}` }
      }
      throw err
    }
  }

  const ordered = assignOrdinals(drafts)
  const issues = validateAnswers(paragraph, ordered)

  if (issues.length > 0) {
    const first = issues[0]
    return { error: first ? first.message : 'Those blanks are not valid.' }
  }

  return {
    answers: ordered.map((answer) => ({
      startOffset: answer.startOffset,
      endOffset: answer.endOffset,
      answerText: answer.answerText,
      altAnswers: answer.altAnswers,
      ordinal: answer.ordinal,
    })),
  }
}

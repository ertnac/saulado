import type { CardAnswer } from '../cloze/types.js'
import type { SetColor } from './limits.js'

/**
 * Wire contracts for sets and cards.
 *
 * Shared so a response-shape change is a compile error on both sides. Same rule
 * as `auth/types.ts`: types only, no Zod — the frontend needs the shapes and
 * nothing else, and a validation library in these files would end up in the
 * browser bundle for no benefit.
 *
 * Dates cross the wire as ISO strings, not `Date`. `JSON.parse` has no idea a
 * string was a date, so typing these as `Date` would be a lie the compiler
 * cheerfully accepts and every consumer then trips over at `.getTime()`.
 */

export interface StudySet {
  id: string
  title: string
  description: string | null
  color: SetColor
  /** Non-null once archived. Archive is reversible; delete is not. */
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  /**
   * Cards in this set.
   *
   * Denormalised into the list response because the list is unusable without it
   * — "12 cards" is the only thing distinguishing two sets at a glance — and
   * fetching it per row is the N+1 the plan §4.3 warns about.
   */
  cardCount: number
}

/**
 * A card as the API describes it.
 *
 * Carries `paragraph` and `answers`, never a pre-rendered blanked string. The
 * blanked form is derived by `renderCloze` at display time (plan §2.1); shipping
 * it would make the paragraph unrecoverable and, in study mode, would put the
 * answers in the browser before the user submits.
 */
export interface StudyCard {
  id: string
  studySetId: string
  title: string
  paragraph: string
  answers: CardAnswer[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** A card without its answers, for list views that only need a preview. */
export type StudyCardSummary = Omit<StudyCard, 'answers'> & {
  answerCount: number
}

// ── Requests ────────────────────────────────────────────────────────────────

export interface CreateSetRequest {
  title: string
  description?: string | null
  color?: SetColor
}

/**
 * Every field optional — PATCH semantics.
 *
 * `description: null` clears it, `description: undefined` (absent) leaves it
 * alone. Collapsing those two into one would make it impossible to remove a
 * description once set.
 */
export interface UpdateSetRequest {
  title?: string
  description?: string | null
  color?: SetColor
  /** `true` archives, `false` restores. */
  archived?: boolean
}

/**
 * An answer range as the *client* sends it.
 *
 * Offsets and alternatives only — no `answerText`. The server slices the
 * paragraph itself (plan §3.2), so a client cannot claim that the range covering
 * "CPU" actually reads "the answer is anything". Accepting the text and trusting
 * it would also make the corruption tripwire in `validateAnswers` useless, since
 * it would be comparing client-supplied text against client-supplied offsets.
 */
export interface AnswerInput {
  startOffset: number
  endOffset: number
  altAnswers?: string[]
}

export interface CreateCardRequest {
  title: string
  paragraph: string
  answers: AnswerInput[]
  tags?: string[]
}

/**
 * PATCH for a card.
 *
 * `paragraph` and `answers` travel together when either changes: an edited
 * paragraph invalidates every offset, so accepting a new paragraph against the
 * old answers would persist exactly the corruption the offset model exists to
 * prevent. Re-anchoring happens client-side (`reanchorAnswers`) so the user can
 * resolve orphans before saving; the server then re-derives and re-validates.
 */
export interface UpdateCardRequest {
  title?: string
  paragraph?: string
  answers?: AnswerInput[]
  tags?: string[]
  /** Move the card to a different set. Must be a set the caller owns. */
  studySetId?: string
}

// ── Responses ───────────────────────────────────────────────────────────────

/**
 * A page of results.
 *
 * Cursor rather than offset pagination: `LIMIT n OFFSET 400` makes Postgres walk
 * and discard 400 rows, and — worse for a list a user is actively editing — a row
 * inserted or deleted between requests shifts every subsequent page, so items
 * get skipped or repeated. A keyset cursor is stable under concurrent writes.
 *
 * `nextCursor` is null on the last page. Absent `total` is deliberate: a count
 * over the whole matching set is a second query the UI does not need to render a
 * "Load more" button.
 */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

// Aliases rather than empty `extends` interfaces: an interface with no members
// is exactly its supertype, which lint rightly flags as a declaration that adds
// nothing. The names still earn their place — routes and hooks read better
// returning `SetsResponse` than `Page<StudySet>`.
export type SetsResponse = Page<StudySet>
export type CardsResponse = Page<StudyCardSummary>

export interface SetResponse {
  set: StudySet
}

export interface CardResponse {
  card: StudyCard
}

/** One entry from `GET /api/tags`. */
export interface TagCount {
  tag: string
  count: number
}

export interface TagsResponse {
  tags: TagCount[]
}

/**
 * Wire contracts for search (plan §6, sub-phase 6.1).
 *
 * Types only, no Zod — same rule as `auth/types.ts` and `cards/types.ts`. The
 * closed sets are exported as `as const` tuples so the backend can build
 * `z.enum` from them and the frontend can iterate them for its filter UI,
 * without either side redeclaring the list.
 */

/**
 * One run of snippet text, flagged as matched or not.
 *
 * **This is the whole reason snippets are not strings.** Postgres' `ts_headline`
 * marks matches by wrapping them in delimiters, and the obvious shape for that
 * is an HTML string with `<b>` in it. Returning that would mean the client has
 * to `dangerouslySetInnerHTML` a value derived from a user's own paragraph text
 * — which is a stored-XSS hole with extra steps, since the paragraph is
 * arbitrary text the user pasted in.
 *
 * So the delimiters are parsed **server-side** into these segments, and the
 * client renders `<mark>` as a real React node around `segment.text`. Nothing
 * crossing the wire is ever interpreted as markup. The worst a hostile
 * paragraph can do is produce a spurious highlight.
 */
export interface SnippetSegment {
  text: string
  /** True when this run is one of the matched terms. */
  match: boolean
}

/**
 * Where a card sits relative to its next review.
 *
 * Three states rather than a boolean, because "not due" hides a distinction the
 * user cares about: a card they have never seen is *new work*, and a card they
 * answered yesterday is *done for now*. Folding those together is the same
 * mistake §4.7 called out on the dashboard.
 *
 * - `new` — no schedule row at all. Never studied.
 * - `due` — `dueAt <= today` in the user's timezone. Waiting.
 * - `later` — `dueAt > today`. Scheduled, nothing to do.
 */
export type DueState = 'new' | 'due' | 'later'

export const DUE_STATES = ['new', 'due', 'later'] as const

/**
 * Result ordering.
 *
 * `relevance` is only meaningful with query text — ranking by `ts_rank` with no
 * tsquery gives every row the same zero score, which is an arbitrary order
 * wearing a meaningful name. The server silently reports `recent` in that case
 * rather than pretending, and {@link SearchResponse.sort} echoes what it
 * actually used.
 */
export type SearchSort = 'relevance' | 'recent'

export const SEARCH_SORTS = ['relevance', 'recent'] as const

/** One matching card. */
export interface SearchHit {
  cardId: string
  /**
   * A one-line label, derived server-side with `cardLabel(paragraph)`.
   *
   * Distinct from {@link SearchHit.snippet}, and both are needed. The snippet is
   * wherever the *query* matched, which can be four hundred words in; the label
   * is always the paragraph's opening, so it identifies the card the same way
   * every time regardless of what was searched for. A result list with only the
   * snippet makes the same card look like a different one on each query.
   */
  label: string
  studySetId: string
  setTitle: string
  /**
   * True when the card's set is archived.
   *
   * Search covers archived sets, unlike the set list, which defaults to active
   * only. Archiving is "get this out of my way", not "delete it" — and a search
   * that cannot find a card the user knows they wrote is a worse failure than a
   * result needing a badge. The flag is here so the UI can say which it is
   * rather than presenting an archived card as if it were live.
   */
  setArchived: boolean
  tags: string[]
  /**
   * The matching part of the paragraph, as segments.
   *
   * Never the whole paragraph: a 400-word note would drown the ten words that
   * matched. With no query text there is nothing to centre a snippet on, so
   * this carries the opening of the paragraph as a single unmatched segment.
   */
  snippet: SnippetSegment[]
  dueState: DueState
  /** `YYYY-MM-DD`, or null when the card has never been scheduled. */
  dueAt: string | null
  updatedAt: string
}

/**
 * Everything the search endpoint accepts.
 *
 * Every field is optional, including `q`. A request with filters and no query
 * text is a legitimate *browse* — "cards in this set, tagged `exam`, due now" —
 * and rejecting it would strand the user the moment they picked a filter before
 * typing. That path sorts by recency and skips ranking entirely.
 */
export interface SearchFilters {
  /** Free text. Empty or absent means browse rather than search. */
  q?: string
  setId?: string
  /** Cards carrying **all** of these tags. */
  tags?: string[]
  /** Inclusive `YYYY-MM-DD` bounds on card creation. */
  createdFrom?: string
  createdTo?: string
  due?: DueState
  sort?: SearchSort
  limit?: number
  offset?: number
}

/**
 * A page of results.
 *
 * Offset paging, deliberately unlike the keyset cursors used for sets and cards
 * (`cards/types.ts`). A keyset cursor needs a unique, totally-ordered sort key,
 * and relevance rank is neither — ties are the norm, so `WHERE rank < :last`
 * would drop every row sharing a boundary score. The result window is also
 * bounded and short-lived, which is the case offset paging handles fine.
 *
 * `total` is genuinely useful here, unlike in the set list: "247 results" tells
 * the user their query is too broad. It costs nothing extra because it comes
 * from a `COUNT(*) OVER ()` in the same scan rather than a second query.
 */
export interface SearchResponse {
  /** What the server searched for, after trimming. Empty in browse mode. */
  query: string
  /** The ordering actually applied — not necessarily the one requested. */
  sort: SearchSort
  items: SearchHit[]
  total: number
  offset: number
  limit: number
}

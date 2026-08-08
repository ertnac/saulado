import { Prisma } from '@prisma/client'
import type { DueState, SearchHit, SearchResponse, SearchSort } from '@saulado/shared'
import {
  HEADLINE_OPTIONS,
  browseSnippet,
  dateToDayKey,
  dayKeyToDate,
  parseSnippet,
} from '@saulado/shared'
import { prisma } from '../db/client.js'
import { loadSettings, todayFor } from '../study/settings.js'

/**
 * Card search (plan §6.1).
 *
 * Raw SQL rather than the query builder, following the `tagsRouter` precedent in
 * `routes/cards.ts`. Three things here have no Prisma equivalent: the `@@`
 * tsvector match, `ts_rank`, and `ts_headline`. Expressing the filters in Prisma
 * and the ranking in SQL would mean two round trips and a merge in application
 * code, which is slower and less correct than one query.
 *
 * **Every interpolation below is a bound parameter.** `Prisma.sql` tagged
 * templates send values over the wire separately from the statement text, so a
 * query of `'; DROP TABLE users; --` is searched for, not executed. The only
 * strings concatenated into the statement are compile-time constants.
 */

export interface SearchParams {
  q: string
  setId?: string
  tags: string[]
  createdFrom?: string
  createdTo?: string
  due?: DueState
  sort: SearchSort
  limit: number
  offset: number
}

/**
 * One row as Postgres returns it.
 *
 * `total` is `bigint` because `COUNT(*)` is `int8`. `JSON.stringify` throws on
 * `bigint`, so it is converted before it can reach a response body — the same
 * trap `tagsRouter` documents.
 */
interface SearchRow {
  id: string
  title: string
  study_set_id: string
  set_title: string
  set_archived: Date | null
  tags: string[]
  paragraph: string
  headline: string | null
  due_at: Date | null
  updated_at: Date
  total: bigint
}

export async function searchCards(userId: string, params: SearchParams): Promise<SearchResponse> {
  const settings = await loadSettings(userId)
  const today = todayFor(settings)

  // Ranking needs a tsquery. Without query text there is nothing to rank
  // against — `ts_rank` over an empty query scores every row zero, which is an
  // arbitrary order wearing the name "relevance". Browse mode is recency.
  const searching = params.q.length > 0
  const sort: SearchSort = searching ? params.sort : 'recent'

  const rows = searching
    ? await runSearch(userId, params, today, sort)
    : await runBrowse(userId, params, today)

  return {
    query: params.q,
    sort,
    items: rows.map((row) => toHit(row, today)),
    // `Number` on a count that cannot exceed the row count of one user's card
    // table. Well inside the safe integer range, and `bigint` would not survive
    // `res.json`.
    total: Number(rows[0]?.total ?? 0n),
    offset: params.offset,
    limit: params.limit,
  }
}

/**
 * The filters every mode shares, as a list of `AND`-ed fragments.
 *
 * Built as fragments rather than one interpolated string so an absent filter
 * contributes nothing to the statement — `WHERE true AND true AND true` is
 * harmless but unreadable in a query log.
 *
 * Ownership is first and non-negotiable: the join to `study_sets` is what scopes
 * every result to the caller. Search is the easiest place in an app to leak
 * another user's rows, because the filter is the query rather than an id.
 */
function filterFragments(userId: string, params: SearchParams, today: string): Prisma.Sql[] {
  const fragments: Prisma.Sql[] = [Prisma.sql`s.user_id = ${userId}::uuid`]

  if (params.setId !== undefined) {
    fragments.push(Prisma.sql`c.study_set_id = ${params.setId}::uuid`)
  }

  if (params.tags.length > 0) {
    // `@>` is "contains all of", not `&&` ("overlaps any of"). Two tags are a
    // narrowing, not a widening — picking `anatomy` and `exam` should give the
    // cards in both, which is what the filter chips look like they mean.
    fragments.push(Prisma.sql`c.tags @> ${params.tags}::text[]`)
  }

  if (params.createdFrom !== undefined) {
    fragments.push(Prisma.sql`c.created_at >= ${dayKeyToDate(params.createdFrom)}`)
  }

  if (params.createdTo !== undefined) {
    // The bound is inclusive of the whole day, so it compares against the start
    // of the *next* one. `created_at <= '2026-08-08'` would silently exclude
    // everything written after midnight on the day the user picked.
    fragments.push(Prisma.sql`c.created_at < ${dayKeyToDate(addDay(params.createdTo))}`)
  }

  const due = dueFragment(params.due, today)
  if (due) fragments.push(due)

  return fragments
}

/** `YYYY-MM-DD` plus one calendar day. */
function addDay(key: string): string {
  const date = dayKeyToDate(key)
  date.setUTCDate(date.getUTCDate() + 1)
  return dateToDayKey(date)
}

/**
 * The due-state filter.
 *
 * `sched` is LEFT JOINed, so `sched.id IS NULL` is precisely "this user has
 * never studied this card" — which is what `new` means. The date comparison is
 * against the user's own today (see `study/day.ts`), not the server's.
 */
function dueFragment(due: DueState | undefined, today: string): Prisma.Sql | null {
  const todayDate = dayKeyToDate(today)

  switch (due) {
    case 'new':
      return Prisma.sql`sched.id IS NULL`
    case 'due':
      return Prisma.sql`sched.due_at IS NOT NULL AND sched.due_at <= ${todayDate}`
    case 'later':
      return Prisma.sql`sched.due_at IS NOT NULL AND sched.due_at > ${todayDate}`
    default:
      return null
  }
}

/**
 * The FROM and JOINs, identical in both modes.
 *
 * The schedule join carries `user_id` in its ON clause rather than the WHERE.
 * On a LEFT JOIN that distinction is load-bearing: moving it to the WHERE would
 * discard every row whose schedule is NULL, turning the outer join into an inner
 * one and hiding every card the user has never studied.
 */
const FROM_CARDS = (userId: string): Prisma.Sql => Prisma.sql`
  FROM study_cards c
  JOIN study_sets s ON s.id = c.study_set_id
  LEFT JOIN card_schedules sched
    ON sched.card_id = c.id AND sched.user_id = ${userId}::uuid
`

/**
 * Full-text mode.
 *
 * Two CTEs, and the split is the whole performance story. `ts_headline` is
 * expensive — it re-parses the document to find the window to quote — and it is
 * needed for exactly the rows on screen. Filtering, ranking and paginating
 * happen in `page`, then the outer query calls `ts_headline` on the surviving
 * twenty rows rather than on every card that matched.
 *
 * `websearch_to_tsquery`, not `to_tsquery` or `plainto_tsquery`. It understands
 * quoted phrases, `or`, and `-exclusion` the way a user expects from a search
 * box, and — the part that matters — **it never raises on malformed input**.
 * `to_tsquery('english', 'foo &')` is a syntax error, which would turn a stray
 * keystroke into a 500.
 */
async function runSearch(
  userId: string,
  params: SearchParams,
  today: string,
  sort: SearchSort,
): Promise<SearchRow[]> {
  const where = Prisma.join(filterFragments(userId, params, today), ' AND ')

  // Relevance still falls back to recency for ties, or a page boundary could
  // land in the middle of a group of equally-ranked rows and shuffle between
  // requests.
  const order =
    sort === 'relevance'
      ? Prisma.sql`ORDER BY rank DESC, updated_at DESC, id DESC`
      : Prisma.sql`ORDER BY updated_at DESC, id DESC`

  return prisma.$queryRaw<SearchRow[]>`
    WITH q AS (
      SELECT websearch_to_tsquery('english', ${params.q}) AS query
    ),
    page AS (
      SELECT
        c.id,
        c.title,
        c.study_set_id,
        s.title AS set_title,
        s.archived_at AS set_archived,
        c.tags,
        c.paragraph,
        sched.due_at,
        c.updated_at,
        ts_rank(c.search_vector, q.query) AS rank,
        COUNT(*) OVER () AS total
      ${FROM_CARDS(userId)}
      CROSS JOIN q
      WHERE ${where}
        AND c.search_vector @@ q.query
      ${order}
      LIMIT ${params.limit} OFFSET ${params.offset}
    )
    SELECT
      page.*,
      ts_headline('english', page.paragraph, q.query, ${HEADLINE_OPTIONS}) AS headline
    FROM page
    CROSS JOIN q
    ${order}
  `
}

/**
 * Browse mode: filters only, no query text.
 *
 * A separate statement rather than a conditional inside the search one. Making
 * the tsquery optional would mean `(q.query IS NULL OR search_vector @@ q.query)`
 * in the WHERE, which is the kind of predicate that stops the planner using the
 * GIN index at all — the filtered path would get slower to keep the unfiltered
 * one in the same function.
 *
 * No `headline`: with nothing to highlight there is no window to centre, and
 * running `ts_headline` against an empty tsquery just returns the opening of the
 * document at Postgres' own word count. `browseSnippet` does that in the app,
 * where the length is one shared constant instead of a config string.
 */
async function runBrowse(
  userId: string,
  params: SearchParams,
  today: string,
): Promise<SearchRow[]> {
  const where = Prisma.join(filterFragments(userId, params, today), ' AND ')

  return prisma.$queryRaw<SearchRow[]>`
    SELECT
      c.id,
      c.title,
      c.study_set_id,
      s.title AS set_title,
      s.archived_at AS set_archived,
      c.tags,
      c.paragraph,
      NULL::text AS headline,
      sched.due_at,
      c.updated_at,
      COUNT(*) OVER () AS total
    ${FROM_CARDS(userId)}
    WHERE ${where}
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT ${params.limit} OFFSET ${params.offset}
  `
}

function toHit(row: SearchRow, today: string): SearchHit {
  const dueAt = row.due_at ? dateToDayKey(row.due_at) : null

  return {
    cardId: row.id,
    title: row.title,
    studySetId: row.study_set_id,
    setTitle: row.set_title,
    setArchived: row.set_archived !== null,
    tags: row.tags,
    // The one place a `ts_headline` string is allowed to exist. It is parsed
    // into segments here and never leaves as a string, so nothing downstream is
    // handed something that looks safe to inject.
    snippet: row.headline === null ? browseSnippet(row.paragraph) : parseSnippet(row.headline),
    dueState: dueStateFor(dueAt, today),
    dueAt,
    updatedAt: row.updated_at.toISOString(),
  }
}

function dueStateFor(dueAt: string | null, today: string): DueState {
  if (dueAt === null) return 'new'
  return dueAt <= today ? 'due' : 'later'
}

/**
 * Limits and delimiters for search (plan §6.1).
 *
 * Shared for the same reason `cards/limits.ts` is: the palette needs the same
 * numbers the API enforces, and two copies drift.
 */

/** Longest query text accepted. Beyond this it is not a search, it is a paste. */
export const SEARCH_QUERY_MAX_LENGTH = 200

/**
 * Shortest query text that triggers ranking.
 *
 * One character is not a search — `websearch_to_tsquery('english', 'a')`
 * produces an empty tsquery anyway, since `a` is a stop word, so a single
 * keystroke would scan the index and match everything. Below this the request
 * is treated as browse mode.
 */
export const SEARCH_QUERY_MIN_LENGTH = 2

export const SEARCH_PAGE_SIZE_DEFAULT = 20
export const SEARCH_PAGE_SIZE_MAX = 50

/**
 * Deepest page reachable.
 *
 * Offset paging degrades linearly, and nobody pages to result 5,000 — they
 * refine the query. Without a ceiling, `?offset=1000000` is a cheap request
 * that makes Postgres rank and discard a million rows.
 */
export const SEARCH_OFFSET_MAX = 1_000

/**
 * How much of the paragraph browse mode shows, in code points.
 *
 * Browse has no matched terms to centre a snippet on, so it shows the opening
 * instead. Roughly matches what `ts_headline` produces for a real search, so
 * the two modes do not visibly change the row height of the results list.
 */
export const SNIPPET_BROWSE_MAX_CODE_POINTS = 220

/**
 * The markers `ts_headline` wraps matched terms in.
 *
 * Private-use code points (U+E000, U+E001) rather than the default `<b>`/`</b>`.
 * Two reasons, and the first is the important one:
 *
 * 1. **They are not markup.** The snippet is parsed into
 *    {@link SnippetSegment}s server-side and rendered as React nodes, so no
 *    HTML ever crosses the wire. Using angle brackets would invite someone
 *    downstream to "just" pass the string to `dangerouslySetInnerHTML`, which
 *    would turn every user's own paragraph into a stored-XSS vector.
 * 2. **They cannot realistically collide.** The private-use area has no
 *    assigned characters, so no keyboard, no IME and no copy-paste from a real
 *    document produces one. A paragraph that somehow contains one gets a
 *    spurious highlight — cosmetic, not exploitable.
 *
 * Kept as escapes rather than literals so they are visible in source; a raw
 * PUA character in a file is an invisible byte nobody can review.
 */
export const SNIPPET_START = '\u{E000}'
export const SNIPPET_STOP = '\u{E001}'

/**
 * The options string passed to `ts_headline`.
 *
 * `MaxFragments` is left at its default of 0, which selects the single-fragment
 * generator — fragment mode adds ellipsis-joined pieces that read worse for a
 * paragraph-sized document than one contiguous window does.
 */
export const HEADLINE_OPTIONS = [
  `StartSel=${SNIPPET_START}`,
  `StopSel=${SNIPPET_STOP}`,
  'MaxWords=40',
  'MinWords=20',
  'ShortWord=3',
  'HighlightAll=false',
].join(', ')

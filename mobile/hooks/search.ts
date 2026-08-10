import type { SearchFilters, SearchResponse } from '@saulado/shared'
import { SEARCH_QUERY_MIN_LENGTH } from '@saulado/shared'
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import * as api from '../services/account'

/**
 * Caching for full-text search — a port of
 * `frontend/src/features/search/queries.ts`.
 *
 * The query key *is* the filter object, so every distinct combination of text,
 * set, tags, dates, due state, sort and page is its own cache entry. That is what
 * makes backspacing feel instant — the previous query's results are still cached,
 * and react-query serves them without a request.
 */

export const searchKeys = {
  all: ['search'] as const,
  /**
   * Tags are sorted into the key for the same reason as `cardKeys.list`: the
   * server treats the tag list as a set (`@>`), so two orderings are one request
   * and should be one cache entry. Copied before sorting so the caller's array is
   * not mutated.
   */
  query: (filters: SearchFilters) =>
    [
      ...searchKeys.all,
      { ...filters, tags: filters.tags ? [...filters.tags].sort() : undefined },
    ] as const,
}

/**
 * True when these filters describe a request worth making.
 *
 * A single character is not: the server's minimum is two, so it would 400, and
 * the screen would flash an error at someone who is still typing. But filters
 * with *no* text at all are legitimate — that is browse mode — so this is not
 * simply a length check on `q`.
 */
export function isSearchable(filters: SearchFilters): boolean {
  const q = filters.q?.trim() ?? ''
  if (q.length >= SEARCH_QUERY_MIN_LENGTH) return true
  if (q.length > 0) return false

  return Boolean(
    filters.setId ||
    (filters.tags && filters.tags.length > 0) ||
    filters.createdFrom ||
    filters.createdTo ||
    filters.due,
  )
}

/**
 * Runs a search.
 *
 * `keepPreviousData` is what stops the results list from collapsing to a spinner
 * on every keystroke that does reach the server. The old results stay on screen,
 * dimmed by the caller via `isPlaceholderData`, and are replaced when the new
 * page lands — which reads as the list refining rather than reloading.
 *
 * `signal` is threaded through to `fetch`: a request superseded by a later
 * keystroke is aborted rather than left to resolve into a cache nobody reads.
 */
export function useSearch(
  filters: SearchFilters,
  options: { enabled?: boolean } = {},
): UseQueryResult<SearchResponse> {
  const enabled = (options.enabled ?? true) && isSearchable(filters)

  return useQuery<SearchResponse>({
    queryKey: searchKeys.query(filters),
    queryFn: ({ signal }) => api.search(filters, signal),
    enabled,
    placeholderData: keepPreviousData,
    /**
     * Short but non-zero. Long enough that leaving and returning to the screen
     * does not refetch; short enough that a card edited elsewhere shows up
     * without a restart.
     */
    staleTime: 30_000,
  })
}

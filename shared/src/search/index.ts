export type {
  SnippetSegment,
  DueState,
  SearchSort,
  SearchHit,
  SearchFilters,
  SearchResponse,
} from './types.js'
export { DUE_STATES, SEARCH_SORTS } from './types.js'

export {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_OFFSET_MAX,
  SNIPPET_BROWSE_MAX_CODE_POINTS,
  SNIPPET_START,
  SNIPPET_STOP,
  HEADLINE_OPTIONS,
} from './limits.js'

export { parseSnippet, browseSnippet } from './snippet.js'

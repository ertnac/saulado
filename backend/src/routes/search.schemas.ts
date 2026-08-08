import { z } from 'zod'
import {
  DUE_STATES,
  SEARCH_OFFSET_MAX,
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_SORTS,
  normalizeTags,
} from '@saulado/shared'

/**
 * Query schema for `GET /api/search`.
 *
 * Every filter is optional; a request with none of them is a full-library
 * browse, which is what the palette opens with before a keystroke lands. The
 * closed sets come from `@saulado/shared`, so the API and the filter UI cannot
 * disagree about what values exist.
 */

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')

/**
 * Query text, with a below-minimum query collapsing to browse rather than 400.
 *
 * The palette fires on every debounced keystroke, so the first character of a
 * real search arrives here on its own. Rejecting it would flash a validation
 * error during normal typing; dropping it shows the unfiltered list for one
 * keystroke and then the results, which is what the user expects to see.
 */
const queryText = z
  .string()
  .trim()
  .max(SEARCH_QUERY_MAX_LENGTH, 'That query is too long.')
  .default('')
  .transform((value) => (value.length < SEARCH_QUERY_MIN_LENGTH ? '' : value))

export const searchQuerySchema = z
  .object({
    q: queryText,
    setId: z.string().uuid('Not a valid set id.').optional(),
    /** Repeatable: `?tags=anatomy&tags=exam` narrows to cards carrying all of them. */
    tags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => {
        if (value === undefined) return []
        return normalizeTags(Array.isArray(value) ? value : [value])
      }),
    createdFrom: dateKey.optional(),
    createdTo: dateKey.optional(),
    due: z.enum(DUE_STATES).optional(),
    sort: z.enum(SEARCH_SORTS).default('relevance'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(SEARCH_PAGE_SIZE_MAX)
      .default(SEARCH_PAGE_SIZE_DEFAULT),
    /**
     * Capped, unlike the cursor pagination on sets and cards.
     *
     * Offset paging makes Postgres produce and discard every row before the
     * window, so an uncapped `?offset=10000000` is a one-line request that
     * ranks a user's whole library to return nothing. Nobody pages that deep on
     * purpose — they refine the query.
     */
    offset: z.coerce.number().int().min(0).max(SEARCH_OFFSET_MAX).default(0),
  })
  .refine(
    (value) =>
      value.createdFrom === undefined ||
      value.createdTo === undefined ||
      value.createdFrom <= value.createdTo,
    {
      // A range that ends before it starts is always a UI bug. Returning zero
      // results instead would make the bug look like an empty library.
      message: 'Ends before it starts.',
      path: ['createdTo'],
    },
  )

export type SearchQuery = z.infer<typeof searchQuerySchema>

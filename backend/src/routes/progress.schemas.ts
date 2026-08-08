import { z } from 'zod'
import { PROGRESS_RANGES } from '@saulado/shared'

/**
 * Query schemas for the progress routes.
 *
 * `range` is an enum, not a number of days. Accepting `?days=100000` would let
 * any caller ask for a scan of the entire review log — a cheap request to make
 * and an expensive one to serve, which is the shape of an accidental denial of
 * service. A closed set also means the cache key space stays small.
 */

export const progressQuerySchema = z.object({
  // Defaulted rather than required: `/api/progress` with no query is a
  // reasonable thing to ask for, and 30 days is the range the page opens on.
  range: z.enum(PROGRESS_RANGES).default('30d'),
})

export type ProgressQuery = z.infer<typeof progressQuerySchema>

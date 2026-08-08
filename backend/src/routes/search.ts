import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateQuery } from '../http/validate.js'
import { searchCards } from '../search/search.js'
import { requireUserId } from './cards.shared.js'
import { searchQuerySchema } from './search.schemas.js'
import type { SearchQuery } from './search.schemas.js'

/**
 * Search route (plan §6.1).
 *
 * Thin, like the progress routes: validation in the schema, the query in
 * `search/search.ts`, nothing in between. GET rather than POST despite the
 * number of filters — a search is a read, and making it a GET is what allows a
 * result page to be linked, bookmarked and reloaded.
 */

export const searchRouter = Router()

searchRouter.use(requireAuth)

searchRouter.get(
  '/',
  validateQuery(searchQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as SearchQuery
    res.json(await searchCards(requireUserId(req), query))
  }),
)

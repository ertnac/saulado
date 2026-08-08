import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateQuery } from '../http/validate.js'
import { getDashboard } from '../progress/dashboard.js'
import { getProgress } from '../progress/progress.js'
import { requireUserId } from './cards.shared.js'
import { progressQuerySchema } from './progress.schemas.js'
import type { ProgressQuery } from './progress.schemas.js'

/**
 * Dashboard and progress routes (plan §5.1).
 *
 * Thin, like `study.ts`, and for the same reasons: the clock is read once per
 * request and threaded down, so a request that straddles midnight in the user's
 * timezone cannot compute its streak against one day and its totals against the
 * next.
 *
 * Both routes are read-only aggregations over tables the study flow writes.
 * Neither can create or modify anything, which is why neither takes a body.
 */

export const dashboardRouter = Router()

dashboardRouter.use(requireAuth)

dashboardRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getDashboard(requireUserId(req), new Date()))
  }),
)

export const progressRouter = Router()

progressRouter.use(requireAuth)

progressRouter.get(
  '/',
  validateQuery(progressQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { range } = req.query as ProgressQuery
    res.json(await getProgress(requireUserId(req), range, new Date()))
  }),
)

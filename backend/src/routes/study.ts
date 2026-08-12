import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateBody } from '../http/validate.js'
import { getDueCounts } from '../study/due-counts.js'
import { submitAnswer } from '../study/grading.js'
import { completeSession, getSession, startSession } from '../study/session.js'
import { requireUserId } from './cards.shared.js'
import { startSessionSchema, submitAnswerSchema } from './study.schemas.js'
import type { StartSessionBody, SubmitAnswerBody } from './study.schemas.js'

/**
 * Study session routes (plan §4.1).
 *
 * Thin by design: every route resolves the caller, reads the clock once, and
 * hands off. The scheduling and grading logic lives in `src/study/` so it can be
 * tested without Supertest, and so the security-critical part — that grading
 * happens here and not in the browser — is one module rather than a property of
 * how the routes happen to be wired.
 *
 * `new Date()` is captured per request and threaded down rather than read inside
 * the service layer. A review that straddles midnight in the user's timezone
 * would otherwise be able to write its schedule under one day and its stats
 * under the next.
 */

export const studyRouter = Router()

studyRouter.use(requireAuth)

studyRouter.post(
  '/sessions',
  validateBody(startSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as StartSessionBody
    const session = await startSession(
      requireUserId(req),
      {
        studySetId: body.studySetId,
        mode: body.mode ?? 'spaced',
        retakeOf: body.retakeOf,
      },
      new Date(),
    )

    // 200, not 201. Starting a session is idempotent per open session — an
    // existing one is returned rather than duplicated — so "created" would be a
    // lie on the resume path, and the client cannot tell the cases apart anyway.
    res.json({ session })
  }),
)

studyRouter.get(
  '/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const session = await getSession(requireUserId(req), req.params.sessionId ?? '')
    res.json({ session })
  }),
)

studyRouter.post(
  '/sessions/:sessionId/answers',
  validateBody(submitAnswerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await submitAnswer({
      userId: requireUserId(req),
      sessionId: req.params.sessionId ?? '',
      body: req.body as SubmitAnswerBody,
      now: new Date(),
    })

    res.json(result)
  }),
)

studyRouter.post(
  '/sessions/:sessionId/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await completeSession(
      requireUserId(req),
      req.params.sessionId ?? '',
      new Date(),
    )

    res.json({ summary })
  }),
)

studyRouter.get(
  '/due',
  asyncHandler(async (req: Request, res: Response) => {
    const counts = await getDueCounts(requireUserId(req), new Date())
    res.json(counts)
  }),
)

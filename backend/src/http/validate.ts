import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodTypeAny, z } from 'zod'
import { sendError } from './errors.js'

/**
 * Wraps an async handler so a rejected promise reaches Express's error
 * middleware.
 *
 * Express 4 does not await handlers. An async handler that throws produces an
 * unhandled rejection and a request that hangs until the client times out —
 * with no log line tying it to the route. Every async route in this codebase
 * goes through here.
 */
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next)
  }
}

/**
 * Validates and *replaces* `req.body` with the parsed result.
 *
 * Replacing matters: Zod applies transforms (trimming, lowercasing) during
 * parse, so a handler reading the raw body would see the untransformed value and
 * silently bypass normalisation. After this runs, `req.body` is the parsed type
 * and nothing else can be in it — unknown keys are stripped by Zod's default
 * object behaviour.
 */
export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_'
        // First message per field — a list of five complaints about one input
        // is noise beside the field.
        fields[key] ??= issue.message
      }

      sendError(res, 'VALIDATION_ERROR', 'Please check the highlighted fields.', { fields })
      return
    }

    req.body = result.data as z.infer<T>
    next()
  }
}

/**
 * Same contract as `validateBody`, for query strings.
 *
 * Query values arrive as strings (or string arrays for repeated keys), so every
 * schema passed here must coerce — `listSetsQuerySchema` does via
 * `z.coerce.number()` and explicit enum handling. `req.query` is replaced with
 * the parsed result, keeping the unknown-key stripping that bodies get.
 *
 * Express 4 only: `req.query` is a mutable getter there. Express 5 makes it
 * read-only, so this helper would need to attach the parsed query to `res.locals`
 * instead if the project ever upgrades.
 */
export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)

    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_'
        fields[key] ??= issue.message
      }

      sendError(res, 'VALIDATION_ERROR', 'Please check the query parameters.', { fields })
      return
    }

    req.query = result.data as z.infer<T>
    next()
  }
}

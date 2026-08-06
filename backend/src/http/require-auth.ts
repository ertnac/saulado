import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { verifyAccessToken } from '../auth/jwt.js'
import { sendError } from './errors.js'

/**
 * Adds `req.userId` for authenticated requests.
 *
 * Declaration merging rather than a custom request type, so handlers keep the
 * plain Express signature and middleware ordering stays the only thing that
 * decides whether the field is present.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

/**
 * Rejects anything without a valid access token.
 *
 * Reads the bearer header only — never a cookie. The refresh cookie is scoped to
 * `/api/auth` and is not an access credential; accepting cookies here would make
 * every authenticated endpoint CSRF-reachable.
 *
 * Returns TOKEN_EXPIRED distinctly from UNAUTHORIZED so the client knows a
 * silent refresh is worth attempting.
 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const header = req.get('authorization')

  if (!header?.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required.')
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required.')
    return
  }

  void verifyAccessToken(token).then((result) => {
    if (!result.ok) {
      if (result.reason === 'expired') {
        sendError(res, 'TOKEN_EXPIRED', 'Access token expired.')
      } else {
        sendError(res, 'TOKEN_INVALID', 'Access token is not valid.')
      }
      return
    }

    req.userId = result.claims.sub
    next()
  })
}

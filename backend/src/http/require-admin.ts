import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { sendError } from './errors.js'

/**
 * Ensures the authenticated caller is an administrator.
 *
 * Runs after `requireAuth`. Resolves the caller's email and asserts that it is
 * contained in the configured `ADMIN_EMAILS` list.
 */
export const requireAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const userId = req.userId

  if (!userId) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required.')
    return
  }

  if (env.adminEmails.length === 0) {
    sendError(res, 'FORBIDDEN', 'Admin access required.')
    return
  }

  void prisma.user
    .findUnique({
      where: { id: userId },
      select: { email: true },
    })
    .then((user) => {
      if (!user || !env.adminEmails.includes(user.email.toLowerCase())) {
        sendError(res, 'FORBIDDEN', 'Admin access required.')
        return
      }

      next()
    })
    .catch(next)
}

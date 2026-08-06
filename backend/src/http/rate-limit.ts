import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit'
import type { Request, Response } from 'express'
import { env } from '../config/env.js'
import { sendError } from './errors.js'

/**
 * Rate limits for the auth routes.
 *
 * Disabled entirely under NODE_ENV=test: the integration suite makes dozens of
 * login attempts from one address, and a limiter would make test results depend
 * on execution order. The limiter itself is covered by a dedicated test that
 * builds an app with it forced on.
 */

function handler(_req: Request, res: Response, _next: unknown, options: Options): void {
  const retryAfter = Math.ceil(options.windowMs / 1000)
  sendError(res, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', { retryAfter })
}

const shared = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  skip: () => env.isTest,
  handler,
}

/**
 * Keyed on IP **and** email together, per the plan.
 *
 * IP alone lets one attacker behind one address lock every account they can name
 * — a denial of service against users, triggered by the defence. Email alone
 * lets a botnet spread attempts across addresses. The pair limits guessing at
 * one account from one source, which is the actual attack.
 *
 * `ipKeyGenerator` rather than `req.ip` directly: IPv6 hands a single subscriber
 * a whole /64, so keying on the full address would let one attacker walk through
 * addresses within their own allocation and get a fresh budget each time. The
 * helper normalises to the subnet prefix, which is the unit an attacker cannot
 * trivially rotate.
 */
function ipAndEmailKey(req: Request): string {
  const body = req.body as { email?: unknown } | undefined
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  return `${ipKeyGenerator(req.ip ?? 'unknown')}|${email}`
}

/** 5 attempts per 15 minutes, per plan §2.1. */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: ipAndEmailKey,
})

/**
 * Registration is limited by IP alone — the email is by definition new, so
 * including it would give every request a unique key and limit nothing.
 */
export const registerLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 10,
})

/**
 * Password reset requests. Tighter than login: each one sends an email, so an
 * unthrottled endpoint is a free mail cannon pointed at any address.
 */
export const passwordResetLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: ipAndEmailKey,
})

/**
 * Refresh is called legitimately every 15 minutes per tab, so the ceiling is
 * high enough not to punish someone with a dozen tabs open.
 */
export const refreshLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 60,
})

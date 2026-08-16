import { Prisma } from '@prisma/client'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AuthResponse, MessageResponse } from '@saulado/shared'
import {
  clearRefreshCookie,
  hasAllowedOrigin,
  isNativeClient,
  issueRefreshToken,
  readRefreshToken,
} from '../auth/cookies.js'
import { buildResetEmail, emailProvider } from '../auth/email.js'
import { burnPasswordTiming, hashPassword, verifyPassword } from '../auth/password.js'
import {
  issueSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  toPublicSettings,
  toPublicUser,
} from '../auth/session.js'
import { generateToken, hashToken } from '../auth/tokens.js'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { sendError } from '../http/errors.js'
import {
  loginLimiter,
  passwordResetLimiter,
  refreshLimiter,
  registerLimiter,
} from '../http/rate-limit.js'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateBody } from '../http/validate.js'
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  googleLoginSchema,
  type ForgotPasswordBody,
  type LoginBody,
  type RegisterBody,
  type ResetPasswordBody,
  type GoogleLoginBody,
} from './auth.schemas.js'

const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export const authRouter: Router = Router()

/**
 * Generic message for every failed credential check.
 *
 * Identical for "no such email" and "wrong password" on purpose. A distinct
 * "no account with that email" turns the login form into an account-existence
 * oracle, which is a privacy leak before it is a security one — it reveals who
 * has an account here.
 */
const INVALID_CREDENTIALS = 'Email or password is incorrect.'

/** Prisma's code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002'

/**
 * Builds the auth response and issues the refresh token in one step.
 *
 * The two are together because they are one decision. Every caller that returns
 * a session also has to hand over a refresh token, and it must reach the client
 * by exactly one route — cookie for a browser, response body for a native app,
 * never both. Splitting them left three call sites free to pick a different
 * answer, and one of them eventually would.
 */
function authPayload(
  req: Request,
  res: Response,
  user: Parameters<typeof toPublicUser>[0],
  settings: Parameters<typeof toPublicSettings>[0],
  session: { accessToken: string; expiresIn: number; refreshToken: string },
): AuthResponse {
  const refreshToken = issueRefreshToken(req, res, session.refreshToken)

  return {
    user: toPublicUser(user),
    settings: toPublicSettings(settings),
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    ...(refreshToken === undefined ? {} : { refreshToken }),
  }
}

// ── Register ────────────────────────────────────────────────────────────────

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as RegisterBody
    const passwordHash = await hashPassword(password)

    try {
      /**
       * User and settings in one transaction. A user with no settings row would
       * break every read that joins them, and "create the settings row lazily"
       * spreads that check across every future feature.
       */
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, passwordHash } })
        await tx.userSettings.create({ data: { userId: created.id } })
        return created
      })

      const settings = await prisma.userSettings.findUniqueOrThrow({
        where: { userId: user.id },
      })
      const session = await issueSession(user.id, req.get('user-agent'))

      res.status(201).json(authPayload(req, res, user, settings, session))
    } catch (err) {
      /**
       * Relies on the unique constraint rather than a prior SELECT. A
       * check-then-insert has a race window in which two concurrent
       * registrations both find the email free; the constraint has no such
       * window because the database arbitrates.
       */
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        sendError(res, 'EMAIL_TAKEN', 'An account with that email already exists.', {
          fields: { email: 'That email is already registered.' },
        })
        return
      }
      throw err
    }
  }),
)

// ── Login ───────────────────────────────────────────────────────────────────

authRouter.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as LoginBody

    const user = await prisma.user.findUnique({
      where: { email },
      include: { settings: true },
    })

    if (!user) {
      // Spend the same time a real bcrypt check would, so response latency does
      // not distinguish "unknown email" from "wrong password".
      await burnPasswordTiming(password)
      sendError(res, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS)
      return
    }

    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      if (!user.passwordHash) {
        await burnPasswordTiming(password)
      }
      sendError(res, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS)
      return
    }

    // Backfill for any account predating the settings-in-transaction guarantee.
    const settings =
      user.settings ?? (await prisma.userSettings.create({ data: { userId: user.id } }))

    const session = await issueSession(user.id, req.get('user-agent'))
    res.status(200).json(authPayload(req, res, user, settings, session))
  }),
)

// ── Google Login ────────────────────────────────────────────────────────────

authRouter.post(
  '/login/google',
  loginLimiter,
  validateBody(googleLoginSchema),
  asyncHandler(async (req, res) => {
    const { idToken } = req.body as GoogleLoginBody

    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload']
    try {
      const verified = await jwtVerify(idToken, googleJWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        clockTolerance: '5m',
      })
      payload = verified.payload
    } catch (err) {
      console.error('[auth] Google JWT verification failed', err)
      sendError(res, 'INVALID_CREDENTIALS', 'Invalid Google token.')
      return
    }

    if (!payload.email) {
      sendError(res, 'INVALID_CREDENTIALS', 'Google account has no email address.')
      return
    }

    const email = (payload.email as string).toLowerCase()
    const googleId = payload.sub as string

    let user = await prisma.user.findUnique({
      where: { email },
      include: { settings: true },
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          emailVerifiedAt: payload.email_verified ? new Date() : null,
          settings: { create: {} },
        },
        include: { settings: true },
      })
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId },
        include: { settings: true },
      })
    }

    const session = await issueSession(user.id, req.get('user-agent'))
    res.status(200).json(authPayload(req, res, user, user.settings!, session))
  }),
)

// ── Refresh ─────────────────────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    /**
     * The Origin check defends the cookie, so it applies only where a cookie is
     * in play. A native client authenticates by presenting a token it holds in
     * the keychain and sends deliberately — there is no ambient credential for a
     * forged cross-site request to ride, which is the only thing CSRF exploits.
     * Native apps also have no meaningful Origin to send.
     */
    if (!isNativeClient(req) && !hasAllowedOrigin(req)) {
      sendError(res, 'UNAUTHORIZED', 'Origin not allowed.')
      return
    }

    const presented = readRefreshToken(req)
    if (!presented) {
      sendError(res, 'TOKEN_INVALID', 'No refresh token present.')
      return
    }

    const result = await rotateSession(presented, req.get('user-agent'))

    if (!result.ok) {
      // Always clear the cookie on failure. Leaving a token the server has
      // rejected means the client retries with it every 15 minutes forever.
      clearRefreshCookie(res)

      if (result.reason === 'reused') {
        console.warn('[auth] refresh token reuse detected; family revoked')
        sendError(res, 'TOKEN_INVALID', 'Session ended for security reasons. Please sign in again.')
        return
      }

      sendError(res, 'TOKEN_EXPIRED', 'Session expired. Please sign in again.')
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      include: { settings: true },
    })

    if (!user) {
      // Account deleted while a valid refresh token was outstanding.
      clearRefreshCookie(res)
      sendError(res, 'TOKEN_INVALID', 'Account no longer exists.')
      return
    }

    const settings =
      user.settings ?? (await prisma.userSettings.create({ data: { userId: user.id } }))

    res.status(200).json(authPayload(req, res, user, settings, result.session))
  }),
)

// ── Logout ──────────────────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const presented = readRefreshToken(req)
    if (presented) await revokeSession(presented)

    // Cleared unconditionally. A native client has no cookie to clear, and
    // clearing one that was never set is a no-op — cheaper than branching.
    clearRefreshCookie(res)

    // 200 whether or not a token was present. Logout is idempotent — a client
    // clearing state should never have to handle a failure here.
    const body: MessageResponse = { message: 'Signed out.' }
    res.status(200).json(body)
  }),
)

// ── Current user ────────────────────────────────────────────────────────────

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { settings: true },
    })

    if (!user) {
      sendError(res, 'TOKEN_INVALID', 'Account no longer exists.')
      return
    }

    const settings =
      user.settings ?? (await prisma.userSettings.create({ data: { userId: user.id } }))

    res.status(200).json({
      user: toPublicUser(user),
      settings: toPublicSettings(settings),
    })
  }),
)

// ── Forgot password ─────────────────────────────────────────────────────────

/**
 * Always reports success.
 *
 * Reporting "no account with that email" here would leak membership to anyone
 * with a list of addresses, and it is the same leak the login response avoids —
 * pointless to close one and leave the other open.
 */
const RESET_REQUESTED = 'If that email has an account, a reset link is on its way.'

authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as ForgotPasswordBody
    const body: MessageResponse = { message: RESET_REQUESTED }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      res.status(200).json(body)
      return
    }

    /**
     * Invalidate outstanding resets before issuing a new one. Otherwise
     * requesting three links leaves three usable tokens, and the oldest stays
     * valid for its full hour after the user has already used a newer one.
     */
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    const token = generateToken()
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    })

    try {
      await emailProvider.send(buildResetEmail(user.email, token))
    } catch (err) {
      // Log and still return success. A provider outage must not become an
      // account-existence oracle, and the user retrying is the right recovery.
      console.error('[auth] reset email failed to send', err)
    }

    res.status(200).json(body)
  }),
)

// ── Reset password ──────────────────────────────────────────────────────────

authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as ResetPasswordBody
    const tokenHash = hashToken(token)

    const record = await prisma.passwordReset.findUnique({ where: { tokenHash } })

    const invalid = !record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()

    if (invalid) {
      // One message for missing, used, and expired. Distinguishing them tells a
      // token-guessing attacker which guesses were once real.
      sendError(res, 'TOKEN_INVALID', 'This reset link is invalid or has expired.')
      return
    }

    const passwordHash = await hashPassword(password)

    await prisma.$transaction(async (tx) => {
      /**
       * Consume by conditional update, not by writing unconditionally. Two
       * concurrent submissions of the same token would both pass the check
       * above; `usedAt: null` in the WHERE clause means exactly one can win.
       */
      const consumed = await tx.passwordReset.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      })

      if (consumed.count === 0) return

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })

      /**
       * Every session dies. Someone resetting a password may be doing it
       * *because* an attacker has their session — leaving other refresh tokens
       * alive would make the reset cosmetic.
       */
      await revokeAllSessions(record.userId, tx)
    })

    // The old refresh cookie in this browser was just revoked too.
    clearRefreshCookie(res)

    const body: MessageResponse = {
      message: 'Password updated. Please sign in with your new password.',
    }
    res.status(200).json(body)
  }),
)

import { Prisma } from '@prisma/client'
import type { User } from '@prisma/client'
import { Router } from 'express'
import type { Request, Response } from 'express'
import type { MessageResponse, SettingsResponse } from '@saulado/shared'
import { buildExport } from '../account/export.js'
import { consumeEmailChange, createEmailChange } from '../account/email-change.js'
import { clearRefreshCookie } from '../auth/cookies.js'
import { buildEmailChangeEmail, buildEmailChangedNotice, emailProvider } from '../auth/email.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { revokeAllSessions, toPublicSettings } from '../auth/session.js'
import { prisma } from '../db/client.js'
import { sendError } from '../http/errors.js'
import { accountLimiter } from '../http/rate-limit.js'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler, validateBody } from '../http/validate.js'
import { loadSettings } from '../study/settings.js'
import { requireUserId } from './cards.shared.js'
import {
  changeEmailSchema,
  changePasswordSchema,
  confirmEmailChangeSchema,
  deleteAccountSchema,
  updateSettingsSchema,
} from './account.schemas.js'
import type {
  ChangeEmailBody,
  ChangePasswordBody,
  ConfirmEmailChangeBody,
  DeleteAccountBody,
  UpdateSettingsBody,
} from './account.schemas.js'

/** Prisma's "record to update or delete does not exist". */
const RECORD_NOT_FOUND = 'P2025'

/**
 * Settings and account routes (plan §6.4, §6.5).
 *
 * Every mutation here re-checks the current password. An access token is fifteen
 * minutes of proof that someone had the password once; changing the address a
 * reset email goes to, or deleting the library, needs proof they have it now.
 * That is the difference between a stolen token being an inconvenience and it
 * being an account takeover.
 *
 * `PATCH /api/settings` is the exception — it is preference state, not a
 * credential, and prompting for a password to toggle dark mode would train users
 * to type it into any box that asks.
 */

export const accountRouter = Router()
export const settingsRouter = Router()

/**
 * The account routes that must work *without* a session.
 *
 * A separate router because `accountRouter` applies `requireAuth` to everything
 * on it, and confirming an email change is the one account operation whose
 * credential arrives by email rather than in a header. Mounting it here rather
 * than relying on being registered above the `requireAuth` line keeps the
 * property from depending on statement order within this file.
 */
export const accountPublicRouter = Router()

settingsRouter.use(requireAuth)
accountRouter.use(requireAuth)

/**
 * The limiter sits after `requireAuth` so it can key on the user id, and it is
 * mounted on the router rather than per-route because the read-only endpoints
 * need it too: `GET /api/account/export` walks a user's entire library, which is
 * the most expensive query in the app.
 */
accountRouter.use(accountLimiter)

/**
 * The same limiter on the public router, where it falls back to keying on the IP
 * because there is no `req.userId` to key on. Confirming consumes a token, so
 * unthrottled it would be a token-guessing endpoint.
 */
accountPublicRouter.use(accountLimiter)

/**
 * Re-authenticates the caller.
 *
 * `missing` distinguishes the two failures, because one route wants them handled
 * differently. **The account is gone** is a real case, not a defensive one:
 * `requireAuth` verifies a signature and never reads the database, so an access
 * token outlives the row it names by up to its full fifteen minutes. Loading the
 * user with `findUniqueOrThrow` turned that into an unclassified 500 — which is
 * exactly what a second click on "delete my account" from a stale tab produced.
 */
type Reauth = { ok: true; user: User } | { ok: false; missing: boolean }

async function reauthenticate(req: Request, currentPassword: string): Promise<Reauth> {
  const user = await prisma.user.findUnique({ where: { id: requireUserId(req) } })
  if (!user) return { ok: false, missing: true }

  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, missing: false }
  }

  return { ok: true, user }
}

/**
 * The 401 for a failed re-authentication.
 *
 * `DELETE` does not use this for the missing case — an account that is already
 * gone is that route's goal, not its failure — so the two are kept separate
 * rather than folded into `reauthenticate` itself.
 */
function rejectReauth(res: Response, result: { missing: boolean }): void {
  if (result.missing) {
    clearRefreshCookie(res)
    sendError(res, 'TOKEN_INVALID', 'That account no longer exists.')
    return
  }
  sendError(res, 'INVALID_CREDENTIALS', 'That password is not correct.')
}

settingsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const settings = await loadSettings(requireUserId(req))
    res.json({ settings } satisfies SettingsResponse)
  }),
)

/**
 * Partial update: only the keys present in the body are written.
 *
 * `upsert`, not `update`. Settings rows are created with the user, but a row
 * missing for any reason — an older account, a restore, a seed script — would
 * make this 500 on a screen whose whole purpose is fixing settings. The create
 * branch starts from the defaults so an upsert cannot write a half-populated row.
 */
settingsRouter.patch(
  '/',
  validateBody(updateSettingsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req)
    const patch = req.body as UpdateSettingsBody

    const row = await prisma.userSettings.upsert({
      where: { userId },
      update: patch,
      create: { userId, ...patch },
    })

    res.json({ settings: toPublicSettings(row) } satisfies SettingsResponse)
  }),
)

/**
 * Step one of an email change: send a confirmation link to the *new* address.
 *
 * The address is not written yet. Writing it here would take one typo —
 * `user@gmial.com` — and move every future reset email to an address the user
 * cannot read, locking them out of their own account with no way back. Confirming
 * from the new inbox proves it is reachable before it becomes the login.
 *
 * Responds 202 with no indication of whether the address was already taken. The
 * duplicate is caught at confirm time instead; answering here would turn this
 * into a membership oracle — anyone with an account could test addresses.
 */
accountRouter.post(
  '/email',
  validateBody(changeEmailSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req)
    const { email, currentPassword } = req.body as ChangeEmailBody

    const result = await reauthenticate(req, currentPassword)
    if (!result.ok) {
      rejectReauth(res, result)
      return
    }

    if (email === result.user.email) {
      sendError(res, 'VALIDATION_ERROR', 'Please check the highlighted fields.', {
        fields: { email: 'That is already your email address.' },
      })
      return
    }

    const { token } = await createEmailChange(userId, email)
    await emailProvider.send(buildEmailChangeEmail(email, token))

    res.status(202).json({
      message: 'Check your new inbox for a link to confirm the change.',
    } satisfies MessageResponse)
  }),
)

/**
 * Step two: the token from the new inbox.
 *
 * On `accountPublicRouter`, so it works with no access token. The token is the
 * credential — it was mailed to the new address and proves the holder can read
 * it, which is the fact this step exists to establish — and requiring a session
 * as well would mean the link only worked in the browser that asked for the
 * change. The natural device for reading mail sent to a *new* address is often
 * not that one. The dangerous half was already gated: `POST /email` demanded the
 * password before this token was ever issued.
 *
 * Sessions are revoked on success, matching the reset flow: if the change was not
 * the user's doing, this is what ends the attacker's access.
 */
accountPublicRouter.post(
  '/email/confirm',
  validateBody(confirmEmailChangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body as ConfirmEmailChangeBody
    const result = await consumeEmailChange(token)

    if (result.ok === false) {
      if (result.reason === 'taken') {
        sendError(res, 'EMAIL_TAKEN', 'That email address is already registered.')
        return
      }
      sendError(res, 'TOKEN_INVALID', 'That confirmation link is invalid or has expired.')
      return
    }

    // To the *old* address, and after the change rather than before: it is the
    // only warning the previous owner gets, and it is worthless if the send is
    // what fails. A failed notice must not roll back a completed change.
    try {
      await emailProvider.send(buildEmailChangedNotice(result.previousEmail, result.email))
    } catch (error) {
      console.error('[account] email-changed notice failed to send', error)
    }

    // Every session was revoked, including this browser's. Clearing the cookie
    // stops the client retrying a token the server has already rejected.
    clearRefreshCookie(res)

    res.json({
      message: 'Email address updated. Please sign in again.',
    } satisfies MessageResponse)
  }),
)

accountRouter.post(
  '/password',
  validateBody(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req)
    const { currentPassword, newPassword } = req.body as ChangePasswordBody

    const passwordResult = await reauthenticate(req, currentPassword)
    if (!passwordResult.ok) {
      rejectReauth(res, passwordResult)
      return
    }

    const passwordHash = await hashPassword(newPassword)

    // One transaction: a hash written without the revocation would leave every
    // stolen session alive behind a password the user believes they changed.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } })
      await revokeAllSessions(userId, tx)
    })

    // This browser's refresh token died with the rest.
    clearRefreshCookie(res)

    res.json({
      message: 'Password updated. Please sign in again.',
    } satisfies MessageResponse)
  }),
)

/**
 * The full export (plan §6.5).
 *
 * `Content-Disposition: attachment` so a browser saves it instead of rendering a
 * megabyte of JSON, and `no-store` because the file is the user's entire library
 * — a copy in a shared disk cache is exactly the leak this endpoint exists to
 * avoid being.
 */
accountRouter.get(
  '/export',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await buildExport(requireUserId(req))

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="saulado-export.json"')
    res.setHeader('Cache-Control', 'no-store')
    res.json(data)
  }),
)

/**
 * Hard delete, cascading (plan §6.5).
 *
 * Not a soft delete. "Delete my account" from a GDPR erasure request means the
 * rows are gone, and an `deleted_at` column that keeps every paragraph and every
 * review satisfies the button but not the obligation.
 *
 * One `delete` is the whole operation: every table referencing `users` declares
 * `onDelete: Cascade`, so Postgres removes settings, sets, cards, answers,
 * schedules, reviews, daily stats, sessions, reset tokens and pending email
 * changes in one statement. Deleting them in application code would be a
 * hand-maintained list that silently misses whatever table is added next.
 */
accountRouter.delete(
  '/',
  validateBody(deleteAccountSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req)
    const { currentPassword } = req.body as DeleteAccountBody

    const deleteResult = await reauthenticate(req, currentPassword)

    if (!deleteResult.ok) {
      /**
       * A missing account is this route's goal, not its failure. Two tabs and
       * two clicks: the second arrives with an access token that is still
       * perfectly valid — `requireAuth` checks a signature and never reads the
       * database — and finds nothing to delete. The caller already proved they
       * held the password when that token was issued, and there is no longer
       * anything to protect, so this is a 204 rather than a 401.
       */
      if (deleteResult.missing) {
        clearRefreshCookie(res)
        res.status(204).end()
        return
      }

      rejectReauth(res, deleteResult)
      return
    }

    try {
      await prisma.user.delete({ where: { id: userId } })
    } catch (err) {
      /**
       * The genuine race: two concurrent requests both pass the check above and
       * one deletes first. (The ordinary stale-tab case is handled above, where
       * there is a row to look for.) The user's intent is satisfied either way.
       */
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === RECORD_NOT_FOUND) {
        clearRefreshCookie(res)
        res.status(204).end()
        return
      }
      throw err
    }

    // The cascade took the refresh tokens with it; clear the cookie so the
    // client is not left presenting one against an account that is gone.
    clearRefreshCookie(res)
    res.status(204).end()
  }),
)

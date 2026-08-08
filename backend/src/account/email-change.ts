import { Prisma } from '@prisma/client'
import type { User } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { generateToken, hashToken } from '../auth/tokens.js'
import { revokeAllSessions } from '../auth/session.js'

/**
 * The two-step email change (plan §6.5).
 *
 * Split from the route because the interesting part is not HTTP: it is that the
 * new address is held in `email_changes` and only moved onto `users` once
 * someone proves they can read it. See `ConfirmEmailChangeRequest` in shared for
 * why that ordering is the whole design.
 *
 * Tokens are handled exactly like password resets — random, stored as a SHA-256
 * digest, single-use via `usedAt` rather than deletion so a replay can be told
 * apart from an expiry.
 */

export const EMAIL_CHANGE_TTL_MS = env.EMAIL_CHANGE_TTL_MINUTES * 60 * 1000

/** Prisma's code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002'

export async function createEmailChange(
  userId: string,
  newEmail: string,
): Promise<{ token: string }> {
  const token = generateToken()

  await prisma.$transaction(async (tx) => {
    /**
     * Retire outstanding requests before issuing a new one. Otherwise asking
     * three times leaves three live links, and the first — possibly pointing at
     * an address the user has since decided against — keeps working for its full
     * window after they corrected it.
     */
    await tx.emailChange.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })

    await tx.emailChange.create({
      data: {
        userId,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
      },
    })
  })

  return { token }
}

export type ConsumeResult =
  | { ok: true; user: User; previousEmail: string; email: string }
  | { ok: false; reason: 'invalid' | 'taken' }

/**
 * Applies a confirmed change.
 *
 * The uniqueness of the new address is decided *here*, not when the change was
 * requested. Between the two steps someone else may have registered it, and a
 * check at request time would be a promise the database had not made. The
 * constraint on `users.email` is the only authority, and it is consulted at the
 * moment the value is actually written.
 *
 * A collision throws out of the transaction, which rolls back the `usedAt`
 * stamp as well as the update. That matters: a consumed token plus an unchanged
 * address would be a dead end, with the user holding a link that can never work
 * and no way to tell why.
 */
export async function consumeEmailChange(token: string): Promise<ConsumeResult> {
  const record = await prisma.emailChange.findUnique({ where: { tokenHash: hashToken(token) } })

  if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
    // One answer for missing, used and expired. Distinguishing them tells
    // someone guessing tokens which guesses were once real.
    return { ok: false, reason: 'invalid' }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      /**
       * Consume by conditional update. Two clicks on the same link both pass the
       * check above; `usedAt: null` in the WHERE means exactly one wins, and the
       * loser is indistinguishable from a replay — which is what it is.
       */
      const consumed = await tx.emailChange.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      })

      if (consumed.count === 0) return { ok: false as const, reason: 'invalid' as const }

      const before = await tx.user.findUnique({ where: { id: record.userId } })
      if (!before) return { ok: false as const, reason: 'invalid' as const }

      const user = await tx.user.update({
        where: { id: record.userId },
        data: {
          email: record.newEmail,
          /**
           * Verified as a side effect: the only way to reach this line is by
           * opening a link mailed to this address, which is precisely what
           * verification means. Leaving it null would ask the user to prove the
           * same thing twice.
           */
          emailVerifiedAt: new Date(),
        },
      })

      /**
       * Every session ends, as after a password reset. If this change was not
       * the owner's doing, the attacker's session is the thing that has to die —
       * and the confirmation may well arrive from a device that was never signed
       * in, so there is no "current session" worth preserving anyway.
       */
      await revokeAllSessions(record.userId, tx)

      return {
        ok: true as const,
        user,
        previousEmail: before.email,
        email: user.email,
      }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: 'taken' }
    }
    throw error
  }
}

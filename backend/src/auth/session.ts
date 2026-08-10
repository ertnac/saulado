import type { PrismaClient, User, UserSettings } from '@prisma/client'
import type { AuthResponse, BlankWidthMode, PublicUser } from '@saulado/shared'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from './jwt.js'
import { generateFamilyId, generateToken, hashToken } from './tokens.js'

/** Serialise a user for the wire. The password hash must never leave this file. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  }
}

export function toPublicSettings(settings: UserSettings): AuthResponse['settings'] {
  return {
    darkMode: settings.darkMode,
    dailyGoal: settings.dailyGoal,
    newCardsPerDay: settings.newCardsPerDay,
    notificationsEnabled: settings.notificationsEnabled,
    typoTolerance: settings.typoTolerance,
    // The column is TEXT; narrow it back to the union on the way out.
    blankWidthMode: (settings.blankWidthMode === 'proportional'
      ? 'proportional'
      : 'fixed') satisfies BlankWidthMode,
    timezone: settings.timezone,
    nickname: settings.nickname,
    profileImage: settings.profileImage,
  }
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export interface IssuedSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * Issues a fresh access + refresh pair, starting a new rotation family.
 *
 * Called on register and login. Refresh (`rotateSession`) continues an existing
 * family instead.
 */
export async function issueSession(
  userId: string,
  userAgent: string | undefined,
  client: Pick<PrismaClient, 'refreshToken'> = prisma,
): Promise<IssuedSession> {
  const refreshToken = generateToken()

  await client.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      familyId: generateFamilyId(),
      expiresAt: refreshExpiry(),
      userAgent: userAgent?.slice(0, 512) ?? null,
    },
  })

  return {
    accessToken: await signAccessToken(userId),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  }
}

export type RotateResult =
  | { ok: true; session: IssuedSession; userId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' }

/**
 * Rotates a refresh token, detecting reuse.
 *
 * Every refresh invalidates the token that was presented and issues a new one in
 * the same family. That means a token is valid exactly once, so seeing an
 * already-revoked token is evidence the value leaked — a legitimate client never
 * replays one.
 *
 * The response to that evidence is to revoke the entire family, not just the
 * replayed token. Consider the attacker stealing a token and refreshing first:
 * they now hold a valid token and the real user holds a revoked one. When the
 * real user next refreshes, that lands here. Killing only their token would log
 * out the victim and leave the attacker with the live session — precisely
 * backwards. Killing the family logs out both, and the user's next login is
 * clean.
 *
 * The find-then-write sequence runs in a transaction so two concurrent refreshes
 * of the same token cannot both succeed.
 */
export async function rotateSession(
  presentedToken: string,
  userAgent: string | undefined,
): Promise<RotateResult> {
  const tokenHash = hashToken(presentedToken)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.refreshToken.findUnique({ where: { tokenHash } })

    if (!existing) return { ok: false, reason: 'unknown' as const }

    if (existing.revokedAt !== null) {
      // Reuse. Burn the whole chain.
      await tx.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return { ok: false, reason: 'reused' as const }
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' as const }
    }

    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    })

    const refreshToken = generateToken()
    await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(refreshToken),
        familyId: existing.familyId,
        expiresAt: refreshExpiry(),
        userAgent: userAgent?.slice(0, 512) ?? null,
      },
    })

    return {
      ok: true as const,
      userId: existing.userId,
      session: {
        accessToken: await signAccessToken(existing.userId),
        refreshToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    }
  })
}

/**
 * Revokes a single token on logout.
 *
 * Deliberately does not revoke the family: logging out of a laptop should not
 * end the session on a phone. Reuse detection still covers the theft case.
 */
export async function revokeSession(presentedToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Ends every session for a user. Used after a password reset. */
export async function revokeAllSessions(
  userId: string,
  client: Pick<PrismaClient, 'refreshToken'> = prisma,
): Promise<void> {
  await client.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

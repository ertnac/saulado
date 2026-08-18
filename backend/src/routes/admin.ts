import type { Prisma } from '@prisma/client'
import { Router } from 'express'
import type {
  AdminOverviewResponse,
  AdminUsersResponse,
  AdminUserSummary,
  AuthProviderType,
} from '@saulado/shared'
import { prisma } from '../db/client.js'
import { requireAuth } from '../http/require-auth.js'
import { requireAdmin } from '../http/require-admin.js'
import { asyncHandler, validateQuery } from '../http/validate.js'
import { adminUsersQuerySchema, type AdminUsersQueryInput } from './admin.schemas.js'

export const adminRouter: Router = Router()

// Every admin route requires valid authentication and administrator privileges.
adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)

/**
 * Validates admin status.
 */
adminRouter.get('/me', (_req, res) => {
  res.json({ isAdmin: true })
})

/**
 * Aggregated platform overview metrics and user growth trend.
 */
adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      totalSets,
      totalCards,
      totalReviews,
      active24hRaw,
      active7dRaw,
      active30dRaw,
      recentSignups,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.studySet.count(),
      prisma.studyCard.count(),
      prisma.review.count(),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT user_id)::bigint as count FROM (
          SELECT user_id FROM reviews WHERE reviewed_at >= ${twentyFourHoursAgo}
          UNION
          SELECT user_id FROM study_sessions WHERE started_at >= ${twentyFourHoursAgo}
          UNION
          SELECT user_id FROM refresh_tokens WHERE created_at >= ${twentyFourHoursAgo}
        ) active`,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT user_id)::bigint as count FROM (
          SELECT user_id FROM reviews WHERE reviewed_at >= ${sevenDaysAgo}
          UNION
          SELECT user_id FROM study_sessions WHERE started_at >= ${sevenDaysAgo}
          UNION
          SELECT user_id FROM refresh_tokens WHERE created_at >= ${sevenDaysAgo}
        ) active`,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT user_id)::bigint as count FROM (
          SELECT user_id FROM reviews WHERE reviewed_at >= ${thirtyDaysAgo}
          UNION
          SELECT user_id FROM study_sessions WHERE started_at >= ${thirtyDaysAgo}
          UNION
          SELECT user_id FROM refresh_tokens WHERE created_at >= ${thirtyDaysAgo}
        ) active`,
      prisma.user.findMany({
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
    ])

    // Build 14-day date bucket map
    const signupTrendMap = new Map<string, number>()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      signupTrendMap.set(key, 0)
    }

    for (const u of recentSignups) {
      const key = u.createdAt.toISOString().slice(0, 10)
      if (signupTrendMap.has(key)) {
        signupTrendMap.set(key, (signupTrendMap.get(key) ?? 0) + 1)
      }
    }

    const signupTrend = Array.from(signupTrendMap.entries()).map(([date, count]) => ({
      date,
      count,
    }))

    const body: AdminOverviewResponse = {
      metrics: {
        totalUsers,
        newUsersToday,
        newUsersThisWeek,
        activeUsers24h: Number(active24hRaw[0]?.count ?? 0),
        activeUsers7d: Number(active7dRaw[0]?.count ?? 0),
        activeUsers30d: Number(active30dRaw[0]?.count ?? 0),
        totalSets,
        totalCards,
        totalReviews,
      },
      signupTrend,
    }

    res.json(body)
  }),
)

/**
 * Paginated and searchable users list with individual statistics.
 */
adminRouter.get(
  '/users',
  validateQuery(adminUsersQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, limit, search, filter, sort } = req.query as unknown as AdminUsersQueryInput
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Build search & filter conditions
    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { settings: { nickname: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter === 'verified' ? { emailVerifiedAt: { not: null } } : {}),
      ...(filter === 'google' ? { googleId: { not: null } } : {}),
      ...(filter === 'password' ? { passwordHash: { not: null } } : {}),
      ...(filter === 'active'
        ? {
            OR: [
              { reviews: { some: { reviewedAt: { gte: sevenDaysAgo } } } },
              { studySessions: { some: { startedAt: { gte: sevenDaysAgo } } } },
            ],
          }
        : {}),
    }

    // Build sort order
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' }
    if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' }
    } else if (sort === 'most_active') {
      orderBy = { reviews: { _count: 'desc' } }
    } else if (sort === 'most_cards') {
      orderBy = { studySets: { _count: 'desc' } }
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          googleId: true,
          passwordHash: true,
          createdAt: true,
          emailVerifiedAt: true,
          settings: {
            select: {
              nickname: true,
              profileImage: true,
            },
          },
          _count: {
            select: {
              studySets: true,
              reviews: true,
            },
          },
          reviews: {
            take: 1,
            orderBy: { reviewedAt: 'desc' },
            select: { reviewedAt: true },
          },
          studySessions: {
            take: 1,
            orderBy: { startedAt: 'desc' },
            select: { startedAt: true },
          },
          refreshTokens: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    // Query card counts aggregated by user
    const userIds = users.map((u) => u.id)
    const cardCountByUser = new Map<string, number>()

    if (userIds.length > 0) {
      const sets = await prisma.studySet.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          _count: { select: { cards: true } },
        },
      })
      for (const set of sets) {
        cardCountByUser.set(set.userId, (cardCountByUser.get(set.userId) ?? 0) + set._count.cards)
      }
    }

    const userSummaries: AdminUserSummary[] = users.map((u) => {
      let authProvider: AuthProviderType = 'password'
      if (u.googleId && u.passwordHash) {
        authProvider = 'both'
      } else if (u.googleId) {
        authProvider = 'google'
      }

      // Determine most recent activity timestamp across reviews, sessions, tokens
      const reviewDate = u.reviews[0]?.reviewedAt ?? null
      const sessionDate = u.studySessions[0]?.startedAt ?? null
      const tokenDate = u.refreshTokens[0]?.createdAt ?? null

      const timestamps = [
        reviewDate?.getTime() ?? 0,
        sessionDate?.getTime() ?? 0,
        tokenDate?.getTime() ?? 0,
      ]
      const maxTimestamp = Math.max(...timestamps)
      const lastActiveAt = maxTimestamp > 0 ? new Date(maxTimestamp).toISOString() : null

      return {
        id: u.id,
        email: u.email,
        nickname: u.settings?.nickname || '',
        profileImage: u.settings?.profileImage ?? null,
        createdAt: u.createdAt.toISOString(),
        emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
        authProvider,
        setCount: u._count.studySets,
        cardCount: cardCountByUser.get(u.id) ?? 0,
        reviewCount: u._count.reviews,
        lastActiveAt,
      }
    })

    const totalPages = Math.ceil(total / limit)
    const body: AdminUsersResponse = {
      users: userSummaries,
      total,
      page,
      limit,
      totalPages,
    }

    res.json(body)
  }),
)

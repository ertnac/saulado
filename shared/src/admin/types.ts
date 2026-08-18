/**
 * Wire contracts for the Admin Dashboard API.
 *
 * Types only, no Zod — same rule as the rest of `shared`.
 */

export interface AdminOverviewMetrics {
  totalUsers: number
  newUsersToday: number
  newUsersThisWeek: number
  activeUsers24h: number
  activeUsers7d: number
  activeUsers30d: number
  totalSets: number
  totalCards: number
  totalReviews: number
}

export interface SignupTrendPoint {
  date: string
  count: number
}

export interface AdminOverviewResponse {
  metrics: AdminOverviewMetrics
  signupTrend: SignupTrendPoint[]
}

export type AuthProviderType = 'google' | 'password' | 'both'

export interface AdminUserSummary {
  id: string
  email: string
  nickname: string
  profileImage: string | null
  createdAt: string
  emailVerifiedAt: string | null
  authProvider: AuthProviderType
  setCount: number
  cardCount: number
  reviewCount: number
  lastActiveAt: string | null
}

export type AdminUserFilter = 'all' | 'verified' | 'google' | 'password' | 'active'
export type AdminUserSort = 'newest' | 'oldest' | 'most_active' | 'most_cards'

export interface AdminUsersQuery {
  page?: number
  limit?: number
  search?: string
  filter?: AdminUserFilter
  sort?: AdminUserSort
}

export interface AdminUsersResponse {
  users: AdminUserSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
}

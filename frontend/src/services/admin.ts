import type { AdminOverviewResponse, AdminUsersQuery, AdminUsersResponse } from '@saulado/shared'
import { authorizedRequest } from './api'

/**
 * Checks if the current user has admin privileges.
 */
export function checkAdminStatus(): Promise<{ isAdmin: boolean }> {
  return authorizedRequest<{ isAdmin: boolean }>('/api/admin/me')
}

/**
 * Loads platform-wide metrics and user growth trends.
 */
export function getAdminOverview(): Promise<AdminOverviewResponse> {
  return authorizedRequest<AdminOverviewResponse>('/api/admin/overview')
}

/**
 * Loads paginated and filtered users list.
 */
export function getAdminUsers(query: AdminUsersQuery = {}): Promise<AdminUsersResponse> {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter)
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort)

  const qs = params.toString()
  return authorizedRequest<AdminUsersResponse>(`/api/admin/users${qs ? `?${qs}` : ''}`)
}

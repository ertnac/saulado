import type { AdminOverviewResponse, AdminUsersQuery, AdminUsersResponse } from '@saulado/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import * as api from '@/services/admin'

export const adminKeys = {
  all: ['admin'] as const,
  check: () => [...adminKeys.all, 'check'] as const,
  overview: () => [...adminKeys.all, 'overview'] as const,
  users: (query: AdminUsersQuery = {}) => [...adminKeys.all, 'users', query] as const,
}

export function useAdminCheck(): UseQueryResult<{ isAdmin: boolean }> {
  const status = useAuthStore((s) => s.status)
  return useQuery({
    queryKey: adminKeys.check(),
    queryFn: () => api.checkAdminStatus(),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: status === 'authenticated',
  })
}

export function useAdminOverview(): UseQueryResult<AdminOverviewResponse> {
  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: () => api.getAdminOverview(),
    staleTime: 30_000,
  })
}

export function useAdminUsers(query: AdminUsersQuery = {}): UseQueryResult<AdminUsersResponse> {
  return useQuery({
    queryKey: adminKeys.users(query),
    queryFn: () => api.getAdminUsers(query),
    staleTime: 30_000,
  })
}

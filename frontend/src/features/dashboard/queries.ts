import type { DashboardResponse, ProgressRange, ProgressResponse } from '@saulado/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import * as api from '@/services/progress'

/**
 * Caching for the dashboard and progress views (plan §5.1).
 *
 * Both are read-only aggregates, so there are no mutations here — the things
 * that change these numbers are answers submitted in `features/study/queries.ts`,
 * and that file already invalidates this one's keys.
 */

export const dashboardKeys = {
  all: ['dashboard'] as const,
}

export const progressKeys = {
  all: ['progress'] as const,
  /**
   * Keyed by range, so switching 30d → 90d → 30d renders the cached 30-day view
   * instantly rather than refetching what is already in hand. Four ranges is a
   * bounded cache; a free-form day count would not be.
   */
  range: (range: ProgressRange) => [...progressKeys.all, range] as const,
}

/**
 * The whole dashboard, in one request.
 *
 * `staleTime` matches `useDueCounts` deliberately — the two overlap (both carry
 * a due count) and giving them different lifetimes would let the same number
 * disagree with itself on one screen.
 *
 * Refetches on focus, which is the behaviour that matters here: studying in
 * another tab and coming back must not show the backlog as it was ten minutes
 * ago.
 */
export function useDashboard(): UseQueryResult<DashboardResponse> {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => api.getDashboard(),
    staleTime: 30_000,
  })
}

/**
 * A window of history.
 *
 * Longer `staleTime` than the dashboard: this is a page the user opens
 * deliberately, and every day in it except the last is immutable. Refetching a
 * 365-day scan on every window focus would be a wide read to learn nothing.
 */
export function useProgress(range: ProgressRange): UseQueryResult<ProgressResponse> {
  return useQuery({
    queryKey: progressKeys.range(range),
    queryFn: () => api.getProgress(range),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

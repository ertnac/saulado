import type { DashboardResponse, ProgressRange, ProgressResponse } from '@saulado/shared'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import * as api from '../services/progress'

/**
 * Caching for the dashboard and progress screens — a port of
 * `frontend/src/features/dashboard/queries.ts`.
 *
 * Both are read-only aggregates, so there are no mutations here: the things that
 * change these numbers are answers submitted in `hooks/useStudySession.ts`, and
 * that file already invalidates these keys.
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
 */
export function useDashboard(): UseQueryResult<DashboardResponse> {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => api.getDashboard(),
    staleTime: 30_000,
  })
}

export function usePrefetchDashboard() {
  const client = useQueryClient()
  return () => {
    void client.prefetchQuery({
      queryKey: dashboardKeys.all,
      queryFn: () => api.getDashboard(),
    })
  }
}

/**
 * A window of history.
 *
 * Longer `staleTime` than the dashboard: this is a screen the user opens
 * deliberately, and every day in it except the last is immutable.
 *
 * The web version also sets `refetchOnWindowFocus: false`. Dropped rather than
 * ported — there is no window to focus in a native app, so it would be a line
 * that reads as a decision and controls nothing.
 */
export function useProgress(range: ProgressRange): UseQueryResult<ProgressResponse> {
  return useQuery({
    queryKey: progressKeys.range(range),
    queryFn: () => api.getProgress(range),
    staleTime: 5 * 60_000,
  })
}

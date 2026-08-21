import type { DueCountsResponse } from '@saulado/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import * as api from '../services/study'

export const studyKeys = {
  all: ['study'] as const,
  sessions: () => [...studyKeys.all, 'session'] as const,
  session: (id: string) => [...studyKeys.sessions(), id] as const,
  due: () => [...studyKeys.all, 'due'] as const,
}

/**
 * Today's due and mastery counts, per set.
 *
 * Short `staleTime` rather than `Infinity`: this number changes when the user
 * studies, and it is cheap to refetch.
 */
export function useDueCounts(): UseQueryResult<DueCountsResponse> {
  return useQuery({
    queryKey: studyKeys.due(),
    queryFn: () => api.getDueCounts(),
    staleTime: 30_000,
  })
}

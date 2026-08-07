import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/services/api'

/**
 * The silent-refresh interceptor is *not* here — it lives in `services/api`, at
 * the fetch layer. Putting it in a Query `retry` handler would cover queries and
 * miss every mutation, so a form submit with an expired token would fail while a
 * background list refetch quietly recovered. One interceptor, below both.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Retrying an auth or validation failure just repeats it three times
         * before showing the same message, and each repeat spends another slot
         * against the rate limiter. Only retry things that are plausibly
         * transient.
         */
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            const permanent =
              error.status === 401 ||
              error.status === 403 ||
              error.status === 404 ||
              error.status === 422 ||
              error.code === 'VALIDATION_ERROR' ||
              error.code === 'RATE_LIMITED'
            if (permanent) return false
          }
          return failureCount < 2
        },
        staleTime: 30_000,
        // The window regaining focus is not evidence the data changed, and a
        // refetch storm on every alt-tab is a visible jank source on mobile.
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

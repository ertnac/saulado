import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { ApiError } from '../services/api'

/**
 * React Query's online state, driven by the radio.
 *
 * The browser default reads `navigator.onLine`, which does not exist here. Left
 * unset, React Query assumes it is always online: a query that fails in a lift
 * burns its retries immediately and then sits there, because the "back online"
 * event that would refetch it is never fired. With NetInfo attached, failed
 * queries pause while the connection is down and resume the moment it returns.
 *
 * Registered at module scope so it is active before the first query runs.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    /**
     * `isInternetReachable` is `null` while NetInfo is still probing, and
     * treating that as offline would pause every query on a cold start. Only a
     * definite `false` counts as offline; `isConnected` alone is not enough,
     * because a captive-portal Wi-Fi reports connected and reaches nothing.
     */
    setOnline(state.isConnected === true && state.isInternetReachable !== false)
  }),
)

/**
 * Ported from `frontend/src/lib/query-client.ts`.
 *
 * The silent-refresh interceptor is *not* here — it lives in `services/api`, at
 * the fetch layer. Putting it in a Query `retry` handler would cover queries and
 * miss every mutation, so a form submit with an expired token would fail while a
 * background list refetch quietly recovered. One interceptor, below both.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
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
      staleTime: 1000 * 60 * 60, // 1 hour stale time for UI snappiness
      gcTime: 1000 * 60 * 60 * 24, // 24 hours garbage collection
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: 'always',
      retry: false,
    },
  },
})

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
})

import type {
  ChangeEmailRequest,
  ChangePasswordRequest,
  ConfirmEmailChangeRequest,
  DataExport,
  DeleteAccountRequest,
  MessageResponse,
  SettingsResponse,
  UpdateSettingsRequest,
} from '@saulado/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/services/account'
import { useAuthStore } from '@/stores/auth'

/**
 * Caching and side effects for settings and account operations (plan §6.4, §6.5).
 *
 * Two things make this file different from `features/cards/queries.ts`. Settings
 * are mirrored in the auth store as well as the query cache, because the session
 * response carries them and other screens read them from there — writing only one
 * of the two leaves the app disagreeing with itself about the daily goal.
 *
 * And three of these mutations *end the session on purpose*: changing the
 * password, confirming an email change and deleting the account all revoke every
 * refresh token server-side. The client has to follow, or it sits holding an
 * access token that works for up to fifteen more minutes against an account whose
 * credentials just changed.
 */

export const settingsKeys = {
  all: ['settings'] as const,
}

/**
 * The user's settings.
 *
 * Long `staleTime`: nothing else in the app mutates them, so a refetch on every
 * mount would be a request that reliably returns what the cache already holds.
 * The store copy from the session covers first paint.
 */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => api.getSettings(),
    staleTime: 5 * 60_000,
  })
}

/**
 * Saves a settings patch, optimistically.
 *
 * Optimistic because the server echoes back exactly what was sent — there is
 * nothing it can tell the client that the client does not already know — and a
 * toggle that waits for a round trip before moving reads as a broken switch.
 *
 * The rollback restores both copies. Restoring only the cache would leave the
 * store holding a value the user's failed save never actually stored, and the
 * store is what the rest of the app reads.
 */
export function useUpdateSettings() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (patch: UpdateSettingsRequest) => api.updateSettings(patch),

    onMutate: async (patch: UpdateSettingsRequest) => {
      await client.cancelQueries({ queryKey: settingsKeys.all })

      const previousQuery = client.getQueryData<SettingsResponse>(settingsKeys.all)
      const previousStore = useAuthStore.getState().settings

      client.setQueryData<SettingsResponse>(settingsKeys.all, (data) =>
        data ? { settings: { ...data.settings, ...patch } } : data,
      )
      useAuthStore.getState().updateSettings(patch)

      return { previousQuery, previousStore }
    },

    onError: (_error, _patch, context) => {
      if (context?.previousQuery) {
        client.setQueryData<SettingsResponse>(settingsKeys.all, context.previousQuery)
      }
      if (context?.previousStore) {
        useAuthStore.getState().updateSettings(context.previousStore)
      }
    },

    /**
     * The server's row is authoritative on the way back: it may have clamped or
     * normalised something the optimistic patch took at face value.
     */
    onSuccess: (data: SettingsResponse) => {
      client.setQueryData<SettingsResponse>(settingsKeys.all, data)
      useAuthStore.getState().updateSettings(data.settings)
    },
  })
}

/**
 * Drops every cached query and marks the session anonymous.
 *
 * `clear()` rather than `invalidateQueries`: invalidation refetches, and every
 * one of those refetches would go out with a token the server has already
 * revoked. It also matters that the *data* goes — a cache still holding the
 * previous account's sets is one back-navigation away from rendering them.
 */
function endSession(client: ReturnType<typeof useQueryClient>): void {
  useAuthStore.getState().applySession(null)
  client.clear()
}

/**
 * Step one of an email change. Does not end the session — nothing has changed
 * yet, and the confirmation link may well be opened on another device.
 */
export function useChangeEmail() {
  return useMutation<MessageResponse, Error, ChangeEmailRequest>({
    mutationFn: (body) => api.changeEmail(body),
  })
}

/**
 * Step two, from the link in the new inbox.
 *
 * Ends the session on success because the server revoked every one. This hook is
 * reachable while signed out — that is the ordinary case — and `endSession` is
 * safe there: applying a null session to an already-anonymous store is a no-op.
 */
export function useConfirmEmailChange() {
  const client = useQueryClient()

  return useMutation<MessageResponse, Error, ConfirmEmailChangeRequest>({
    mutationFn: (body) => api.confirmEmailChange(body),
    onSuccess: () => {
      endSession(client)
    },
  })
}

export function useChangePassword() {
  const client = useQueryClient()

  return useMutation<MessageResponse, Error, ChangePasswordRequest>({
    mutationFn: (body) => api.changePassword(body),
    onSuccess: () => {
      endSession(client)
    },
  })
}

/**
 * The export, as a mutation rather than a query.
 *
 * It is a GET, but it behaves like an action: it fires on a click, it must not
 * be cached (the response is the user's entire library), and it must not refetch
 * on window focus. `useQuery` with `enabled: false` would model the same thing
 * more awkwardly and still keep the payload in the cache.
 */
export function useExportData() {
  return useMutation<DataExport, Error, void>({
    mutationFn: () => api.exportData(),
  })
}

export function useDeleteAccount() {
  const client = useQueryClient()

  return useMutation<void, Error, DeleteAccountRequest>({
    mutationFn: (body) => api.deleteAccount(body),
    onSuccess: () => {
      endSession(client)
    },
  })
}

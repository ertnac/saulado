import type { AuthResponse, PublicUser, UserSettings } from '@saulado/shared'
import { create } from 'zustand'
import { onSessionChange } from '../services/api'
import * as authApi from '../services/auth'
import { queryClient, asyncStoragePersister } from '../lib/query-client'
import { useOfflineSetsStore } from './offline-sets'
import { syncEngine } from '../lib/offline/sync'

/**
 * Auth state, ported from `frontend/src/stores/auth.ts` — unchanged, and that is
 * the point rather than a coincidence. The store never touches storage; it
 * mirrors whatever the service layer decided. See `applySession`.
 *
 * Holds the user and their settings; neither token is here. Zustand state is
 * ordinary JavaScript reachable from any component and, with devtools, from a
 * debugger attached over USB — the access token lives in a module closure in
 * `services/api` and the refresh token in the keychain.
 */

/**
 * `status` is a state machine rather than a pair of booleans.
 *
 * `loading`/`authenticated` as separate flags admits states that cannot happen
 * (loading *and* authenticated) and forces every consumer to check them in the
 * right order. The interesting one is `restoring`: on launch we genuinely do
 * not know whether the user is signed in until the refresh call answers, and a
 * gate that treats "don't know yet" as "signed out" flashes the login screen at
 * a signed-in user on every cold start.
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'offline-authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: PublicUser | null
  settings: UserSettings | null

  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  googleLogin: (idToken: string) => Promise<void>
  logout: () => Promise<void>
  restore: () => Promise<void>
  applySession: (session: AuthResponse | null, isOffline?: boolean) => void
  updateSettings: (patch: Partial<UserSettings>) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'restoring',
  user: null,
  settings: null,

  applySession: (session, isOffline = false) => {
    if (!session) {
      set({ status: 'anonymous', user: null, settings: null })
      const offlineSets = useOfflineSetsStore.getState()
      if (offlineSets.reset) offlineSets.reset()
      return
    }
    set({
      status: isOffline ? 'offline-authenticated' : 'authenticated',
      user: session.user,
      settings: session.settings,
    })
    void useOfflineSetsStore.getState().load()
  },

  login: async (email, password) => {
    get().applySession(await authApi.login({ email, password }))
  },

  register: async (email, password) => {
    get().applySession(await authApi.register({ email, password }))
  },

  googleLogin: async (idToken) => {
    get().applySession(await authApi.googleLogin(idToken))
  },

  logout: async () => {
    // 1. Explicitly stop background sync
    syncEngine.stop()

    // 2. Revoke session on backend and clear keys
    await authApi.logout()

    // 3. Prevent cross-account leakage by explicitly clearing React Query caches
    queryClient.clear()
    await asyncStoragePersister.removeClient()

    // 4. Reset in-memory offline sets state
    const offlineSets = useOfflineSetsStore.getState()
    if (offlineSets.reset) offlineSets.reset()

    // 5. Finally, enter anonymous state
    get().applySession(null)
  },

  restore: async () => {
    const session = await authApi.restoreSession()
    get().applySession(session, session?.accessToken === '')
  },

  /**
   * Local settings patch. A mirror of the record, not the record itself —
   * whatever owns persistence calls this to keep the two in step, including on
   * rollback.
   */
  updateSettings: (patch) => {
    const current = get().settings
    if (current) set({ settings: { ...current, ...patch } })
  },
}))

/**
 * Bridges refreshes the store did not initiate.
 *
 * A silent refresh fired by any screen has to land here: on success the server
 * may have returned updated settings, and on failure the user is anonymous and
 * every protected screen must react immediately rather than on the next
 * navigation.
 *
 * Registered at module scope so it is active before the first render — a
 * refresh racing an effect that has not run yet would otherwise be dropped.
 */
onSessionChange((session, isOffline = false) => {
  const { status, applySession } = useAuthStore.getState()

  // During `restoring` the restore() call owns the transition. Applying here as
  // well would set `anonymous` a beat before restore() sets `authenticated`,
  // flashing the login screen at a user who is signed in.
  if (status === 'restoring') return

  applySession(session, isOffline)
})

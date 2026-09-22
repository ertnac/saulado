import type { AuthResponse, PublicUser, UserSettings } from '@saulado/shared'
import { create } from 'zustand'
import { onSessionChange, setAccessToken, setStoredRefreshToken } from '@/services/api'
import * as authApi from '@/services/auth'

/**
 * Auth state.
 *
 * Holds the user and their settings; the access token is deliberately *not*
 * here. Zustand state is ordinary JavaScript reachable from any component and,
 * with devtools, from the console — the token lives in a module closure in
 * `services/api` instead, with no getter exposed to the view layer.
 */

/**
 * `status` is a state machine rather than a pair of booleans.
 *
 * `loading`/`authenticated` as separate flags admits states that cannot happen
 * (loading *and* authenticated) and forces every consumer to check them in the
 * right order. The interesting one is `restoring`: on first paint we genuinely
 * do not know whether the user is signed in until the refresh call answers, and
 * a route guard that treats "don't know yet" as "signed out" will bounce a
 * logged-in user to the login page on every reload.
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: PublicUser | null
  settings: UserSettings | null

  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  googleLogin: (idToken: string) => Promise<void>
  logout: () => Promise<void>
  restore: () => Promise<void>
  applySession: (session: AuthResponse | null) => void
  updateSettings: (patch: Partial<UserSettings>) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'restoring',
  user: null,
  settings: null,

  applySession: (session) => {
    if (!session) {
      setAccessToken(null)
      setStoredRefreshToken(null)
      set({ status: 'anonymous', user: null, settings: null })
      return
    }

    setAccessToken(session.accessToken)
    if (session.refreshToken) {
      setStoredRefreshToken(session.refreshToken)
    }
    set({ status: 'authenticated', user: session.user, settings: session.settings })
  },

  register: async (email, password) => {
    get().applySession(await authApi.register({ email, password }))
  },

  login: async (email, password) => {
    get().applySession(await authApi.login({ email, password }))
  },

  googleLogin: async (idToken) => {
    get().applySession(await authApi.googleLogin(idToken))
  },

  logout: async () => {
    // Clear local state first so the UI responds immediately; the network call
    // revokes the refresh token behind it. A slow API should not leave the user
    // staring at a dashboard they just asked to leave.
    get().applySession(null)
    await authApi.logout()
  },

  restore: async () => {
    const session = await authApi.restoreSession()
    get().applySession(session)
  },

  /**
   * Local settings patch.
   *
   * The store copy is a mirror, not the record — `features/account/queries.ts`
   * owns persistence and calls this to keep the two in step, including on
   * rollback. Kept as a plain setter rather than made async so the dark-mode
   * toggle can move before the request lands.
   */
  updateSettings: (patch) => {
    const current = get().settings
    if (current) set({ settings: { ...current, ...patch } })
  },
}))

/**
 * Bridges refreshes the store did not initiate.
 *
 * A silent refresh fired by any query has to land here: on success the server
 * may have returned updated settings, and on failure the user is anonymous and
 * every protected route must react immediately rather than on the next
 * navigation.
 *
 * Registered at module scope so it is active before the first render — a refresh
 * racing an effect that has not run yet would otherwise be dropped.
 */
onSessionChange((session) => {
  const { status, applySession } = useAuthStore.getState()

  // During `restoring` the restore() call owns the transition. Applying here as
  // well would set `anonymous` a beat before restore() sets `authenticated`,
  // flashing the login page at a user who is signed in.
  if (status === 'restoring') return

  applySession(session)
})

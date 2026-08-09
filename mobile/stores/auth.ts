import type { AuthResponse, PublicUser, UserSettings } from '@saulado/shared'
import { create } from 'zustand'
import { onSessionChange, setAccessToken } from '../services/api'
import * as authApi from '../services/auth'

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
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
  user: PublicUser | null
  settings: UserSettings | null

  register: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  restore: () => Promise<void>
  applySession: (session: AuthResponse | null) => void
  updateSettings: (patch: Partial<UserSettings>) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'restoring',
  user: null,
  settings: null,

  /**
   * Reflects a session into the store. Deliberately touches no storage at all —
   * not the keychain on the way in, and *especially* not on the way out.
   *
   * On the way in: `services/auth`'s register and login already called
   * `adoptSession`, and the refresh path adopted before notifying. Storing again
   * here would write a token one rotation out of date, and the server reads a
   * replayed refresh token as theft and revokes the whole family.
   *
   * On the way out: a `null` here does not mean "signed out", it means "no live
   * session right now" — and on a phone the usual cause is no network, not a
   * rejected credential. `performRefresh` already distinguishes the two and
   * clears the keychain only on an explicit server rejection. A `clearSession()`
   * in this branch would undo that and sign the user out for walking into a lift.
   */
  applySession: (session) => {
    if (!session) {
      setAccessToken(null)
      set({ status: 'anonymous', user: null, settings: null })
      return
    }

    setAccessToken(session.accessToken)
    set({ status: 'authenticated', user: session.user, settings: session.settings })
  },

  register: async (email, password) => {
    get().applySession(await authApi.register({ email, password }))
  },

  login: async (email, password) => {
    get().applySession(await authApi.login({ email, password }))
  },

  /**
   * Signs out, and this is the one path that must reach the keychain.
   *
   * `authApi.logout` reads the stored refresh token, sends it for revocation and
   * clears it whatever the network did — so it runs *before* the local state
   * change rather than after it, unlike the web version. Reversing the two would
   * leave the server holding a live token it was never asked to revoke.
   */
  logout: async () => {
    await authApi.logout()
    get().applySession(null)
  },

  restore: async () => {
    get().applySession(await authApi.restoreSession())
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
onSessionChange((session) => {
  const { status, applySession } = useAuthStore.getState()

  // During `restoring` the restore() call owns the transition. Applying here as
  // well would set `anonymous` a beat before restore() sets `authenticated`,
  // flashing the login screen at a user who is signed in.
  if (status === 'restoring') return

  applySession(session)
})

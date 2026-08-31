import type { ApiErrorCode, ApiErrorResponse, AuthResponse } from '@saulado/shared'
import * as SecureStore from 'expo-secure-store'
import { clearAuthCache, loadAuthCache, saveAuthCache } from './auth-cache'
import { apiUrl } from './config'

/**
 * The API client, ported from `frontend/src/services/api.ts`.
 *
 * Structure, error type and single-flight refresh are deliberately identical —
 * the web version's comments explain why each exists and none of those reasons
 * changed by moving to a phone. Three things did:
 *
 * 1. **No cookies.** `credentials: 'include'` is a browser concept; Android's
 *    OkHttp stack ignores it, and cookie persistence across app restarts is not
 *    guaranteed on either platform. So the refresh token travels in the request
 *    body and lives in the OS keychain between launches.
 * 2. **The opt-in header.** Every request carries `X-Saulado-Client: native`,
 *    which is what makes the backend return a refresh token at all. See
 *    `backend/src/auth/cookies.ts`.
 * 3. **Async token storage.** Keychain reads are promises, so the refresh path
 *    awaits where the web one read a cookie the browser attached for free.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly fields?: Record<string, string>,
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** True when the failure is worth showing beside form fields rather than as a toast. */
  get isFieldError(): boolean {
    return this.fields !== undefined && Object.keys(this.fields).length > 0
  }
}

/**
 * The access token, in memory only — same rule as the web client.
 *
 * Short-lived and cheap to replace, so it is not worth a keychain round-trip on
 * every request. It dies when the app is killed; the refresh token below is what
 * survives that.
 */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

// ── The refresh token ───────────────────────────────────────────────────────

/**
 * Keychain key for the refresh token.
 *
 * `SecureStore` is the Keychain on iOS and an AES-encrypted entry backed by the
 * Keystore on Android — not `AsyncStorage`, which is an unencrypted SQLite file
 * readable by anything with filesystem access on a rooted or jailbroken device.
 * A refresh token is a month-long credential; it does not belong in a plain file.
 */
const REFRESH_TOKEN_KEY = 'saulado.refreshToken'

/**
 * Cached alongside the keychain copy.
 *
 * Every authorized request may need this on a 401, and a keychain read is a
 * native bridge call. The keychain remains the durable record — this is a
 * read-through cache, written on the same line as the store every time.
 */
let refreshToken: string | null = null

export async function loadRefreshToken(): Promise<string | null> {
  if (refreshToken) return refreshToken

  try {
    refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
    return refreshToken
  } catch (error) {
    // A keychain that cannot be read is a device problem, not a session
    // problem. Treated as "no stored session" so the app shows a login form
    // rather than a crash.
    console.warn('[api] could not read the stored refresh token', error)
    return null
  }
}

export async function storeRefreshToken(token: string | null): Promise<void> {
  refreshToken = token

  try {
    if (token === null) {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
      return
    }
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
      // Available after first unlock rather than while unlocked, so a background
      // refresh does not fail on a locked phone. Still not exportable to a
      // backup, which is the property that matters for a bearer credential.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    })
  } catch (error) {
    // The in-memory copy above still works, so the session survives until the
    // app is killed. Logged rather than thrown: failing the login the user just
    // completed is a worse outcome than one that does not outlive the process.
    console.warn('[api] could not persist the refresh token', error)
  }
}

// ── Session change notification ─────────────────────────────────────────────

type SessionListener = (session: AuthResponse | null, isOffline?: boolean) => void

let sessionListener: SessionListener | null = null

export function onSessionChange(listener: SessionListener | null): void {
  sessionListener = listener
}

function notify(session: AuthResponse | null, isOffline = false): void {
  sessionListener?.(session, isOffline)
}

/**
 * Applies a session's credentials to both stores.
 *
 * Everything that receives an `AuthResponse` goes through here, because the
 * access token and the refresh token must never come from different responses —
 * rotation means the token in a stale response is already spent, and storing it
 * would make the next refresh look like a replay and revoke the whole family.
 */
export async function adoptSession(session: AuthResponse): Promise<void> {
  setAccessToken(session.accessToken)

  // Absent when the header gate did not fire — a bug worth surfacing rather
  // than silently leaving the old token in place.
  if (session.refreshToken === undefined) {
    console.warn('[api] response carried no refresh token; is X-Saulado-Client set?')
    return
  }
  await storeRefreshToken(session.refreshToken)
  await saveAuthCache(session.user, session.settings)
}

export async function clearSession(): Promise<void> {
  setAccessToken(null)
  await storeRefreshToken(null)
  await clearAuthCache()
}

// ── Request dispatch ────────────────────────────────────────────────────────

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Send the bearer token, and retry once through a refresh on 401. */
  authorized?: boolean
}

async function toApiError(res: Response): Promise<ApiError> {
  let code: ApiErrorCode = 'INTERNAL_ERROR'
  let message = `Request failed with ${String(res.status)}`
  let fields: Record<string, string> | undefined
  let retryAfter: number | undefined

  try {
    const body = (await res.json()) as Partial<ApiErrorResponse>
    if (body.error) {
      code = body.error.code
      message = body.error.message
      fields = body.error.fields
      retryAfter = body.error.retryAfter
    }
  } catch {
    // A non-JSON error body (a proxy 502, an HTML error page) is not a reason to
    // throw something other than an ApiError — callers handle exactly one type.
  }

  return new ApiError(message, res.status, code, fields, retryAfter)
}

async function dispatch(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, signal, authorized } = options

  const headers: Record<string, string> = {
    Accept: 'application/json',
    // The opt-in that makes the backend hand back a refresh token instead of
    // setting a cookie. Sent on every request, not just the auth ones, so a new
    // endpoint cannot forget it.
    'X-Saulado-Client': 'native',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (authorized && accessToken) headers.Authorization = `Bearer ${accessToken}`

  // No `credentials: 'include'` — there is no cookie jar to include. The web
  // client needs it because its refresh token is a cross-site cookie.
  return fetch(apiUrl(path), {
    method,
    headers,
    keepalive: true,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  })
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ── Silent refresh ──────────────────────────────────────────────────────────

/**
 * In-flight refresh, shared by every caller that needs one.
 *
 * A correctness requirement, and more load-bearing here than on the web. The
 * server rotates the refresh token on every use and treats a second presentation
 * of a spent one as theft, revoking the whole family. Phones make the race more
 * likely, not less: coming back from background, several screens refetch at once
 * and would each see the same expired access token. One flight, shared result.
 */
let refreshInFlight: Promise<AuthResponse | null> | null = null

async function performRefresh(): Promise<AuthResponse | null> {
  const presented = await loadRefreshToken()

  // Nothing stored — a first launch, or a previous sign-out. Not an error, and
  // not worth a network round-trip that can only 401.
  if (!presented) {
    setAccessToken(null)
    notify(null)
    return null
  }

  try {
    // Deliberately not routed through `request`: that path retries on 401 by
    // refreshing, and a refresh that refreshes on failure never terminates.
    const res = await dispatch('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: presented },
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        // The stored token is spent, revoked, or expired. Clearing it is the whole
        // point: leaving it in the keychain means every future launch retries a
        // credential that can only fail, and a replay is what the server reads as
        // an attack.
        await clearSession()
        notify(null)
        return null
      }
      // Transient failures (5xx, captive portals, rate limits) should NOT sign the user out.
      // Throw to let the catch block fall back to the offline-authenticated state.
      throw new Error(`Transient refresh failure: ${res.status}`)
    }

    const session = (await res.json()) as AuthResponse
    await adoptSession(session)
    // 🟢 Single-flight atomic transition from offline-authenticated -> authenticated
    notify(session)
    return session
  } catch {
    // Network failure — and on a phone this is the common case, not the rare
    // one: a tunnel, a lift, a dead hotspot. The token is NOT cleared, because
    // it is probably still valid and discarding it would sign the user out for
    // walking into a basement. Only an explicit server rejection above clears it.

    // Attempt offline restoration using the auth cache
    const cached = await loadAuthCache()
    if (cached) {
      const fakeSession: AuthResponse = {
        user: cached.user,
        settings: cached.settings,
        accessToken: '', // Sentinel value indicating offline
        expiresIn: 0,
      }
      setAccessToken(null)
      notify(fakeSession, true)
      return fakeSession
    }

    setAccessToken(null)
    notify(null)
    return null
  }
}

export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// ── Public request helpers ──────────────────────────────────────────────────

/**
 * Performs a request, transparently refreshing once on an expired access token.
 *
 * Only `TOKEN_EXPIRED` triggers the retry. `TOKEN_INVALID` and `UNAUTHORIZED`
 * mean the token is malformed or absent, and a refresh cannot fix either — the
 * backend distinguishes them precisely so the client does not have to guess.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (options.authorized && !accessToken) {
    const session = await refreshSession()
    if (session && session.accessToken === '') {
      throw new TypeError('Network request failed')
    }
    if (!session?.accessToken) {
      throw new ApiError('Authentication required.', 401, 'UNAUTHORIZED')
    }
  }

  const res = await dispatch(path, options)

  if (res.status !== 401 || !options.authorized) return parse<T>(res)

  const error = await toApiError(res)
  if (error.code !== 'TOKEN_EXPIRED') throw error

  const session = await refreshSession()
  if (!session?.accessToken) throw error

  return parse<T>(await dispatch(path, options))
}

/** Shorthand for a request that carries the access token. */
export function authorizedRequest<T>(
  path: string,
  options: Omit<RequestOptions, 'authorized'> = {},
): Promise<T> {
  return request<T>(path, { ...options, authorized: true })
}

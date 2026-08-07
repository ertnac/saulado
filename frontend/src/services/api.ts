import type { ApiErrorCode, ApiErrorResponse, AuthResponse } from '@saulado/shared'
import { apiUrl } from './config'

/**
 * The API client.
 *
 * Token holding, refresh, and request dispatch live in one module because they
 * are one mechanism: the retry-after-refresh path needs the token, and the
 * refresh path needs the request dispatcher. Splitting them across files would
 * only produce an import cycle and a pair of injection hooks to break it.
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
 * The access token, in memory only.
 *
 * Not `localStorage`, not `sessionStorage`, not a readable cookie. Any of those
 * turns a single XSS into a token an attacker can exfiltrate and replay at
 * leisure; a variable in a module closure dies with the tab. Surviving a reload
 * is the refresh cookie's job, and that cookie is httpOnly so script cannot
 * read it at all.
 */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

// ── Session change notification ─────────────────────────────────────────────

type SessionListener = (session: AuthResponse | null) => void

let sessionListener: SessionListener | null = null

/**
 * Lets the auth store observe refreshes it did not initiate.
 *
 * A silent refresh triggered by some arbitrary query still has to move the store
 * — on success because the server may have sent back changed settings, and on
 * failure because the user is now anonymous and every protected route must
 * react. The alternative is the store importing this module and this module
 * importing the store, which is a cycle.
 */
export function onSessionChange(listener: SessionListener | null): void {
  sessionListener = listener
}

function notify(session: AuthResponse | null): void {
  sessionListener?.(session)
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

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (authorized && accessToken) headers.Authorization = `Bearer ${accessToken}`

  return fetch(apiUrl(path), {
    method,
    headers,
    // Required for the refresh cookie: it is cross-site in production, and
    // `fetch` omits credentials cross-origin unless told otherwise.
    credentials: 'include',
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
 * This is a correctness requirement, not a performance tweak. The server
 * rotates the refresh token on every use and treats a second presentation of an
 * already-spent token as evidence of theft — it revokes the entire token family.
 * So if three queries each hit a 401 and each fired its own refresh, two of them
 * would replay a spent cookie and the user would be forcibly logged out by their
 * own app. One flight, shared result.
 */
let refreshInFlight: Promise<AuthResponse | null> | null = null

async function performRefresh(): Promise<AuthResponse | null> {
  try {
    // Deliberately not routed through `request`: that path retries on 401 by
    // refreshing, and a refresh that refreshes on failure never terminates.
    const res = await dispatch('/api/auth/refresh', { method: 'POST' })

    if (!res.ok) {
      setAccessToken(null)
      notify(null)
      return null
    }

    const session = (await res.json()) as AuthResponse
    setAccessToken(session.accessToken)
    notify(session)
    return session
  } catch {
    // Network failure. Treated as "no session" for this attempt rather than
    // retried, because the caller is already on a failed request path and a
    // retry storm behind a dead network helps nobody.
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
  const res = await dispatch(path, options)

  if (res.status !== 401 || !options.authorized) return parse<T>(res)

  const error = await toApiError(res)
  if (error.code !== 'TOKEN_EXPIRED') throw error

  const session = await refreshSession()
  if (!session) throw error

  return parse<T>(await dispatch(path, options))
}

/** Shorthand for a request that carries the access token. */
export function authorizedRequest<T>(
  path: string,
  options: Omit<RequestOptions, 'authorized'> = {},
): Promise<T> {
  return request<T>(path, { ...options, authorized: true })
}

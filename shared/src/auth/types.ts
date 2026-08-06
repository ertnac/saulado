/**
 * Wire contracts for the auth API.
 *
 * Shared between backend and frontend so a change to a response shape is a
 * compile error on both sides rather than a runtime surprise on one.
 *
 * Deliberately free of Zod: the frontend only needs the shapes, and pulling a
 * validation library into these types would put it in the browser bundle for no
 * benefit. The backend builds its Zod schemas from `policy.ts` instead — same
 * rules, no shared dependency.
 */

/** A user as the API describes them. Never includes the password hash. */
export interface PublicUser {
  id: string
  email: string
  createdAt: string
  emailVerifiedAt: string | null
}

export interface UserSettings {
  darkMode: boolean
  dailyGoal: number
  newCardsPerDay: number
  notificationsEnabled: boolean
  typoTolerance: boolean
  blankWidthMode: BlankWidthMode
  timezone: string
}

/**
 * How a blank is sized when rendered.
 *
 * `fixed` is the default and the safe one — every blank is the same width, so
 * the blank cannot leak the length of the answer. `proportional` trades that
 * away for a more natural-looking paragraph.
 */
export type BlankWidthMode = 'fixed' | 'proportional'

export interface RegisterRequest {
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

/**
 * The response to register / login / refresh.
 *
 * The refresh token is deliberately absent — it travels only as an httpOnly
 * cookie and is never readable by JavaScript. If it appeared here, any XSS
 * would be a full account takeover rather than a session-length nuisance.
 */
export interface AuthResponse {
  user: PublicUser
  settings: UserSettings
  accessToken: string
  /** Seconds until `accessToken` expires. Drives the silent-refresh timer. */
  expiresIn: number
}

export interface MessageResponse {
  message: string
}

/** Every non-2xx response from the API has this shape. */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode
    message: string
    /** Present on validation failures: which fields failed and why. */
    fields?: Record<string, string>
    /** Present on 429: seconds to wait before retrying. */
    retryAfter?: number
  }
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

/** JWT payload for the access token. Kept minimal — it is not a user cache. */
export interface AccessTokenClaims {
  /** User id. */
  sub: string
  /** Issued-at, seconds since epoch. */
  iat: number
  /** Expiry, seconds since epoch. */
  exp: number
}

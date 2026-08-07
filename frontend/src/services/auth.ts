import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  PublicUser,
  RegisterRequest,
  ResetPasswordRequest,
  UserSettings,
} from '@saulado/shared'
import { authorizedRequest, refreshSession, request, setAccessToken } from './api'

/**
 * Typed wrappers over the auth endpoints.
 *
 * Thin on purpose — the value is that request shapes come from `@saulado/shared`,
 * so a backend contract change is a frontend compile error.
 */

export function register(body: RegisterRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', { method: 'POST', body })
}

export function login(body: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', { method: 'POST', body })
}

export function forgotPassword(body: ForgotPasswordRequest): Promise<MessageResponse> {
  return request<MessageResponse>('/api/auth/forgot-password', { method: 'POST', body })
}

export function resetPassword(body: ResetPasswordRequest): Promise<MessageResponse> {
  return request<MessageResponse>('/api/auth/reset-password', { method: 'POST', body })
}

export function fetchMe(): Promise<{ user: PublicUser; settings: UserSettings }> {
  return authorizedRequest('/api/auth/me')
}

/**
 * Ends the session.
 *
 * The local token is cleared even if the network call fails. A logout that
 * leaves the user apparently signed in because the server was unreachable is
 * worse than one that clears local state optimistically — the refresh cookie is
 * the thing that actually grants access, and the server will reject a token it
 * has no record of anyway.
 */
export async function logout(): Promise<void> {
  try {
    await request<MessageResponse>('/api/auth/logout', { method: 'POST' })
  } finally {
    setAccessToken(null)
  }
}

/**
 * Attempts to restore a session from the refresh cookie.
 *
 * This is the "close the tab, reopen it, still logged in" path: the access token
 * died with the old tab, but the cookie survived, so one refresh call rebuilds
 * the session before the app renders its first protected route.
 */
export function restoreSession(): Promise<AuthResponse | null> {
  return refreshSession()
}

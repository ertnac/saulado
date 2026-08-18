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
import { GoogleSignin } from '../lib/google-signin'
import {
  adoptSession,
  authorizedRequest,
  clearSession,
  loadRefreshToken,
  refreshSession,
  request,
} from './api'

/**
 * Typed wrappers over the auth endpoints, ported from
 * `frontend/src/services/auth.ts`.
 *
 * Thin on purpose — the value is that request shapes come from `@saulado/shared`,
 * so a backend contract change is a compile error here too.
 *
 * Register and login differ from the web pair in one way: they persist the
 * refresh token the response carries. On the web the browser stored the cookie
 * without being asked.
 */

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  const session = await request<AuthResponse>('/api/auth/register', { method: 'POST', body })
  await adoptSession(session)
  return session
}

export async function login(body: LoginRequest): Promise<AuthResponse> {
  const session = await request<AuthResponse>('/api/auth/login', { method: 'POST', body })
  await adoptSession(session)
  return session
}

export async function googleLogin(idToken: string): Promise<AuthResponse> {
  const session = await request<AuthResponse>('/api/auth/login/google', {
    method: 'POST',
    body: { idToken },
  })
  await adoptSession(session)
  return session
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
 * Local credentials are cleared even if the network call fails — a logout that
 * leaves the user apparently signed in because the server was unreachable is the
 * worse outcome. The difference from web: the token must be read *before* the
 * request so it can be sent, and cleared after, whatever happened.
 *
 * A failed revocation leaves a token alive on the server until it expires. That
 * is the honest trade for a logout that works offline, and the token is out of
 * the keychain either way, so nothing on this device can present it.
 */
export async function logout(): Promise<void> {
  const refreshToken = await loadRefreshToken()

  try {
    if (GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signOut()
    }
  } catch {
    // Swallowed on purpose: Google sign out failure should not block app logout
  }

  try {
    await request<MessageResponse>('/api/auth/logout', {
      method: 'POST',
      ...(refreshToken === null ? {} : { body: { refreshToken } }),
    })
  } catch {
    // Swallowed on purpose: see above. The local clear below is what the user
    // asked for and it cannot fail.
  } finally {
    await clearSession()
  }
}

/**
 * Attempts to restore a session from the keychain.
 *
 * The app-restart path, and the mobile equivalent of "close the tab, reopen it,
 * still logged in". The access token died with the process; the refresh token
 * survived in the keychain, so one refresh call rebuilds the session before the
 * first protected screen renders.
 */
export function restoreSession(): Promise<AuthResponse | null> {
  return refreshSession()
}

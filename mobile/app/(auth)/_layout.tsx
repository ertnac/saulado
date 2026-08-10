import { Redirect, Stack } from 'expo-router'
import type { ReactElement } from 'react'
import { useAuthStore } from '../../stores/auth'

/**
 * The `AnonymousRoute` guard, ported from `frontend/src/components/ProtectedRoute.tsx`.
 *
 * Login, register and forgot-password. Reset-password and the email-change
 * confirmation are *not* here, and their absence is the point: both carry a token
 * in the URL and both have to work whatever the session state is. A signed-in
 * user who taps a reset link in their mail app must land on the form, not be
 * bounced to the dashboard with the token discarded.
 *
 * No loading state while `status === 'restoring'`, matching the web. These pages
 * are useful immediately, and flashing a skeleton in front of a login form is
 * worse than letting it render — the restore either finds a session, in which
 * case the redirect below fires a beat later, or it does not, in which case the
 * form was the right screen all along.
 */
export default function AuthLayout(): ReactElement {
  const status = useAuthStore((s) => s.status)

  if (status === 'authenticated') return <Redirect href="/" />

  return <Stack screenOptions={{ headerShown: false }} />
}

import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth'

/**
 * Gate for authenticated routes.
 *
 * The `restoring` branch is the one that matters. On a fresh page load the
 * access token is gone (it only ever lived in memory) and the session is being
 * rebuilt from the refresh cookie. Treating that moment as "signed out" would
 * redirect a logged-in user to the login page on every single reload, and then
 * bounce them back a beat later — which is exactly the bug the Phase 2
 * done-when criterion is written to catch.
 */
export function ProtectedRoute({ children }: { children: ReactElement }): ReactElement {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'restoring') {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8" aria-busy="true">
        <span className="sr-only">Restoring your session</span>
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (status === 'anonymous') {
    /**
     * Carries the attempted path so login can return the user to it. Without
     * this, following a deep link while signed out silently drops it and lands
     * them on the dashboard wondering what happened.
     */
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return children
}

/**
 * Inverse guard for the auth pages.
 *
 * Keeps a signed-in user off the login and register forms — arriving there with
 * a live session is confusing, and submitting would issue a second session for
 * the account they are already using.
 */
export function AnonymousRoute({ children }: { children: ReactElement }): ReactElement {
  const status = useAuthStore((s) => s.status)

  // No skeleton here: these pages are useful immediately and flashing a loader
  // in front of a login form is worse than letting it render.
  if (status === 'authenticated') return <Navigate to="/" replace />

  return children
}

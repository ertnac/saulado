import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { SauladoLoader } from '@/components/ui/saulado-logo'
import { useAdminCheck } from '@/features/admin/queries'
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
export function ProtectedRoute({
  children,
  fallback,
}: {
  children: ReactElement
  fallback?: ReactElement
}): ReactElement {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'restoring') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center p-4" aria-busy="true">
        <SauladoLoader
          starAnimation="star-gyro"
          showBrand
          showTagline
          message="Restoring your session"
        />
      </div>
    )
  }

  if (status === 'anonymous') {
    if (fallback && location.pathname === '/') return fallback
    /**
     * Carries the attempted path so login can return the user to it. Without
     * this, following a deep link while signed out silently drops it and lands
     * them on the dashboard wondering what happened.
     */
    return (
      <Navigate
        to="/welcome?auth=login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
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

  if (status === 'restoring') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center p-4" aria-busy="true">
        <SauladoLoader
          starAnimation="star-gyro"
          showBrand
          showTagline
          message="Restoring your session"
        />
      </div>
    )
  }

  if (status === 'authenticated') return <Navigate to="/" replace />

  return children
}

/**
 * Gate for administrator-only routes.
 *
 * Ensures the caller is signed in and carries administrator privileges verified
 * by the server. Redirects unauthorized users to the home dashboard.
 */
export function AdminRoute({ children }: { children: ReactElement }): ReactElement {
  return (
    <ProtectedRoute>
      <AdminGuard>{children}</AdminGuard>
    </ProtectedRoute>
  )
}

function AdminGuard({ children }: { children: ReactElement }): ReactElement {
  const { data, isLoading, isError } = useAdminCheck()

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center p-4" aria-busy="true">
        <SauladoLoader
          starAnimation="star-gyro"
          showBrand
          showTagline
          message="Checking administrator privileges"
        />
      </div>
    )
  }

  if (isError || !data?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}

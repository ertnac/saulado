import { useEffect, type ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { NotFoundPage } from '@/components/NotFoundPage'
import { AnonymousRoute, ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/toaster'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { EditCardPage, NewCardPage } from '@/features/cards/CardEditorPage'
import { SetDetailPage } from '@/features/cards/SetDetailPage'
import { SetsPage } from '@/features/cards/SetsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { StudySessionPage } from '@/features/study/StudySessionPage'
import { createQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth'

/**
 * Created once at module scope, not per render.
 *
 * A client rebuilt on any re-render of App would take its cache with it, so
 * every query would refetch and nothing would ever stay cached.
 */
const queryClient = createQueryClient()

function SessionRestorer({ children }: { children: ReactElement }): ReactElement {
  const restore = useAuthStore((s) => s.restore)

  useEffect(() => {
    /**
     * One refresh attempt on mount. This is the entire "close the tab, reopen it,
     * still signed in" mechanism: the access token died with the tab, the
     * httpOnly cookie did not.
     *
     * Runs unconditionally — JavaScript cannot test for an httpOnly cookie, which
     * is the point of the flag, so the only way to learn whether a session exists
     * is to ask. A 401 here is a normal answer, not an error.
     *
     * `refreshSession` is single-flight, so StrictMode's double-invoked effect in
     * development cannot fire two refreshes and trip the server's reuse detection.
     */
    void restore()
  }, [restore])

  return children
}

export function App(): ReactElement {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionRestorer>
            <>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <AnonymousRoute>
                      <LoginPage />
                    </AnonymousRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <AnonymousRoute>
                      <RegisterPage />
                    </AnonymousRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <AnonymousRoute>
                      <ForgotPasswordPage />
                    </AnonymousRoute>
                  }
                />
                {/*
                  Deliberately not wrapped in AnonymousRoute. A user can hold a
                  live session in this browser and still legitimately be following
                  a reset link — redirecting them to the dashboard would make the
                  link look broken.
                */}
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/sets" element={<SetsPage />} />
                  {/*
                    One route, not two. Studying a single set is `?set=<id>` on the
                    same screen as studying everything — a path segment would make
                    /study and /sets/:id/study two routes rendering one component.
                  */}
                  <Route path="/study" element={<StudySessionPage />} />
                  <Route path="/sets/:setId" element={<SetDetailPage />} />
                  {/*
                    Card creation is nested under its set because a card cannot
                    exist without one — the route carries the owning set rather
                    than making the editor guess it from state.
                  */}
                  <Route path="/sets/:setId/cards/new" element={<NewCardPage />} />
                  {/*
                    Editing is not, though: a card id is globally unique and the
                    set is on the fetched card, so nesting it would only create a
                    second URL for the same card that could disagree with itself.
                  */}
                  <Route path="/cards/:cardId" element={<EditCardPage />} />
                </Route>

                {/* Alias, so an early bookmark still lands somewhere real. */}
                <Route path="/dashboard" element={<Navigate to="/" replace />} />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>

              {/* Outside Routes: a toast must survive the navigation that raised it. */}
              <Toaster />
            </>
          </SessionRestorer>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

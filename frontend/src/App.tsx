import { useEffect, type ReactElement } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { NotFoundPage } from '@/components/NotFoundPage'
import { AnonymousRoute, AdminRoute, ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/toaster'
import { AccountPage } from '@/features/account/AccountPage'
import { ConfirmEmailChangePage } from '@/features/account/ConfirmEmailChangePage'
import { SettingsPage } from '@/features/account/SettingsPage'
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LandingPage } from '@/features/landing/LandingPage'
import { NfcLandingPage } from '@/features/nfc/NfcLandingPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { SetDetailPage } from '@/features/cards/SetDetailPage'
import { SetsPage } from '@/features/cards/SetsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProgressPage } from '@/features/dashboard/ProgressPage'
import { FilesPage } from '@/features/files/FilesPage'
import { FileViewerPage } from '@/features/files/FileViewerPage'
import { SearchPage } from '@/features/search/SearchPage'
import { StudySessionPage } from '@/features/study/StudySessionPage'
import { LogoPreviewPage } from '@/features/preview/LogoPreviewPage'
import { LogoAnimationLabPage } from '@/features/preview/LogoAnimationLabPage'
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

/**
 * Root home route:
 * - If anonymous / not logged in: renders the Landing Page (Claymorphism & Minimalism)
 * - If authenticated: renders the personalized student Dashboard within the AppShell
 * - If restoring session: renders the loading skeleton without bouncing to login
 */
export function App(): ReactElement {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionRestorer>
            <>
              <Routes>
                {/* ── Public Static Landing Pages & NFC Route ── */}
                <Route path="/welcome" element={<LandingPage />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/nfc" element={<NfcLandingPage />} />
                <Route path="/download" element={<NfcLandingPage />} />
                <Route path="/app" element={<NfcLandingPage />} />
                <Route path="/logo-preview" element={<LogoPreviewPage />} />
                <Route path="/logo-test" element={<LogoPreviewPage />} />
                <Route path="/logo-lab" element={<LogoAnimationLabPage />} />
                <Route path="/logo-animation-lab" element={<LogoAnimationLabPage />} />

                {/* ── Auth Routes ── */}
                <Route
                  path="/login"
                  element={
                    <AnonymousRoute>
                      <LandingPage initialModal="login" />
                    </AnonymousRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <AnonymousRoute>
                      <LandingPage initialModal="register" />
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
                {/*
                  Also outside both guards, and for a stronger reason than the
                  reset link: this link is mailed to an address that is not yet
                  the account's, so the device that opens it is often signed into
                  nothing. ProtectedRoute would bounce it to /login and the change
                  could never be completed. Mirrors accountPublicRouter on the
                  server, where the same route sits outside requireAuth.
                */}
                <Route path="/account/email/confirm" element={<ConfirmEmailChangePage />} />

                {/* ── Authenticated App Routes (LandingPage fallback for root when anonymous) ── */}
                <Route
                  element={
                    <ProtectedRoute fallback={<LandingPage />}>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/sets" element={<SetsPage />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/files/:fileId" element={<FileViewerPage />} />
                  <Route path="/progress" element={<ProgressPage />} />
                  {/*
                    One route, not two. Studying a single set is `?set=<id>` on the
                    same screen as studying everything — a path segment would make
                    /study and /sets/:id/study two routes rendering one component.
                  */}
                  <Route path="/study" element={<StudySessionPage />} />
                  {/*
                    There is no card route. Cards are written and edited inline
                    on their set's page (`CardComposer`), so a card has no URL of
                    its own — which is the whole point: adding five cards used to
                    be five page transitions away from the set you were reading.
                  */}
                  <Route path="/sets/:setId" element={<SetDetailPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminDashboardPage />
                      </AdminRoute>
                    }
                  />
                </Route>

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

import type { ReactElement } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export function NotFoundPage(): ReactElement {
  const location = useLocation()
  const status = useAuthStore((s) => s.status)

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">No page here</h1>

      <p className="mt-2 text-muted-foreground">
        Nothing is served at <code className="font-mono text-foreground">{location.pathname}</code>.
      </p>

      {/*
        Where "back" goes depends on whether there is a session to go back to.
        Offering a signed-out visitor a dashboard link just bounces them through
        the route guard to the login page.
      */}
      <Link
        to={status === 'authenticated' ? '/' : '/login'}
        className="mt-6 font-medium text-foreground underline"
      >
        {status === 'authenticated' ? 'Back to dashboard' : 'Go to sign in'}
      </Link>
    </main>
  )
}

import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * Shared frame for the four unauthenticated pages.
 *
 * `<main>` and a single `<h1>` per page keep the heading hierarchy correct
 * (saulado-ux §6) — four pages each inventing their own structure is how a
 * document ends up with two h1s or none.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <header className="mb-8">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Saulado
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        </header>

        {children}

        {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
      </main>
    </div>
  )
}

/**
 * Whole-form error banner.
 *
 * `role="alert"` because this appears in response to a submit the user just
 * made — they are waiting for exactly this answer, so interrupting is correct
 * here in a way it is not for a background notification.
 */
export function FormAlert({ message }: { message: string }): ReactElement {
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-[hsl(var(--warning))] bg-muted p-3 text-sm"
    >
      <span aria-hidden="true">! </span>
      {message}
    </div>
  )
}

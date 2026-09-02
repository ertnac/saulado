import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertIcon, SparkIcon } from '@/components/ui/icons'

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
 *
 * The form sits on a raised card over the page wash, which is the one place in
 * the app where a floating panel is the whole layout rather than a component in
 * it: there is nothing else on screen to anchor to.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <header className="mb-6">
          <Link
            to="/welcome"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <SparkIcon />
            Saulado
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        </header>

        <div className="clay-card p-6 sm:p-8">{children}</div>

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
      className="mb-5 flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning"
    >
      <AlertIcon className="mt-0.5 h-[1em] w-[1em] shrink-0" />
      {message}
    </div>
  )
}

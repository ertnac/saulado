import { useEffect, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useConfirmEmailChange } from './queries'
import { AuthLayout } from '@/features/auth/AuthLayout'

/**
 * Where the confirmation link from the new inbox lands.
 *
 * Public by construction: the link was mailed to an address that is not yet the
 * account's, so the browser that opens it is routinely not signed in — that is
 * why the backend moved this onto `accountPublicRouter`. The token is the
 * credential, and it is spent (single-use) the moment this page runs.
 */
export function ConfirmEmailChangePage(): ReactElement {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const confirm = useConfirmEmailChange()

  // Fires once on mount. A user who reloads the page should not re-consume the
  // token — the mutation ran, the server spent it, and re-running would turn a
  // done thing into an error screen.
  useEffect(() => {
    if (!token) return
    confirm.mutate({ token })
  }, [])

  if (!token) {
    return (
      <AuthLayout title="This link is incomplete">
        <p className="text-sm text-muted-foreground">
          The confirmation link is missing its token. Try copying the whole link from the email, or
          request the change again.
        </p>
        <Link to="/settings" className="mt-4 inline-block font-medium text-foreground underline">
          Go to settings
        </Link>
      </AuthLayout>
    )
  }

  if (confirm.isPending) {
    return (
      <AuthLayout title="Confirming your new email…">
        <p className="text-sm text-muted-foreground">This should only take a moment.</p>
      </AuthLayout>
    )
  }

  if (confirm.isError) {
    return (
      <AuthLayout
        title="That link did not work"
        footer={
          <Link to="/settings" className="font-medium text-foreground underline">
            Back to settings
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          The confirmation link is invalid or has already been used. Request a new one from your
          settings — your email address has not changed.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Email address updated"
      footer={
        <Link to="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">
        Your new address is in effect, and every session was signed out — including this one. Sign
        in with the new address to continue.
      </p>
      <Button
        size="lg"
        className="mt-4"
        onClick={() => {
          // `window.location` rather than the router: there is no active router
          // session to carry state through — the token spent on this page ended
          // it — and a full load also clears the consumed token from the URL
          // memory that navigating in-place would keep alive.
          window.location.assign('/login')
        }}
      >
        Sign in
      </Button>
    </AuthLayout>
  )
}

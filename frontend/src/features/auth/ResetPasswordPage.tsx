import { useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { checkPassword, PASSWORD_MIN_LENGTH } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { AlertIcon } from '@/components/ui/icons'
import { FormField } from '@/components/ui/form-field'
import { useFormErrors } from '@/hooks/useFormErrors'
import { resetPassword } from '@/services/auth'
import { toast } from '@/stores/toast'
import { AuthLayout, FormAlert } from './AuthLayout'

export function ResetPasswordPage(): ReactElement {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { errors, setFromError, clear } = useFormErrors()

  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setLocalError(null)

    const problem = checkPassword(password)
    if (problem) {
      setLocalError(problem.message)
      return
    }

    setSubmitting(true)
    try {
      await resetPassword({ token, password })
      /**
       * Straight to login, not to the dashboard. The reset revoked every session
       * for this account — including any this browser held — so there is no
       * session to land in, and signing in with the new password is also the
       * user's own confirmation that it took.
       */
      toast.success('Password updated. Sign in with your new password.')
      void navigate('/login', { replace: true })
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * A missing token is caught before the form renders.
   *
   * Someone who opens `/reset-password` directly should be told the link is the
   * problem, not shown a form that can only fail after they have chosen a
   * password and typed it in.
   */
  if (!token) {
    return (
      <AuthLayout
        title="This link is incomplete"
        footer={
          <Link to="/login" className="font-medium text-foreground underline">
            Back to sign in
          </Link>
        }
      >
        {/* No border of its own — `AuthLayout` already puts this on a card. */}
        <div className="text-sm">
          {/*
            `--warning`, not `--danger`. A truncated link is a nuisance with an
            obvious next step, not a destructive act; danger stays reserved for
            things that cannot be undone.
          */}
          <p className="flex items-center gap-2 font-medium text-warning">
            <AlertIcon />
            Link incomplete
          </p>
          <p className="mt-3 text-muted-foreground">
            The reset link is missing its token. Email clients sometimes break long links across
            lines — try copying the whole thing, or request a new one.
          </p>
          <Button
            className="mt-4"
            size="lg"
            onClick={() => {
              void navigate('/forgot-password')
            }}
          >
            Request a new link
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="This will sign you out everywhere else.">
      {errors.general && <FormAlert message={errors.general} />}

      <form
        onSubmit={(e) => {
          void onSubmit(e)
        }}
        noValidate
        className="space-y-4"
      >
        <FormField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (localError) setLocalError(null)
          }}
          error={localError ?? errors.fields.password}
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
          autoComplete="new-password"
          required
          autoFocus
        />

        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  )
}

import { useState, type FormEvent, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { useFormErrors } from '@/hooks/useFormErrors'
import { forgotPassword } from '@/services/auth'
import { AuthLayout, FormAlert } from './AuthLayout'

export function ForgotPasswordPage(): ReactElement {
  const { errors, setFromError, clear } = useFormErrors()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setSubmitting(true)

    try {
      await forgotPassword({ email })
      setSent(true)
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * The confirmation says "if that email has an account" rather than "we sent
   * you an email".
   *
   * The API deliberately answers identically for known and unknown addresses so
   * the form is not a membership oracle. Wording it as a definite "sent" would
   * hand that leak straight back — anyone could confirm an address by reading a
   * message the server was careful not to imply.
   */
  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        footer={
          <Link to="/login" className="font-medium text-foreground underline">
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-lg border border-border p-5 text-sm">
          <p className="flex items-center gap-2 font-medium text-[hsl(var(--success))]">
            <span aria-hidden="true">✓</span>
            Request received
          </p>
          <p className="mt-3 text-muted-foreground">
            If <span className="font-medium text-foreground">{email}</span> has an account, a reset
            link is on its way. The link works once and expires in an hour.
          </p>
          <p className="mt-3 text-muted-foreground">
            Nothing arrived? Check your spam folder, then{' '}
            <button
              type="button"
              onClick={() => {
                setSent(false)
              }}
              className="underline"
            >
              try a different address
            </button>
            .
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/login" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      }
    >
      {errors.general && <FormAlert message={errors.general} />}

      <form
        onSubmit={(e) => {
          void onSubmit(e)
        }}
        noValidate
        className="space-y-4"
      >
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
          error={errors.fields.email}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
        />

        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  )
}

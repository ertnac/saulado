import { useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { checkPassword, PASSWORD_MIN_LENGTH } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useAuthStore } from '@/stores/auth'
import { AuthLayout, FormAlert } from './AuthLayout'

export function RegisterPage(): ReactElement {
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()
  const { errors, setFromError, clear } = useFormErrors()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setLocalPasswordError(null)

    /**
     * Same `checkPassword` the API enforces, from `@saulado/shared`. Running it
     * here is purely to save a round trip and a rate-limit slot — the server
     * check is the control, this is the courtesy. Because both sides call one
     * function, the form cannot accept something the API will reject.
     */
    const problem = checkPassword(password)
    if (problem) {
      setLocalPasswordError(problem.message)
      return
    }

    setSubmitting(true)
    try {
      await register(email, password)
      void navigate('/', { replace: true })
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Learn in context. Remember for life."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline">
            Sign in
          </Link>
        </>
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

        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (localPasswordError) setLocalPasswordError(null)
          }}
          error={localPasswordError ?? errors.fields.password}
          // States the rule up front instead of failing the user after submit.
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A memorable phrase beats a short, complicated one.`}
          autoComplete="new-password"
          required
        />

        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}

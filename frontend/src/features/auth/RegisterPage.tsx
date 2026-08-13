import { useState, useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { checkPassword, PASSWORD_MIN_LENGTH } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useAuthStore } from '@/stores/auth'
import { AuthLayout, FormAlert } from './AuthLayout'

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleAccounts {
  id: {
    initialize(config: {
      client_id: string
      callback: (res: GoogleCredentialResponse) => void
    }): void
    renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  }
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

export function RegisterPage(): ReactElement {
  const register = useAuthStore((s) => s.register)
  const googleLogin = useAuthStore((s) => s.googleLogin)
  const navigate = useNavigate()
  const { errors, setFromError, clear } = useFormErrors()
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const isGoogleInitialized = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const initGoogle = () => {
      if (window.google && googleBtnRef.current) {
        if (!isGoogleInitialized.current) {
          window.google.accounts.id.initialize({
            client_id: String(import.meta.env.VITE_GOOGLE_CLIENT_ID),
            callback: (response: GoogleCredentialResponse) => {
              clear()
              googleLogin(response.credential)
                .then(() => {
                  void navigate('/', { replace: true })
                })
                .catch((err) => {
                  setFromError(err)
                })
            },
          })
          isGoogleInitialized.current = true
        }

        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
        })
      } else {
        setTimeout(initGoogle, 100)
      }
    }
    initGoogle()
  }, [googleLogin, navigate, clear, setFromError])

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

      <div className="flex justify-center mb-6" ref={googleBtnRef}></div>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
        </div>
      </div>

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

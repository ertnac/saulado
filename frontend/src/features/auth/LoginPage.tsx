import { useState, useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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

export function LoginPage(): ReactElement {
  const login = useAuthStore((s) => s.login)
  const googleLogin = useAuthStore((s) => s.googleLogin)
  const navigate = useNavigate()
  const location = useLocation()
  const { errors, setFromError, clear } = useFormErrors()
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const isGoogleInitialized = useRef(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  /**
   * Where the user was headed before the guard bounced them here. Sending them
   * to the dashboard instead would silently discard the link they clicked.
   */
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let unmounted = false

    const initGoogle = () => {
      if (unmounted || typeof window === 'undefined') return
      if (window.google && googleBtnRef.current) {
        if (!isGoogleInitialized.current) {
          window.google.accounts.id.initialize({
            client_id: String(import.meta.env.VITE_GOOGLE_CLIENT_ID),
            callback: (response: GoogleCredentialResponse) => {
              clear()
              googleLogin(response.credential)
                .then(() => {
                  void navigate(from, { replace: true })
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
      } else if (typeof window !== 'undefined') {
        timer = setTimeout(initGoogle, 100)
      }
    }
    initGoogle()

    return () => {
      unmounted = true
      if (timer) clearTimeout(timer)
    }
  }, [googleLogin, navigate, from, clear, setFromError])

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setSubmitting(true)

    try {
      await login(email, password)
      // `replace` so Back does not return to the login form of a session the
      // user is now inside.
      void navigate(from, { replace: true })
    } catch (err) {
      setFromError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link
            to="/register"
            className="font-semibold text-foreground underline hover:text-primary transition-colors"
          >
            Create an account
          </Link>
        </p>
      }
    >
      {errors.general && <FormAlert message={errors.general} />}

      <div className="flex justify-center mb-6" ref={googleBtnRef}></div>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/80" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface px-3 font-semibold text-muted-foreground tracking-wider">
            Or continue with email
          </span>
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
          }}
          error={errors.fields.password}
          autoComplete="current-password"
          required
        />

        <Button
          type="submit"
          disabled={submitting}
          className="clay-btn-primary w-full py-3 text-sm font-semibold mt-2"
          size="lg"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-sm pt-1">
          <Link
            to="/forgot-password"
            className="text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

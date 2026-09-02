import { useState, useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from '@/components/ui/icons'
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
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
          shape: 'pill',
          text: 'continue_with',
          width: 280,
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
      subtitle="Welcome back. Continue your learning journey."
      activeTab="login"
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
          placeholder="learner@example.com"
          error={errors.fields.email}
          leftIcon={<MailIcon className="h-4 w-4" />}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
        />

        <FormField
          label="Password"
          labelAction={
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors underline"
            >
              Forgot password?
            </Link>
          }
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
          }}
          placeholder="Enter your password"
          error={errors.fields.password}
          leftIcon={<LockIcon className="h-4 w-4" />}
          rightElement={
            <button
              type="button"
              onClick={() => {
                setShowPassword(!showPassword)
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          }
          autoComplete="current-password"
          required
        />

        <Button
          type="submit"
          disabled={submitting}
          className="clay-btn-primary w-full py-3 text-sm font-bold mt-2 shadow-md"
          size="lg"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Sleek Minimalist Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/60" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface px-3 font-semibold text-muted-foreground">
            or continue with
          </span>
        </div>
      </div>

      {/* Pill-shaped Google Auth Container at bottom */}
      <div className="flex justify-center" ref={googleBtnRef}></div>
    </AuthLayout>
  )
}

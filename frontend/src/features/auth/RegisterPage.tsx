import { useState, useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { checkPassword, PASSWORD_MIN_LENGTH } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { CheckIcon, SparklesIcon } from '@/components/ui/icons'
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
      } else if (typeof window !== 'undefined') {
        timer = setTimeout(initGoogle, 100)
      }
    }
    initGoogle()

    return () => {
      unmounted = true
      if (timer) clearTimeout(timer)
    }
  }, [googleLogin, navigate, clear, setFromError])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setLocalPasswordError(null)

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
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-foreground underline hover:text-primary transition-colors"
            >
              Sign in
            </Link>
          </p>

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
            <span className="flex items-center gap-1">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> Free forever
            </span>
            <span className="flex items-center gap-1">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> SM-2 Spaced Recall
            </span>
            <span className="flex items-center gap-1">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> No credit card
            </span>
          </div>
        </div>
      }
    >
      {/* Eyebrow badge */}
      <div className="mb-5 flex justify-center">
        <div className="clay-pill px-3.5 py-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <SparklesIcon className="h-3.5 w-3.5 text-accent" />
          <span>Active Recall & Spaced Repetition</span>
        </div>
      </div>

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
            if (localPasswordError) setLocalPasswordError(null)
          }}
          error={localPasswordError ?? errors.fields.password}
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A memorable phrase beats a short, complicated one.`}
          autoComplete="new-password"
          required
        />

        <Button
          type="submit"
          disabled={submitting}
          className="clay-btn-primary w-full py-3 text-sm font-semibold mt-2"
          size="lg"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}

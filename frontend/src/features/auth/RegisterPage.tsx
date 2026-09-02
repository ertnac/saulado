import { useState, useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkPassword, PASSWORD_MIN_LENGTH } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { CheckIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon } from '@/components/ui/icons'
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
  }, [googleLogin, navigate, clear, setFromError])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isLengthValid = password.length >= PASSWORD_MIN_LENGTH

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
      subtitle="Start turning your notes into long-term recall."
      activeTab="register"
      footer={
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> Free Forever
          </span>
          <span className="flex items-center gap-1">
            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> SM-2 Spaced
          </span>
          <span className="flex items-center gap-1">
            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> No Credit Card
          </span>
        </div>
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

        <div className="space-y-1.5">
          <FormField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (localPasswordError) setLocalPasswordError(null)
            }}
            placeholder="Choose a secure password"
            error={localPasswordError ?? errors.fields.password}
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
                {showPassword ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
            }
            autoComplete="new-password"
            required
          />

          {/* Password Live Requirement Pill */}
          <div className="flex items-center gap-2 pt-1 text-xs">
            <span
              className={`flex items-center gap-1 font-medium transition-colors ${
                isLengthValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              }`}
            >
              <CheckIcon
                className={`h-3.5 w-3.5 ${isLengthValid ? 'text-emerald-500' : 'text-muted-foreground/50'}`}
              />
              At least {PASSWORD_MIN_LENGTH} characters
            </span>
          </div>
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="clay-btn-primary w-full py-3 text-sm font-bold mt-2 shadow-md"
          size="lg"
        >
          {submitting ? 'Creating account…' : 'Create account'}
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

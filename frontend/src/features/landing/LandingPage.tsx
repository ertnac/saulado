import { useState, useEffect, useRef, type FormEvent, type ReactElement } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { checkPassword, PASSWORD_MIN_LENGTH } from '@saulado/shared'
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  FlameIcon,
  LockIcon,
  MailIcon,
  SmartphoneIcon,
  SparklesIcon,
  XIcon,
} from '@/components/ui/icons'
import { Logo, MascotSprite } from '@/components/ui/brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { FormAlert } from '@/features/auth/AuthLayout'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useAuthStore } from '@/stores/auth'
import { DUR, EASE, SPRING } from '@/lib/motion'

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

interface LandingPageProps {
  initialModal?: 'login' | 'register' | null
}

export function LandingPage({ initialModal }: LandingPageProps = {}): ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const status = useAuthStore((s) => s.status)
  const register = useAuthStore((s) => s.register)
  const login = useAuthStore((s) => s.login)
  const googleLogin = useAuthStore((s) => s.googleLogin)
  const { errors, setFromError, clear } = useFormErrors()

  const authQuery = searchParams.get('auth')
  const defaultTab: 'register' | 'login' =
    initialModal === 'login' || authQuery === 'login' || location.pathname === '/login'
      ? 'login'
      : 'register'

  const defaultShowModal =
    initialModal !== undefined && initialModal !== null
      ? Boolean(initialModal)
      : authQuery === 'login' ||
        authQuery === 'register' ||
        location.pathname === '/login' ||
        location.pathname === '/register'

  // Hero Interactive Auth Modal Transition State
  const [showAuthModal, setShowAuthModal] = useState(defaultShowModal)
  const [authTab, setAuthTab] = useState<'register' | 'login'>(defaultTab)
  const [authSuccess, setAuthSuccess] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  // Sync route / query parameters with modal state
  useEffect(() => {
    if (status === 'authenticated') {
      setShowAuthModal(false)
      const auth = searchParams.get('auth')
      if (auth || location.pathname === '/login' || location.pathname === '/register') {
        void navigate('/dashboard', { replace: true })
      }
      return
    }

    const auth = searchParams.get('auth')
    if (auth === 'login' || location.pathname === '/login' || initialModal === 'login') {
      setShowAuthModal(true)
      setAuthTab('login')
    } else if (
      auth === 'register' ||
      location.pathname === '/register' ||
      initialModal === 'register'
    ) {
      setShowAuthModal(true)
      setAuthTab('register')
    }
  }, [searchParams, location.pathname, initialModal, status, navigate])

  // Auth Form State
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [showAuthPassword, setShowAuthPassword] = useState(false)
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const isGoogleInitialized = useRef(false)

  // Hero Interactive Demo State
  const [heroInput, setHeroInput] = useState('')
  const [heroRevealed, setHeroRevealed] = useState(false)
  const isHeroCorrect = heroInput.trim().toLowerCase() === 'time'

  // Answering Mode Interactive Preview State
  const [selectedMode, setSelectedMode] = useState<'type-in' | 'multiple-choice' | 'flashcard'>(
    'type-in',
  )
  const [mcSelection, setMcSelection] = useState<number | null>(null)
  const [isFlipped, setIsFlipped] = useState(false)

  // Interactive Sandbox State
  const [sandboxText, setSandboxText] = useState(
    'Mitochondria generate chemical energy in the form of ATP for the cell.',
  )
  const [blankWord, setBlankWord] = useState('ATP')
  const [sandboxTestInput, setSandboxTestInput] = useState('')
  const [sandboxRevealed, setSandboxRevealed] = useState(false)

  const sandboxWords = sandboxText.split(' ')
  const isPasswordValid = authPassword.length >= PASSWORD_MIN_LENGTH

  // Initialize Google Sign-In when modal is visible
  useEffect(() => {
    if (!showAuthModal) return

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
                  setAuthSuccess(true)
                  setTimeout(() => {
                    void navigate(from, { replace: true })
                  }, 700)
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
  }, [showAuthModal, googleLogin, navigate, from, clear, setFromError])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setLocalPasswordError(null)

    if (authTab === 'register') {
      const problem = checkPassword(authPassword)
      if (problem) {
        setLocalPasswordError(problem.message)
        return
      }
    }

    setSubmitting(true)
    try {
      if (authTab === 'register') {
        await register(authEmail, authPassword)
      } else {
        await login(authEmail, authPassword)
      }
      setAuthSuccess(true)
      setTimeout(() => {
        void navigate(from, { replace: true })
      }, 700)
    } catch (err) {
      setFromError(err)
      setSubmitting(false)
    }
  }

  function handleCloseModal(): void {
    setShowAuthModal(false)
    clear()
    if (searchParams.get('auth')) {
      setSearchParams({}, { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-accent/20">
      {/* ── Top Navigation Bar (Clean & Minimalist, Top-Right Buttons Removed) ── */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-background/85 border-b border-border/60 transition-all">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <Logo className="h-8 w-8 transition-transform group-hover:scale-105" />
            <span className="font-bold text-xl sm:text-2xl tracking-tight text-foreground">
              Saulado
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-6">
            <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-muted-foreground">
              <a href="#how-it-works" className="hover:text-foreground transition-colors">
                How it Works
              </a>
              <a href="#study-modes" className="hover:text-foreground transition-colors">
                Study Modes
              </a>
              <a href="#sandbox" className="hover:text-foreground transition-colors">
                Interactive Sandbox
              </a>
              <a href="#features" className="hover:text-foreground transition-colors">
                Features
              </a>
            </nav>

            <Link
              to="/nfc"
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-primary text-primary-foreground text-xs sm:text-sm font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all"
            >
              <DownloadIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Get Mobile App</span>
            </Link>

            {status === 'authenticated' ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-surface-muted text-foreground border border-border/80 text-xs sm:text-sm font-bold shadow-xs hover:bg-surface active:scale-95 transition-all"
              >
                <span>Dashboard</span>
                <ChevronRightIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal(true)
                  setAuthTab('login')
                }}
                className="text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section with Fluid Layout Continuity ── */}
      <section className="relative pt-6 pb-16 sm:pt-10 sm:pb-24 overflow-hidden">
        {/* Subtle Ambient Radial Accents */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center flex flex-col items-center">
          {/* Eyebrow Pill with smooth collapse and upward glide (no snapping) */}
          <AnimatePresence initial={false}>
            {!showAuthModal && (
              <motion.div
                key="hero-eyebrow"
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{
                  opacity: 0,
                  height: 0,
                  scale: 0.95,
                  transition: { duration: DUR.page, ease: EASE },
                }}
                transition={{ duration: DUR.page, ease: EASE }}
                className="overflow-hidden flex justify-center"
              >
                <div className="inline-flex items-center gap-2 clay-pill px-4 py-1.5 text-xs font-semibold text-primary mb-3">
                  <SparklesIcon className="h-3.5 w-3.5 text-accent" />
                  <span>Active Recall · Spaced Repetition · Contextual Cloze</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Headline (Smoothly moves up and reclaims space) */}
          <motion.div
            layout="position"
            transition={{ duration: 0.55, ease: EASE }}
            className="max-w-3xl mx-auto flex flex-col items-center justify-center pb-2"
          >
            <motion.h1
              layout="position"
              transition={{ duration: 0.55, ease: EASE }}
              className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.12]"
            >
              Remember what you learn.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300">
                In context.
              </span>
            </motion.h1>

            {/* Explanatory Paragraph (Smoothly removed while modal is displaying for more vertical height) */}
            <AnimatePresence initial={false}>
              {!showAuthModal && (
                <motion.p
                  key="hero-paragraph"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    transition: { duration: 0.4, ease: EASE },
                  }}
                  transition={{ duration: DUR.page, ease: EASE }}
                  className="mt-3 text-base sm:text-xl text-muted-foreground leading-relaxed font-normal overflow-hidden max-w-2xl mx-auto"
                >
                  Traditional flashcards isolate facts. Saulado turns your actual notes, textbooks,
                  and documents into smart cloze recall cards—spaced at the exact moment before you
                  forget.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Call to Actions & Trust Badges (Fade out and collapse smoothly) */}
          <AnimatePresence initial={false}>
            {!showAuthModal && (
              <motion.div
                key="cta-buttons"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{
                  opacity: 0,
                  height: 0,
                  transition: { duration: 0.35, ease: EASE },
                }}
                transition={{ duration: 0.4, ease: EASE }}
                className="overflow-hidden w-full flex flex-col items-center justify-center space-y-4 pt-2"
              >
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {status === 'authenticated' ? (
                    <Link
                      to="/dashboard"
                      className="clay-btn-primary px-7 py-3.5 text-base font-semibold inline-flex items-center gap-2 text-white shadow-lg cursor-pointer"
                    >
                      <span>Open Dashboard</span>
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAuthModal(true)
                        setAuthTab('register')
                      }}
                      className="clay-btn-primary px-7 py-3.5 text-base font-semibold inline-flex items-center gap-2 text-white shadow-lg cursor-pointer"
                    >
                      Start Studying Free
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  )}
                  <a
                    href="#sandbox"
                    className="clay-pill px-6 py-3.5 text-base font-medium text-foreground hover:bg-surface-muted transition-all"
                  >
                    Try Interactive Demo
                  </a>
                </div>

                {/* Micro Trust Stats */}
                <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 pt-1 text-xs sm:text-sm text-muted-foreground font-medium">
                  <span className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-emerald-500" />
                    100% Free & Open Source
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-emerald-500" />
                    No Credit Card Required
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-emerald-500" />
                    SM-2 Spaced Algorithm
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Middle Hero Container: Live Cloze Card OR Popped Claymorphic Auth Modal ── */}
          <motion.div
            layout="position"
            transition={{ duration: 0.55, ease: EASE }}
            className="w-full max-w-lg mx-auto pt-4 text-left"
          >
            <AnimatePresence mode="wait" initial={false}>
              {!showAuthModal ? (
                /* Card 1: Interactive Hero Preview Card */
                <motion.div
                  key="live-demo-card"
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.96,
                    y: -20,
                    transition: { duration: 0.3, ease: EASE },
                  }}
                  transition={{ duration: DUR.page, ease: EASE }}
                  className="clay-card p-6 sm:p-8 space-y-6 relative overflow-hidden group"
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-400/80" />
                      <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                      <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                      <span className="text-xs text-muted-foreground font-medium ml-2">
                        Live Cloze Demo
                      </span>
                    </div>
                    <Badge tone="accent" className="text-xs font-semibold">
                      Try typing below
                    </Badge>
                  </div>

                  <div className="space-y-4">
                    <p className="text-base sm:text-lg leading-relaxed text-foreground font-normal">
                      &quot;Spaced repetition is an evidence-based learning technique that
                      incorporates increasing intervals of{' '}
                      <span className="inline-block align-baseline">
                        <input
                          type="text"
                          value={heroInput}
                          onChange={(e) => {
                            setHeroInput(e.target.value)
                          }}
                          placeholder="[ type here ]"
                          className={`inline-block w-28 sm:w-36 text-center font-bold px-2 py-0.5 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 ${
                            isHeroCorrect
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-emerald-400/30'
                              : 'bg-surface border-border focus:border-primary focus:ring-primary/20'
                          }`}
                        />
                      </span>{' '}
                      between subsequent review of previously learned material.&quot;
                    </p>

                    <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                      <span className="italic">Hint: Dimension of clocks and hours</span>
                      <button
                        type="button"
                        onClick={() => {
                          setHeroRevealed(!heroRevealed)
                        }}
                        className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        {heroRevealed ? 'Hide answer' : 'Reveal answer'}
                      </button>
                    </div>

                    {heroRevealed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium"
                      >
                        Target Cloze Answer:{' '}
                        <strong className="font-bold underline decoration-primary">time</strong>
                      </motion.div>
                    )}

                    {isHeroCorrect && (
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2"
                      >
                        <CheckIcon className="h-4 w-4 text-emerald-600" />
                        <span>
                          Correct recall! Notice how active recall triggers deeper memory formation.
                        </span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* Card 2: Popped Claymorphic Auth Modal (Spacious, Balanced & Smooth) */
                <motion.div
                  key="auth-modal-card"
                  initial={{ opacity: 0, scale: 0.94, y: 25 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.94,
                    y: 25,
                    transition: { duration: 0.3, ease: EASE },
                  }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="clay-card p-8 sm:p-10 rounded-[2rem] shadow-2xl border border-border/70 relative overflow-hidden"
                >
                  <h1 className="sr-only">
                    {authTab === 'register' ? 'Create your account' : 'Sign in'}
                  </h1>

                  {authSuccess ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={SPRING}
                      className="py-10 text-center space-y-5"
                    >
                      <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-md">
                        <CheckIcon className="h-8 w-8" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-2xl font-extrabold text-foreground tracking-tight">
                          {authTab === 'register' ? 'Account Created!' : 'Welcome Back!'}
                        </h3>
                        <p className="text-sm text-muted-foreground font-medium">
                          Redirecting to your study dashboard...
                        </p>
                      </div>
                      <div className="w-36 h-1.5 bg-surface-muted rounded-full mx-auto overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 0.65, ease: 'easeInOut' }}
                          className="h-full bg-primary rounded-full"
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      {/* Top Bar: Segmented Switcher + Close Button */}
                      <div className="flex items-center justify-between gap-4 mb-7">
                        <div className="flex-1 p-1.5 rounded-2xl bg-surface-muted flex items-center border border-border/50 h-12">
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('register')
                              clear()
                            }}
                            className={`flex-1 py-2 text-center text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                              authTab === 'register'
                                ? 'bg-surface text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Create Account
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('login')
                              clear()
                            }}
                            className={`flex-1 py-2 text-center text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                              authTab === 'login'
                                ? 'bg-surface text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Sign In
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleCloseModal}
                          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-surface-muted/60 hover:bg-surface-muted text-muted-foreground hover:text-foreground border border-border/40 transition-all cursor-pointer"
                          aria-label="Back to demo"
                          title="Back to live demo"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>

                      {errors.general && <FormAlert message={errors.general} />}

                      {/* Auth Form with Generous Vertical Rhythm */}
                      <form
                        onSubmit={(e) => void handleAuthSubmit(e)}
                        noValidate
                        className="space-y-5"
                      >
                        <FormField
                          label="Email"
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
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
                            labelAction={
                              authTab === 'login' ? (
                                <Link
                                  to="/forgot-password"
                                  className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors underline"
                                >
                                  Forgot password?
                                </Link>
                              ) : undefined
                            }
                            type={showAuthPassword ? 'text' : 'password'}
                            value={authPassword}
                            onChange={(e) => {
                              setAuthPassword(e.target.value)
                              if (localPasswordError) setLocalPasswordError(null)
                            }}
                            placeholder={
                              authTab === 'register' ? 'Choose a password' : 'Enter your password'
                            }
                            error={localPasswordError ?? errors.fields.password}
                            leftIcon={<LockIcon className="h-4 w-4" />}
                            rightElement={
                              <button
                                type="button"
                                onClick={() => setShowAuthPassword(!showAuthPassword)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                              >
                                {showAuthPassword ? (
                                  <EyeOffIcon className="h-4 w-4" />
                                ) : (
                                  <EyeIcon className="h-4 w-4" />
                                )}
                              </button>
                            }
                            autoComplete={
                              authTab === 'register' ? 'new-password' : 'current-password'
                            }
                            required
                          />

                          {authTab === 'register' && (
                            <div className="flex items-center gap-2 pt-1 text-xs">
                              <span
                                className={`flex items-center gap-1 font-medium transition-colors ${
                                  isPasswordValid
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                <CheckIcon
                                  className={`h-3.5 w-3.5 ${
                                    isPasswordValid
                                      ? 'text-emerald-500'
                                      : 'text-muted-foreground/50'
                                  }`}
                                />
                                At least {PASSWORD_MIN_LENGTH} characters
                              </span>
                            </div>
                          )}
                        </div>

                        <Button
                          type="submit"
                          disabled={submitting}
                          className="clay-btn-primary w-full h-12 py-3 text-base font-bold rounded-2xl mt-4 shadow-lg cursor-pointer"
                          size="lg"
                        >
                          {submitting
                            ? authTab === 'register'
                              ? 'Creating account…'
                              : 'Signing in…'
                            : authTab === 'register'
                              ? 'Create Account'
                              : 'Sign in'}
                        </Button>
                      </form>

                      {/* Minimalist Divider */}
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

                      {/* Pill-shaped Google Auth Button */}
                      <div className="flex justify-center min-h-[44px]" ref={googleBtnRef}></div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* ── Triple Answering Engine Interactive Showcase ── */}
      <section
        id="study-modes"
        className="py-16 sm:py-24 bg-surface-muted/40 border-t border-border/60"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">
              Triple Answering Engine
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              One deck. Three ways to master it.
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              Different study sessions call for different cognitive demands. Switch answering modes
              on the fly without losing spaced repetition progress.
            </p>
          </div>

          {/* Mode Selector Pill Tabs */}
          <div className="flex justify-center">
            <div className="clay-pill p-1.5 inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMode('type-in')}
                className={`px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  selectedMode === 'type-in'
                    ? 'clay-btn-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Type-In (Active Recall)
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('multiple-choice')}
                className={`px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  selectedMode === 'multiple-choice'
                    ? 'clay-btn-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Multiple Choice (Quiz)
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('flashcard')}
                className={`px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  selectedMode === 'flashcard'
                    ? 'clay-btn-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Flashcards (Flip & Grade)
              </button>
            </div>
          </div>

          {/* Dynamic Mode Interactive Display */}
          <div className="max-w-2xl mx-auto">
            {selectedMode === 'type-in' && (
              <div className="clay-card p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">Mode: Type-In</span>
                  <span>Max Retention Strength</span>
                </div>
                <p className="text-lg leading-relaxed">
                  &quot;The powerhouse of the cell responsible for ATP synthesis is the{' '}
                  <span className="font-mono bg-surface-muted px-2 py-0.5 rounded border border-border/80 font-bold text-primary">
                    [ mitochondria ]
                  </span>
                  .&quot;
                </p>
                <div className="p-4 rounded-2xl bg-surface-muted/50 border border-border/50 text-xs text-muted-foreground space-y-2">
                  <p className="font-semibold text-foreground">Why this works:</p>
                  <p>
                    Typing out the exact keyword forces full retrieval from neural pathways,
                    delivering up to 300% higher long-term retention than passive reading.
                  </p>
                </div>
              </div>
            )}

            {selectedMode === 'multiple-choice' && (
              <div className="clay-card p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">Mode: Multiple Choice (Quiz)</span>
                  <span>Fast Rapid-Fire Review</span>
                </div>
                <p className="text-lg leading-relaxed">
                  &quot;The powerhouse of the cell responsible for ATP synthesis is the{' '}
                  <span className="text-primary font-bold underline decoration-wavy">[ ? ]</span>
                  .&quot;
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {['Ribosome', 'Mitochondria', 'Endoplasmic Reticulum', 'Golgi Apparatus'].map(
                    (opt, idx) => {
                      const isChosen = mcSelection === idx
                      const isCorrect = idx === 1
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setMcSelection(idx)}
                          className={`p-3.5 rounded-2xl text-sm font-semibold border text-left transition-all ${
                            isChosen
                              ? isCorrect
                                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                                : 'bg-red-500/15 border-red-500 text-red-800 dark:text-red-300'
                              : 'bg-surface hover:bg-surface-muted border-border/60 text-foreground'
                          }`}
                        >
                          <span className="inline-block w-6 text-muted-foreground">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          {opt}
                        </button>
                      )
                    },
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic text-center">
                  Smart Contextual Distractors generated automatically from your notes.
                </p>
              </div>
            )}

            {selectedMode === 'flashcard' && (
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="clay-card p-8 sm:p-12 text-center space-y-6 cursor-pointer select-none transition-all hover:scale-[1.01]"
              >
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {isFlipped ? 'Back (Answer & Explanation)' : 'Front (Prompt) — Click to Flip'}
                </div>
                <div className="min-h-[100px] flex items-center justify-center">
                  {!isFlipped ? (
                    <p className="text-xl font-bold text-foreground">
                      &quot;The powerhouse of the cell responsible for ATP synthesis is the [ ...
                      ].&quot;
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        Mitochondria
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Generates most of the chemical energy needed to power biochemical reactions.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex justify-center gap-2 pt-2 text-xs text-muted-foreground">
                  <span className="clay-pill px-3 py-1 font-medium">3D Flip with SM-2 Grading</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Interactive Cloze Sandbox ── */}
      <section id="sandbox" className="py-16 sm:py-24 relative">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">
              Interactive Sandbox
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Create a cloze recall card in 5 seconds.
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              Type or paste any sentence below. Click any word to turn it into an active recall
              blank.
            </p>
          </div>

          <div className="clay-card p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                1. Edit or Paste Text
              </label>
              <textarea
                value={sandboxText}
                onChange={(e) => {
                  setSandboxText(e.target.value)
                  setBlankWord('')
                }}
                rows={2}
                className="w-full rounded-2xl border border-border/80 bg-surface p-4 text-sm sm:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                2. Click a word to make it a recall blank
              </label>
              <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-surface-muted/50 border border-border/50">
                {sandboxWords.map((w, idx) => {
                  const cleaned = w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
                  const isSelected =
                    cleaned.toLowerCase() === blankWord.toLowerCase() && blankWord !== ''
                  return (
                    <button
                      key={`${w}-${idx}`}
                      type="button"
                      onClick={() => {
                        setBlankWord(cleaned)
                        setSandboxTestInput('')
                        setSandboxRevealed(false)
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'clay-btn-primary text-white scale-105 shadow-sm'
                          : 'bg-surface hover:bg-surface-muted text-foreground border border-border/60'
                      }`}
                    >
                      {w}
                    </button>
                  )
                })}
              </div>
            </div>

            {blankWord && (
              <div className="pt-4 border-t border-border/50 space-y-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">3. Generated Flashcard Preview</span>
                  <span>Active Blank: &ldquo;{blankWord}&rdquo;</span>
                </div>

                <div className="p-5 rounded-2xl bg-surface-muted/30 border border-border/60 space-y-3">
                  <p className="text-base sm:text-lg leading-relaxed">
                    {sandboxWords.map((w, idx) => {
                      const cleaned = w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
                      if (cleaned.toLowerCase() === blankWord.toLowerCase()) {
                        return (
                          <span key={idx} className="inline-block align-baseline mx-1">
                            <input
                              type="text"
                              value={sandboxTestInput}
                              onChange={(e) => setSandboxTestInput(e.target.value)}
                              placeholder="[ ? ]"
                              className={`w-28 sm:w-32 text-center font-bold px-2 py-0.5 rounded-lg border text-sm transition-all ${
                                sandboxTestInput.trim().toLowerCase() === blankWord.toLowerCase()
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-surface border-border'
                              }`}
                            />
                          </span>
                        )
                      }
                      return <span key={idx}>{w} </span>
                    })}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setSandboxRevealed(!sandboxRevealed)}
                      className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      {sandboxRevealed ? 'Hide Answer' : 'Reveal Answer'}
                    </button>
                    {sandboxTestInput.trim().toLowerCase() === blankWord.toLowerCase() && (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckIcon className="h-4 w-4" /> Correct recall!
                      </span>
                    )}
                  </div>

                  {sandboxRevealed && (
                    <div className="p-2 rounded-xl bg-primary/10 text-xs text-primary font-medium">
                      Answer: <strong>{blankWord}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Feature Bento Grid ── */}
      <section
        id="features"
        className="py-16 sm:py-24 bg-surface-muted/40 border-t border-border/60"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">
              Engineered For Mastery
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              Everything you need. Zero bloat.
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tile 1 */}
            <div className="clay-card p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <FileTextIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-foreground">Instant Paste & Cloze Cards</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Paste lecture summaries, textbook passages, or notes. Saulado cleans up typography,
                splits paragraphs into cards, and turns highlighted phrases into instant recall
                cloze blanks.
              </p>
            </div>

            {/* Tile 2 */}
            <div className="clay-card p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                <FlameIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-foreground">SM-2 Spaced Algorithm</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Scientifically calculated review intervals. Review cards right at the peak of the
                forgetting curve to cement concepts into permanent memory.
              </p>
            </div>

            {/* Tile 3 */}
            <div className="clay-card p-6 sm:p-8 space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <BookOpenIcon className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-foreground">Starter Seed Decks</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Explore curated foundational decks in Computer Science, World History, and Human
                Physiology with 1-click bundle import.
              </p>
            </div>

            {/* Tile 4: Offline Android App Banner (Spans Full Width on Desktop) */}
            <div className="clay-card p-6 sm:p-8 space-y-4 md:col-span-3 bg-gradient-to-r from-primary/10 via-surface to-accent/10 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center sm:text-left flex-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold">
                  <SmartphoneIcon className="h-3.5 w-3.5" />
                  <span>Android Mobile App · Standalone APK</span>
                </div>
                <h4 className="text-xl sm:text-2xl font-bold text-foreground">
                  Study 100% Offline with our Mobile PDF Reader
                </h4>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Highlight lecture slides directly on your phone, queue study snippets into your
                  Bag, and review flashcards without an internet connection.
                </p>
              </div>
              <Link
                to="/nfc"
                className="clay-btn-primary px-6 py-3 text-sm font-bold inline-flex items-center gap-2 text-white shadow-md hover:scale-105 shrink-0"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>Download Android APK</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final Call to Action ── */}
      <section className="py-20 sm:py-28 text-center relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
          <div className="clay-card p-8 sm:p-14 space-y-6 bg-gradient-to-b from-surface via-surface to-primary/5">
            <MascotSprite className="mx-auto" />
            <div className="space-y-3 max-w-xl mx-auto">
              <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                Ready to transform the way you learn?
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                Join thousands of students mastering complex subjects with contextual spaced recall.
              </p>
            </div>
            <div className="pt-2">
              {status === 'authenticated' ? (
                <Link
                  to="/dashboard"
                  className="clay-btn-primary px-8 py-3.5 text-base font-semibold inline-flex items-center gap-2 text-white shadow-md cursor-pointer"
                >
                  <span>Open Dashboard</span>
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(true)
                    setAuthTab('register')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="clay-btn-primary px-8 py-3.5 text-base font-semibold inline-flex items-center gap-2 text-white shadow-md cursor-pointer"
                >
                  Create Free Account
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Minimalist Footer ── */}
      <footer className="mt-auto border-t border-border/60 py-8 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium">
            <Logo className="h-5 w-5" />
            <span>© 2026 Saulado. Built for active recall.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/nfc" className="hover:text-foreground transition-colors">
              Android App (APK)
            </Link>
            {status === 'authenticated' ? (
              <Link
                to="/dashboard"
                className="hover:text-foreground transition-colors font-semibold text-primary"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(true)
                    setAuthTab('login')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="hover:text-foreground transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(true)
                    setAuthTab('register')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="hover:text-foreground transition-colors cursor-pointer"
                >
                  Register
                </button>
              </>
            )}
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              Overview
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

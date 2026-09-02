import type { ReactElement, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertIcon,
  ChevronRightIcon,
  FileTextIcon,
  FlameIcon,
  SparklesIcon,
  ZapIcon,
} from '@/components/ui/icons'
import { Logo, MascotSprite } from '@/components/ui/brand'
import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  activeTab?: 'login' | 'register'
  children: ReactNode
  footer?: ReactNode
}

/**
 * Enhanced Claymorphic & Minimalist Auth Frame.
 *
 * Provides a split-screen or focused layout:
 * - Ambient backdrop radial accents
 * - Left panel on wide viewports showing brand, mascot, and value pillars
 * - Right panel with a tactile .clay-card, segmented tabs, and accessible form
 */
export function AuthLayout({
  title,
  subtitle,
  activeTab,
  children,
  footer,
}: AuthLayoutProps): ReactElement {
  const location = useLocation()
  const currentTab =
    activeTab ??
    (location.pathname === '/register'
      ? 'register'
      : location.pathname === '/login'
        ? 'login'
        : undefined)

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col justify-between overflow-x-hidden selection:bg-accent/20">
      {/* ── Ambient Radial Glows ── */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-accent/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* ── Minimal Header ── */}
      <header className="w-full px-6 py-6 sm:px-10 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-foreground hover:text-primary transition-colors group"
        >
          <Logo className="h-7 w-7 transition-transform group-hover:scale-105" />
          <span className="text-lg tracking-tight font-extrabold">Saulado</span>
        </Link>

        <Link
          to="/"
          className="clay-pill px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <span>Explore Features</span>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* ── Main Content Container ── */}
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-4 sm:py-8 flex-1 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* ── Left Column: Brand Showcase (Visible on Large Screens) ── */}
          <div className="hidden lg:flex lg:col-span-5 flex-col space-y-6 text-left">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 clay-pill px-3.5 py-1 text-xs font-semibold text-primary">
                <SparklesIcon className="h-3.5 w-3.5 text-accent" />
                <span>Active Recall · Spaced Repetition</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground leading-tight">
                Master complex concepts{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-teal-500">
                  in context.
                </span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Transform textbooks, notes, and study material into smart cloze recall cards with
                scientific SM-2 spacing.
              </p>
            </div>

            {/* Feature Badges Card (Claymorphic) */}
            <div className="clay-card p-5 rounded-2xl space-y-3.5 border border-border/60">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ZapIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Triple Answering Engine</h3>
                  <p className="text-xs text-muted-foreground">
                    Type-in recall, multiple-choice quiz, and 3D flashcards.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <FlameIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">SM-2 Spaced Algorithm</h3>
                  <p className="text-xs text-muted-foreground">
                    Review cards at the optimal moment before forgetting.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileTextIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Instant OCR & File Import</h3>
                  <p className="text-xs text-muted-foreground">
                    Import slides, images, and text in seconds.
                  </p>
                </div>
              </div>
            </div>

            {/* Mascot Greeting */}
            <div className="flex items-center gap-3 pt-1">
              <MascotSprite />
              <p className="text-xs text-muted-foreground font-medium">
                100% Free · Open Source · No Credit Card Required
              </p>
            </div>
          </div>

          {/* ── Right Column: Auth Form Card ── */}
          <div className="w-full lg:col-span-7 max-w-md mx-auto">
            <div className="clay-card p-6 sm:p-9 rounded-3xl shadow-lg border border-border/60 relative">
              {/* Optional Segmented Tab Switcher for Sign In / Register */}
              {currentTab && (
                <div className="mb-6 p-1 rounded-2xl bg-surface-muted flex items-center justify-between border border-border/50">
                  <Link
                    to="/login"
                    className={cn(
                      'flex-1 py-2 text-center text-xs sm:text-sm font-bold rounded-xl transition-all',
                      currentTab === 'login'
                        ? 'bg-surface text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    className={cn(
                      'flex-1 py-2 text-center text-xs sm:text-sm font-bold rounded-xl transition-all',
                      currentTab === 'register'
                        ? 'bg-surface text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Create Account
                  </Link>
                </div>
              )}

              {/* Title & Subtitle */}
              <div className="mb-6 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>

              {/* Children (Form Content) */}
              {children}

              {/* Footer */}
              {footer && (
                <div className="mt-6 border-t border-border/60 pt-5 text-sm">{footer}</div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Minimal Footer ── */}
      <footer className="w-full px-6 py-4 text-center text-xs text-muted-foreground">
        <span>© 2026 Saulado. Designed for high-retention active recall.</span>
      </footer>
    </div>
  )
}

/**
 * Whole-form error banner.
 */
export function FormAlert({ message }: { message: string }): ReactElement {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2.5 rounded-2xl bg-warning/10 p-3.5 text-sm text-warning border border-warning/20 font-medium animate-in fade-in duration-200"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

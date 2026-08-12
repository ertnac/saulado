import { useState, type ReactElement, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useOnboarding } from './useOnboarding'

// ── Slide data ────────────────────────────────────────────────────────────────

interface Slide {
  emoji: string
  title: string
  body: ReactNode
}

const SLIDES: Slide[] = [
  {
    emoji: '👋',
    title: 'Welcome to Saulado',
    body: (
      <>
        Saulado is a spaced-repetition study tool. It shows you cards at exactly the right moment —
        just before you'd forget them — so you remember more with less time.
      </>
    ),
  },
  {
    emoji: '📚',
    title: 'Create a set',
    body: (
      <>
        Head to <strong>Sets</strong> and hit <strong>New set</strong>. Give it a name, then add
        cards. Each card has a front and a back — a question and its answer.
        <br />
        <br />
        You can also highlight key phrases inside a card to focus your review on what matters.
      </>
    ),
  },
  {
    emoji: '🧠',
    title: 'Study when cards are due',
    body: (
      <>
        The dashboard shows how many cards are due today. Hit <strong>Start studying</strong> and
        Saulado will queue them up.
        <br />
        <br />
        Rate each card as <em>Again</em>, <em>Hard</em>, <em>Good</em>, or <em>Easy</em>. The
        algorithm schedules the next review based on your answer.
      </>
    ),
  },
  {
    emoji: '🎉',
    title: "You're all set",
    body: (
      <>
        That's everything. Create your first set, add a few cards, and come back tomorrow to study
        them.
        <br />
        <br />
        Your streak and progress will appear on the dashboard as you build the habit.
      </>
    ),
  },
]

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }): ReactElement {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={[
            'block rounded-full transition-all duration-300',
            i === current ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-border',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * First-run onboarding overlay.
 *
 * Self-managing: reads its own show/dismiss state from `useOnboarding`.
 * Renders nothing after the user has dismissed it once.
 *
 * Deliberately not using the shared `Dialog` component — the onboarding modal
 * has a different visual language (full-bleed emoji hero, step indicator,
 * two-button footer) that would require special-casing the generic Dialog.
 */
export function OnboardingModal(): ReactElement | null {
  const { show, dismiss } = useOnboarding()
  const [step, setStep] = useState(0)

  if (!show) return null

  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1
  const isFirst = step === 0

  function next(): void {
    if (isLast) {
      dismiss()
    } else {
      setStep((s) => s + 1)
    }
  }

  function back(): void {
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding walkthrough"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-t-2xl bg-surface shadow-lift sm:rounded-2xl overflow-hidden">
        {/* Emoji hero band */}
        <div className="flex items-center justify-center py-10 bg-surface-muted">
          <span className="text-6xl select-none" role="img" aria-label={slide?.title}>
            {slide?.emoji}
          </span>
        </div>

        {/* Content */}
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{slide?.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{slide?.body}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-5">
          {/* Back / Skip */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={back}>
                Back
              </Button>
            )}
            {!isLast && (
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Skip
              </Button>
            )}
          </div>

          {/* Step dots centred */}
          <div className="flex-1 flex justify-center">
            <StepDots total={SLIDES.length} current={step} />
          </div>

          {/* Next / Finish */}
          <Button variant={isLast ? 'accent' : 'default'} size="sm" onClick={next} autoFocus>
            {isLast ? 'Get started' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}

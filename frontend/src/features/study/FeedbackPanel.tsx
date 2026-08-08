import type { ReactElement } from 'react'
import type { AnswerResponse, Grade } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { CheckIcon, CloseIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

/**
 * The verdict on the card just answered (plan §4.3).
 *
 * Deliberately below the card rather than over it: a modal would cover the
 * paragraph, and the paragraph is the thing worth re-reading while the answer is
 * fresh. Nothing here moves the card above it, so the sentence the user just
 * worked on stays exactly where their eyes left it.
 *
 * `role="status"` rather than `role="alert"`: this is announced after the
 * submission the user initiated, so it is polite output, not an interruption.
 * `alert` would cut off whatever a screen reader was mid-way through saying.
 */

interface FeedbackPanelProps {
  answer: AnswerResponse
  /** `true` while the next card is being fetched or the session finished. */
  pending: boolean
  onNext: () => void
  isLast: boolean
}

const GRADE_LABEL: Record<Grade, string> = {
  again: 'Not quite',
  hard: 'Partly right',
  good: 'Correct',
  easy: 'Correct',
}

/** "in 1 day" reads better than "in 1 days", and "tomorrow" better than either. */
function whenBack(intervalDays: number): string {
  if (intervalDays <= 1) return 'tomorrow'
  if (intervalDays < 30) return `in ${String(intervalDays)} days`
  const months = Math.round(intervalDays / 30)
  return months === 1 ? 'in about a month' : `in about ${String(months)} months`
}

export function FeedbackPanel({
  answer,
  pending,
  onNext,
  isLast,
}: FeedbackPanelProps): ReactElement {
  const wrong = answer.results.filter((result) => !result.correct)
  const typos = answer.results.filter((result) => result.correct && result.matchType === 'typo')

  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border p-5 shadow-soft',
        answer.correct ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/*
          Icon, word and colour all say the same thing. Any one of the three is
          enough on its own, which is the requirement — roughly one reader in
          twelve cannot separate the green from the red.
        */}
        <p
          className={cn(
            'flex items-center gap-1.5 text-lg font-semibold',
            answer.correct ? 'text-success' : 'text-danger',
          )}
        >
          {answer.correct ? <CheckIcon /> : <CloseIcon />}
          {GRADE_LABEL[answer.grade]}
        </p>

        {/*
          The schedule is stated in plain language because it is the payoff of
          answering honestly — a user who cannot see that "again" means "back
          tomorrow" has no reason not to reveal every card.
        */}
        <p className="text-sm text-muted-foreground">
          {answer.requeued
            ? 'Coming back later in this session, and again tomorrow.'
            : `Back ${whenBack(answer.intervalDays)}.`}
        </p>
      </div>

      {/*
        Echoing the wrong submission beside the right answer is the whole point of
        the panel: "you wrote X, it was Y" is a correction, "it was Y" alone
        leaves the user to remember what they typed.
      */}
      {wrong.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {wrong.map((result) => (
            <li key={result.ordinal} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-foreground">
                Blank {result.ordinal + 1}
                {result.submitted.trim() === '' ? ' (left blank)' : ':'}
              </span>
              {result.submitted.trim() !== '' && (
                <span className="font-mono line-through opacity-70">{result.submitted}</span>
              )}
              <span className="font-mono font-semibold">{result.canonical}</span>
            </li>
          ))}
        </ul>
      )}

      {typos.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Counted as correct despite the spelling —{' '}
          {typos.map((result) => result.canonical).join(', ')}.
        </p>
      )}

      {answer.isLeech && (
        <p className="mt-3 text-sm">
          This card keeps catching you out. It is often worth rewriting the paragraph so the answer
          is inferable from its context.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        {/*
          Autofocused so Enter continues. The user's hands are on the keyboard —
          they just typed an answer — and making them reach for the mouse between
          every card is what makes a 30-card session feel like work.
        */}
        <Button autoFocus disabled={pending} onClick={onNext}>
          {isLast ? 'Finish session' : 'Next card'}
        </Button>
        <p className="text-sm tabular-nums text-muted-foreground">
          {answer.progress.answered} of {answer.progress.total}
        </p>
      </div>
    </div>
  )
}

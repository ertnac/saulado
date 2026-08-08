import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { SessionSummary } from '@saulado/shared'
import { buttonClass } from '@/components/ui/button'

/**
 * What the session added up to (plan §4.4).
 *
 * Reports rather than congratulates. The accuracy figure is the honest one —
 * cards answered correctly on the first attempt over cards seen — because a
 * number that quietly counts the retry of a failed card as a success makes the
 * whole screen worthless as feedback.
 */

interface SessionSummaryViewProps {
  summary: SessionSummary
  /** Where "study again" should go — the set just studied, or everything. */
  studySetId: string | null
  onStudyAgain: () => void
  pending: boolean
}

function minutes(durationMs: number): string {
  const total = Math.round(durationMs / 1000)
  if (total < 60) return `${String(total)}s`
  return `${String(Math.floor(total / 60))}m ${String(total % 60)}s`
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function SessionSummaryView({
  summary,
  studySetId,
  onStudyAgain,
  pending,
}: SessionSummaryViewProps): ReactElement {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Session complete</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.goalMet
            ? `You have met your daily goal — ${String(summary.reviewsToday)} reviews today.`
            : `${String(summary.reviewsToday)} of ${String(summary.dailyGoal)} reviews toward today's goal.`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cards" value={String(summary.cardsSeen)} />
        <Stat label="Correct" value={String(summary.correctCards)} />
        <Stat label="Accuracy" value={`${String(Math.round(summary.accuracy * 100))}%`} />
        <Stat label="Time" value={minutes(summary.durationMs)} />
      </div>

      {/*
        Linked, not just listed. The cards worth another look are exactly the ones
        the user might want to rewrite — a card that keeps failing is usually a
        card whose paragraph does not carry enough context to recall the answer.
      */}
      {summary.toRevisit.length > 0 && (
        <section className="rounded-lg border border-border p-5">
          <h2 className="font-medium">Worth another look</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These were graded again or hard. They are already scheduled to come back.
          </p>
          <ul className="mt-3 space-y-1.5">
            {summary.toRevisit.map((card) => (
              <li key={card.cardId}>
                <Link
                  to={`/cards/${card.cardId}`}
                  className="rounded text-sm hover:underline focus-visible:underline"
                >
                  {card.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass()} disabled={pending} onClick={onStudyAgain}>
          {pending ? 'Checking…' : 'Study again'}
        </button>
        <Link
          className={buttonClass({ variant: 'outline' })}
          to={studySetId === null ? '/sets' : `/sets/${studySetId}`}
        >
          {studySetId === null ? 'Back to your sets' : 'Back to the set'}
        </Link>
      </div>
    </div>
  )
}

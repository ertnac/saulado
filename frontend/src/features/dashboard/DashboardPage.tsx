import { useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { DashboardResponse, RecentSet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { GoalRing } from '@/components/charts/GoalRing'
import { Sparkline } from '@/components/charts/Sparkline'
import { SetDialog } from '@/features/cards/SetDialog'
import { useCreateSet } from '@/features/cards/queries'
import { useAuthStore } from '@/stores/auth'
import { useDashboard } from './queries'
import { StreakCard } from './StreakCard'

/**
 * The dashboard (plan §5.2).
 *
 * One request, not six — everything below comes from `GET /api/dashboard`, so
 * the page arrives in one piece rather than shifting four times as separate
 * queries land.
 *
 * The structure is unchanged from Phase 4 and deliberately so: **one dominant
 * call to action**, and four honest states beneath it rather than one number
 * that means four different things. What Phase 5 adds — streak, goal, sparkline,
 * recent sets — is strictly secondary, sits *below* the CTA, and is hidden
 * entirely from a user who has never studied. A brand-new account showing a
 * 0-day streak, an empty ring and a flat sparkline is three pieces of evidence
 * that they have failed at something they have not yet been offered
 * (saulado-ux §5).
 */

// ── The hero: exactly one of these, and it owns the only large CTA ───────────

function DuePanel({ due }: { due: number }): ReactElement {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due today</p>
      <p className="mt-2 text-4xl font-semibold tabular-nums">{due}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {due === 1 ? 'One card is ready for review.' : `${String(due)} cards are ready for review.`}
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-4' })} to="/study">
        Start studying
      </Link>
    </div>
  )
}

/**
 * Nothing due, but there are cards the user has never seen.
 *
 * Kept apart from "caught up" because it is also the state of a user who has
 * built a set and not yet studied it — for them "every review is done" would be
 * a claim about work they have not started.
 */
function ReadyToLearn({ newCards }: { newCards: number }): ReactElement {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New cards</p>
      <p className="mt-2 text-4xl font-semibold tabular-nums">{newCards}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {newCards === 1
          ? 'One card is waiting to be learned.'
          : `${String(newCards)} cards are waiting to be learned.`}
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-4' })} to="/study">
        Start learning
      </Link>
    </div>
  )
}

/**
 * Shown when the day's reviews are finished and there is nothing new left.
 *
 * Distinct from the never-studied empty state on purpose: "caught up" is an
 * achievement and should not look like "nothing here".
 */
function CaughtUp(): ReactElement {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="font-medium">Caught up for today</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Every review is done. The next batch unlocks tomorrow.
      </p>
    </div>
  )
}

function ExampleCard(): ReactElement {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        What a card looks like
      </p>

      <p className="mt-3 text-base leading-relaxed">
        The{' '}
        {/*
          Fixed-width blank (saulado-ux §1.1): 8ch regardless of the answer, so
          the gap never hints at the length of the word. Even in a static
          illustration — this is the shape the real thing has to keep.
        */}
        <span
          className="mx-0.5 inline-block border-b-2 border-foreground align-baseline"
          style={{ width: '8ch' }}
          aria-label="blank 1 of 1"
        />{' '}
        is the brain of the computer, carrying out the instructions of a program.
      </p>

      <p className="mt-4 text-sm text-muted-foreground">
        You write the paragraph, highlight <span className="font-medium">CPU</span>, and Saulado
        turns it into a question that keeps the sentence around it. Recall in context, not from a
        bare flashcard.
      </p>
    </div>
  )
}

/**
 * Shown when the dashboard could not be fetched.
 *
 * Not an error page. Studying does not depend on this request, and a failed
 * background query should not stand between the user and their reviews.
 */
function DashboardUnavailable(): ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-border p-5">
      <p className="text-sm text-muted-foreground">
        Could not load today&apos;s summary. Studying still works.
      </p>
      <Link className={buttonClass({ className: 'mt-4' })} to="/study">
        Go to study
      </Link>
    </div>
  )
}

/** The never-studied state: teach what a card is instead of showing a zero. */
function GettingStarted({ onCreate }: { onCreate: () => void }): ReactElement {
  return (
    <>
      <ExampleCard />

      <div className="rounded-lg border border-dashed border-border p-5">
        <p className="text-sm text-muted-foreground">
          A set holds cards on one subject. Each card is a paragraph of your own notes with the
          words worth recalling blanked out.
        </p>
        <Button size="lg" className="mt-4" onClick={onCreate}>
          Create your first set
        </Button>
      </div>
    </>
  )
}

// ── Secondary: only ever rendered for a user who has studied ────────────────

function RecentSetRow({ set }: { set: RecentSet }): ReactElement {
  function detail(): string {
    if (set.dueCount > 0) {
      return set.dueCount === 1 ? '1 card due' : `${String(set.dueCount)} cards due`
    }
    // Falls back to size rather than to "0 due" — the row is a way back into a
    // set, not a scorecard for it.
    return set.cardCount === 1 ? '1 card' : `${String(set.cardCount)} cards`
  }

  return (
    <li>
      <Link
        to={`/sets/${set.id}`}
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-border px-4 py-3 hover:bg-muted"
      >
        <span className="min-w-0 truncate font-medium">{set.title}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{detail()}</span>
      </Link>
    </li>
  )
}

function RecentSets({ sets, onCreate }: { sets: RecentSet[]; onCreate: () => void }): ReactElement {
  return (
    <section aria-labelledby="recent-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-heading" className="text-sm font-medium uppercase tracking-wide">
          Your sets
        </h2>
        {/*
          Secondary styling, not another primary button. The plan asks for a
          single dominant CTA, and two filled buttons on one screen is two.
        */}
        <Button variant="outline" size="sm" onClick={onCreate}>
          New set
        </Button>
      </div>

      <ul className="space-y-2">
        {sets.map((set) => (
          <RecentSetRow key={set.id} set={set} />
        ))}
      </ul>

      <Link to="/sets" className="inline-block text-sm text-muted-foreground underline">
        All sets
      </Link>
    </section>
  )
}

function TodaySection({ data }: { data: DashboardResponse }): ReactElement {
  return (
    <section aria-labelledby="progress-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="progress-heading" className="text-sm font-medium uppercase tracking-wide">
          Your progress
        </h2>
        <Link to="/progress" className="text-sm text-muted-foreground underline">
          See all progress
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StreakCard streak={data.streak} />

        <div className="rounded-lg border border-border p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today</p>
          <div className="mt-3">
            <GoalRing value={data.today.reviews} goal={data.today.goal} met={data.today.goalMet} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last 7 days
        </p>
        <div className="mt-3">
          <Sparkline days={data.sparkline} label="Reviews in the last 7 days" />
        </div>
      </div>
    </section>
  )
}

export function DashboardPage(): ReactElement {
  const user = useAuthStore((s) => s.user)
  const dashboard = useDashboard()
  const createSet = useCreateSet()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const data = dashboard.data

  function heading(): string {
    if (dashboard.isPending || dashboard.isError || data === undefined) return 'Study'
    if (data.totalDue > 0) return 'Ready to review'
    if (data.newCards > 0) return data.hasStudied ? 'Today' : 'Ready when you are'
    if (data.hasStudied) return 'Today'
    return 'Nothing to study yet'
  }

  function hero(): ReactElement {
    // Sized to the due panel rather than a generic bar: a skeleton that is the
    // wrong height shifts the page exactly once, on arrival (saulado-ux §5).
    if (dashboard.isPending) return <Skeleton className="h-[188px]" />
    if (dashboard.isError || data === undefined) return <DashboardUnavailable />
    if (data.totalDue > 0) return <DuePanel due={data.totalDue} />
    if (data.newCards > 0) return <ReadyToLearn newCards={data.newCards} />
    if (data.hasStudied) return <CaughtUp />

    return (
      <GettingStarted
        onCreate={() => {
          setCreating(true)
        }}
      />
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user ? `Welcome, ${user.email.split('@')[0] ?? 'there'}` : 'Welcome'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Build a set, highlight what matters, and study it in context.
        </p>
      </header>

      <section aria-labelledby="study-heading" className="space-y-4">
        <h2 id="study-heading" className="text-sm font-medium uppercase tracking-wide">
          {heading()}
        </h2>

        {hero()}
      </section>

      {/*
        Both gated on `hasStudied`, not on the data being present. A streak of 0,
        a ring at 0/20 and a flat sparkline are all *accurate* for a new user and
        all read as failure. There is nothing to show until there is something to
        show.
      */}
      {data?.hasStudied === true && <TodaySection data={data} />}

      {data !== undefined && data.recentSets.length > 0 && (
        <RecentSets
          sets={data.recentSets}
          onCreate={() => {
            setCreating(true)
          }}
        />
      )}

      {creating && (
        <SetDialog
          open
          onClose={() => {
            setCreating(false)
          }}
          pending={createSet.isPending}
          onSubmit={async (values) => {
            const created = await createSet.mutateAsync(values)
            // Straight into the new set. A create that leaves the user back on
            // the dashboard makes them hunt for the thing they just made, and
            // the next step is always "add a card".
            void navigate(`/sets/${created.set.id}`)
          }}
        />
      )}
    </div>
  )
}

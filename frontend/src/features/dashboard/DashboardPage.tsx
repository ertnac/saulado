import { useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { DashboardResponse, RecentSet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardFigure, CardLabel } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRightIcon, PlusIcon, SparkIcon } from '@/components/ui/icons'
import { MascotSprite } from '@/components/ui/brand'
import { PageHeader } from '@/components/layout/PageHeader'
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
    // The one accent-toned panel on the page, and the one filled CTA. The tint
    // is what makes "you have work waiting" legible before a word is read.
    <Card tone="accent" className="p-5 sm:p-6">
      <CardLabel>Due today</CardLabel>
      <CardFigure>{due}</CardFigure>
      <p className="mt-1 text-sm text-muted-foreground">
        {due === 1 ? 'One card is ready for review.' : `${String(due)} cards are ready for review.`}
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-5' })} to="/study">
        Start studying
        <ChevronRightIcon />
      </Link>
    </Card>
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
    <Card className="p-5 sm:p-6">
      <CardLabel>New cards</CardLabel>
      <CardFigure>{newCards}</CardFigure>
      <p className="mt-1 text-sm text-muted-foreground">
        {newCards === 1
          ? 'One card is waiting to be learned.'
          : `${String(newCards)} cards are waiting to be learned.`}
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-5' })} to="/study">
        Start learning
        <ChevronRightIcon />
      </Link>
    </Card>
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
    <Card className="flex items-start gap-4 p-5 sm:p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-xl text-success">
        <SparkIcon />
      </span>
      <div>
        <p className="font-medium">Caught up for today</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every review is done. The next batch unlocks tomorrow.
        </p>
      </div>
    </Card>
  )
}

function ExampleCard(): ReactElement {
  return (
    <Card className="p-5 sm:p-6">
      <CardLabel>What a card looks like</CardLabel>

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
        You write the paragraph, highlight{' '}
        <span className="rounded bg-highlight px-1 font-medium text-highlight-foreground">CPU</span>
        , and Saulado turns it into a question that keeps the sentence around it. Recall in context,
        not from a bare flashcard.
      </p>
    </Card>
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
    <Card tone="dashed" className="p-5 sm:p-6">
      <p className="text-sm text-muted-foreground">
        Could not load today&apos;s summary. Studying still works.
      </p>
      <Link className={buttonClass({ className: 'mt-4' })} to="/study">
        Go to study
      </Link>
    </Card>
  )
}

/** The never-studied state: teach what a card is instead of showing a zero. */
function GettingStarted({ onCreate }: { onCreate: () => void }): ReactElement {
  return (
    <>
      <ExampleCard />

      <Card tone="dashed" className="p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">
          A set holds cards on one subject. Each card is a paragraph of your own notes with the
          words worth recalling blanked out.
        </p>
        <Button size="lg" className="mt-5" onClick={onCreate}>
          <PlusIcon />
          Create your first set
        </Button>
      </Card>
    </>
  )
}

/**
 * Sets exist, but nothing in them can be studied yet.
 *
 * Split out from `GettingStarted` because that one says "create your first set",
 * which is plainly false for a user whose own set list renders directly below
 * it. Two routes land here — a set with no cards, and a card whose words have
 * not been highlighted — and both end in the same place, so this points into the
 * set rather than guessing which of the two the user is in.
 *
 * The highlighting half is the one worth naming: a card saves without blanks, is
 * listed on its set page, and is still not a question. Nothing else on the
 * dashboard would ever say so.
 */
function NothingReady({ set }: { set: RecentSet }): ReactElement {
  return (
    <Card tone="dashed" className="p-5 sm:p-6">
      <p className="text-sm text-muted-foreground">
        A card becomes a question when you highlight the words worth recalling. Until then it is
        just a paragraph, and there is nothing to ask you.
      </p>
      <Link
        className={buttonClass({ size: 'lg', className: 'mt-5 max-w-full' })}
        to={`/sets/${set.id}`}
      >
        <span className="min-w-0 truncate">Open {set.title}</span>
        <ChevronRightIcon />
      </Link>
    </Card>
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
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-md bg-surface px-4 py-3 shadow-soft transition-shadow duration-150 hover:shadow-lift"
      >
        <span className="min-w-0 truncate font-medium">{set.title}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted-foreground">
          {detail()}
          <ChevronRightIcon />
        </span>
      </Link>
    </li>
  )
}

function RecentSets({ sets, onCreate }: { sets: RecentSet[]; onCreate: () => void }): ReactElement {
  return (
    <section aria-labelledby="recent-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 id="recent-heading" className="text-lg font-semibold tracking-tight">
            Your sets
          </h2>
          {/* Outside the heading — see the note in PageHeader. */}
          <Badge>{sets.length}</Badge>
        </div>
        {/*
          Secondary styling, not another primary button. The plan asks for a
          single dominant CTA, and two filled buttons on one screen is two.
        */}
        <Button variant="soft" size="sm" onClick={onCreate}>
          <PlusIcon />
          New set
        </Button>
      </div>

      <ul className="space-y-2">
        {sets.map((set) => (
          <RecentSetRow key={set.id} set={set} />
        ))}
      </ul>

      <Link
        to="/sets"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        All sets
        <ChevronRightIcon />
      </Link>
    </section>
  )
}

function TodaySection({ data }: { data: DashboardResponse }): ReactElement {
  return (
    <section aria-labelledby="progress-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="progress-heading" className="text-lg font-semibold tracking-tight">
          Your progress
        </h2>
        <Link
          to="/progress"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          See all progress
          <ChevronRightIcon />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StreakCard streak={data.streak} />

        <Card className="p-5">
          <CardLabel>Today</CardLabel>
          <div className="mt-3">
            <GoalRing value={data.today.reviews} goal={data.today.goal} met={data.today.goalMet} />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <CardLabel>Last 7 days</CardLabel>
        <div className="mt-3">
          <Sparkline days={data.sparkline} label="Reviews in the last 7 days" />
        </div>
      </Card>
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

    // Sets exist, but nothing in them is studiable yet. Checked before the
    // never-started state so the dashboard never tells a user to create their
    // first set while that set is listed further down the same page.
    const [firstSet] = data.recentSets
    if (firstSet) return <NothingReady set={firstSet} />

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
      {/*
        The mascot beside the welcome, not above it: side by side the eye lands
        on the greeting and the figure together as one block, where stacking
        would push the hero — the page's only real CTA — a mascot's height down
        the screen (saulado-ux §4).

        Hidden below `sm`. At 320px it would take a third of the width from the
        greeting it is decorating, and it carries no information to lose.
      */}
      <div className="flex items-center gap-4">
        <MascotSprite className="hidden text-[1rem] sm:block" />
        <PageHeader
          title={user ? `Welcome, ${user.email.split('@')[0] ?? 'there'}` : 'Welcome'}
          description="Build a set, highlight what matters, and study it in context."
          className="mb-0 min-w-0 flex-1"
        />
      </div>

      <section aria-labelledby="study-heading" className="space-y-4">
        {/*
          No count badge beside this heading, though the pattern is used
          elsewhere: the hero directly below already shows the figure, and the
          same number twice in adjacent lines reads as two different numbers.
        */}
        <h2 id="study-heading" className="text-lg font-semibold tracking-tight">
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

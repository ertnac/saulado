import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDueCounts } from '@/features/study/queries'
import { useAuthStore } from '@/stores/auth'

/**
 * The dashboard.
 *
 * Still deliberately spare. It teaches what a cloze card *is* rather than
 * rendering charts full of zeroes — a zeroed chart reads as "this app is broken"
 * to a new user (saulado-ux §5).
 *
 * Now that scheduling exists, the due count is real and leads. What has not
 * changed is the empty state: a user with nothing scheduled still sees the
 * example card rather than a zeroed number, because "0 due" on day one reads as
 * "this app is broken" rather than "you are caught up".
 */

/** The primary call to action once there is anything scheduled. */
function DuePanel({ due }: { due: number }): ReactElement {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due today</p>
      <p className="mt-2 text-4xl font-semibold tabular-nums">{due}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {due === 1 ? 'One card is ready for review.' : `${String(due)} cards are ready for review.`}
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-4' })} to="/study">
        Study now
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
 * Shown when the due count could not be fetched.
 *
 * Not an error page. The dashboard is still useful without this number, and a
 * failed background query should not stand between the user and studying.
 */
function CountsUnavailable(): ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-border p-5">
      <p className="text-sm text-muted-foreground">
        Could not load today&apos;s review count. Studying still works.
      </p>
      <Link className={buttonClass({ className: 'mt-4' })} to="/study">
        Go to study
      </Link>
    </div>
  )
}

/** The never-studied state: teach what a card is instead of showing a zero. */
function GettingStarted(): ReactElement {
  return (
    <>
      <ExampleCard />

      <div className="rounded-lg border border-dashed border-border p-5">
        <p className="text-sm text-muted-foreground">
          A set holds cards on one subject. Each card is a paragraph of your own notes with the
          words worth recalling blanked out.
        </p>
        <Link className={buttonClass({ size: 'lg', className: 'mt-4' })} to="/sets">
          Create your first set
        </Link>
      </div>
    </>
  )
}

export function DashboardPage(): ReactElement {
  const user = useAuthStore((s) => s.user)
  const due = useDueCounts()

  const totalDue = due.data?.totalDue ?? 0
  const newCards = due.data?.counts.reduce((sum, entry) => sum + entry.newCards, 0) ?? 0
  // `counts` is empty both for a caught-up user and for one who has never
  // studied. `scheduledCards` is the only thing that tells those apart.
  const hasStudied = (due.data?.scheduledCards ?? 0) > 0

  function heading(): string {
    if (due.isPending || due.isError) return 'Study'
    if (totalDue > 0) return 'Ready to review'
    if (newCards > 0) return hasStudied ? 'Today' : 'Ready when you are'
    if (hasStudied) return 'Today'
    return 'Nothing to study yet'
  }

  function panel(): ReactElement {
    // Sized to the due panel rather than a generic bar: a skeleton that is the
    // wrong height shifts the page exactly once, on arrival (saulado-ux §5).
    if (due.isPending) return <Skeleton className="h-[188px]" />
    if (due.isError) return <CountsUnavailable />
    if (totalDue > 0) return <DuePanel due={totalDue} />
    if (newCards > 0) return <ReadyToLearn newCards={newCards} />
    if (hasStudied) return <CaughtUp />
    return <GettingStarted />
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

        {panel()}
      </section>
    </div>
  )
}

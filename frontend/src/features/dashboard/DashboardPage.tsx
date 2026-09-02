import { useState, useMemo, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { DashboardResponse, RecentSet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardFigure, CardLabel } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpenIcon,
  ChartIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  FlameIcon,
  PlusIcon,
  SparklesIcon,
  TrophyIcon,
  UploadIcon,
  ZapIcon,
} from '@/components/ui/icons'
import { OnboardingModal } from '@/features/onboarding/OnboardingModal'
import { GoalRing } from '@/components/charts/GoalRing'
import { Sparkline } from '@/components/charts/Sparkline'
import { SetDialog } from '@/features/cards/SetDialog'
import { FileImportDialog } from '@/features/cards/import/FileImportDialog'
import { UniversalImportDialog } from '@/features/cards/transfer/UniversalImportDialog'
import { SeedDecksDialog } from '@/features/cards/transfer/SeedDecksDialog'
import { useCreateSet } from '@/features/cards/queries'
import { useAuthStore } from '@/stores/auth'
import { useSettings } from '@/features/account/queries'
import { useDashboard } from './queries'
import { StreakCard } from './StreakCard'
import { cn } from '@/lib/utils'

/**
 * Returns a warm, time-aware greeting and icon based on client local time.
 */
function getGreeting(name: string): { greeting: string; icon: string } {
  const hour = new Date().getHours()
  const displayName = name.trim() || 'there'
  if (hour >= 5 && hour < 12) return { greeting: `Good morning, ${displayName}`, icon: '☀️' }
  if (hour >= 12 && hour < 17) return { greeting: `Good afternoon, ${displayName}`, icon: '🌤️' }
  if (hour >= 17 && hour < 22) return { greeting: `Good evening, ${displayName}`, icon: '🌆' }
  return { greeting: `Good night, ${displayName}`, icon: '🌙' }
}

function getFormattedDate(): string {
  try {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return 'Today'
  }
}

// ── Glance Metric Chip ───────────────────────────────────────────────────────

interface MetricChipProps {
  icon: ReactElement
  label: string
  value: string | number
  sublabel?: string
  accent?: boolean
  to?: string
}

function MetricChip({
  icon,
  label,
  value,
  sublabel,
  accent = false,
  to,
}: MetricChipProps): ReactElement {
  const content = (
    <Card
      className={cn(
        'p-4 transition-all',
        accent && 'border-accent/50 bg-accent/10',
        to && 'hover:shadow-lift cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-foreground">
          {icon}
        </span>
        {sublabel && (
          <span className="text-[11px] font-semibold text-muted-foreground">{sublabel}</span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </Card>
  )

  if (to) {
    return <Link to={to}>{content}</Link>
  }
  return content
}

// ── Quick Action Shortcuts ───────────────────────────────────────────────────

interface QuickActionsProps {
  onQuickLearn: () => void
  onImportOcr: () => void
  onSeedDecks: () => void
  onImportDeck: () => void
  onNewSet: () => void
}

function QuickActions({
  onQuickLearn,
  onImportOcr,
  onSeedDecks,
  onImportDeck,
  onNewSet,
}: QuickActionsProps): ReactElement {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Quick Actions
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2"
          onClick={onQuickLearn}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ZapIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Quick Learn</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2"
          onClick={onImportOcr}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent-strong">
            <FileTextIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Import & OCR</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2"
          onClick={onSeedDecks}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Starter Decks</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2"
          onClick={onImportDeck}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-foreground">
            <UploadIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Import Deck</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2 col-span-2 sm:col-span-1"
          onClick={onNewSet}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-foreground">
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">New Set</span>
        </Button>
      </div>
    </div>
  )
}

// ── Hero Study Panels ────────────────────────────────────────────────────────

function DuePanel({ due }: { due: number }): ReactElement {
  const estMins = Math.max(1, Math.ceil(due * 0.4))

  return (
    <Card tone="accent" className="p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-strong">
          <ClockIcon className="h-3.5 w-3.5" />~{estMins} min review
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-strong">
          Due Today
        </span>
      </div>

      <div className="my-3 flex items-baseline gap-2">
        <CardFigure>{due}</CardFigure>
        <span className="text-sm text-muted-foreground">
          {due === 1 ? 'card ready for review' : 'cards ready for review'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Review your highlighted blanks in context to reinforce retention and keep your streak
        active.
      </p>

      <Link className={buttonClass({ size: 'lg', className: 'mt-5' })} to="/study">
        Start studying
        <ChevronRightIcon />
      </Link>
    </Card>
  )
}

function ReadyToLearn({ newCards }: { newCards: number }): ReactElement {
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <BookOpenIcon className="h-3.5 w-3.5" />
          New Cards
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ready to Learn
        </span>
      </div>

      <div className="my-3 flex items-baseline gap-2">
        <CardFigure>{newCards}</CardFigure>
        <span className="text-sm text-muted-foreground">
          {newCards === 1 ? 'card waiting to be learned' : 'cards waiting to be learned'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Start your first learning session to place these cards into your spaced recall queue.
      </p>

      <Link className={buttonClass({ size: 'lg', className: 'mt-5' })} to="/study">
        Start learning
        <ChevronRightIcon />
      </Link>
    </Card>
  )
}

function CaughtUp(): ReactElement {
  return (
    <Card className="flex items-start gap-4 p-6 sm:p-8">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-xl text-success">
        <TrophyIcon className="h-5 w-5 text-success" />
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
    <Card className="p-6 sm:p-8">
      <CardLabel>What a card looks like</CardLabel>

      <p className="mt-3 text-base leading-relaxed">
        The{' '}
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

function GettingStarted({
  onCreate,
  onSeedDecks,
}: {
  onCreate: () => void
  onSeedDecks: () => void
}): ReactElement {
  return (
    <>
      <ExampleCard />

      <Card tone="dashed" className="p-6 sm:p-8 text-center space-y-3">
        <p className="font-semibold text-foreground">Get Started with Saulado</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Create a study set from your notes or jumpstart your library with pre-built starter decks.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <Button variant="accent" size="lg" onClick={onSeedDecks}>
            <SparklesIcon />
            Explore Starter Decks
          </Button>
          <Button size="lg" variant="outline" onClick={onCreate}>
            <PlusIcon />
            Create your first set
          </Button>
        </div>
      </Card>
    </>
  )
}

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

// ── Recent Sets Section ──────────────────────────────────────────────────────

function RecentSetRow({ set }: { set: RecentSet }): ReactElement {
  function detail(): string {
    if (set.dueCount > 0) {
      return set.dueCount === 1 ? '1 card due' : `${String(set.dueCount)} cards due`
    }
    return set.cardCount === 1 ? '1 card' : `${String(set.cardCount)} cards`
  }

  return (
    <li>
      <Link
        to={`/sets/${set.id}`}
        className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4 transition-all hover:border-primary/40 hover:shadow-sm"
      >
        <div className="min-w-0 space-y-0.5">
          <p className="min-w-0 truncate font-semibold text-foreground text-sm">{set.title}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{detail()}</p>
        </div>
        <div className="flex items-center gap-2">
          {set.dueCount > 0 && (
            <Badge tone="accent" className="text-xs">
              {set.dueCount} due
            </Badge>
          )}
          <ChevronRightIcon className="text-muted-foreground h-4 w-4" />
        </div>
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
          <Badge tone="muted">{sets.length}</Badge>
        </div>
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
    <section aria-labelledby="progress-heading" className="space-y-6">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricChip
          icon={<ClockIcon className="h-4 w-4" />}
          label="Due Cards"
          value={`${data.totalDue} due`}
          accent={data.totalDue > 0}
          sublabel={data.totalDue > 0 ? 'Ready' : 'None'}
          to="/study"
        />
        <MetricChip
          icon={<BookOpenIcon className="h-4 w-4" />}
          label="New Cards"
          value={`${data.newCards} new`}
          sublabel="Unstudied"
          to="/sets"
        />
        <MetricChip
          icon={<FlameIcon className="h-4 w-4 text-accent" />}
          label="Current Streak"
          value={`${data.streak.current}d`}
          sublabel={data.streak.current > 0 ? 'Active 🔥' : 'Inactive'}
          to="/progress"
        />
        <MetricChip
          icon={<ChartIcon className="h-4 w-4 text-primary" />}
          label="Daily Goal"
          value={`${data.today.reviews}/${data.today.goal}`}
          sublabel={data.today.goalMet ? 'Done ✓' : 'In progress'}
          to="/progress"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StreakCard streak={data.streak} />

        <Card className="p-6">
          <CardLabel>Today</CardLabel>
          <div className="mt-3">
            <GoalRing value={data.today.reviews} goal={data.today.goal} met={data.today.goalMet} />
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <CardLabel>Last 7 days</CardLabel>
        <div className="mt-3">
          <Sparkline days={data.sparkline} label="Reviews in the last 7 days" />
        </div>
      </Card>
    </section>
  )
}

// ── Main Dashboard Page ──────────────────────────────────────────────────────

export function DashboardPage(): ReactElement {
  const user = useAuthStore((s) => s.user)
  useSettings()

  const settings = useAuthStore((s) => s.settings)
  const dashboard = useDashboard()
  const createSet = useCreateSet()
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)
  const [importingOcr, setImportingOcr] = useState(false)
  const [seedDecksOpen, setSeedDecksOpen] = useState(false)
  const [universalImportOpen, setUniversalImportOpen] = useState(false)

  const nickname = settings?.nickname ?? ''
  const profileImage = settings?.profileImage ?? null
  const userGreeting = useMemo(
    () => getGreeting(nickname || user?.email.split('@')[0] || ''),
    [nickname, user?.email],
  )
  const formattedDate = useMemo(() => getFormattedDate(), [])

  const data = dashboard.data

  function heading(): string {
    if (dashboard.isPending || dashboard.isError || data === undefined) return 'Study'
    if (data.totalDue > 0) return 'Ready to review'
    if (data.newCards > 0) return data.hasStudied ? 'Today' : 'Ready when you are'
    if (data.hasStudied) return 'Today'
    return 'Nothing to study yet'
  }

  function hero(): ReactElement {
    if (dashboard.isPending) return <Skeleton className="h-[188px] rounded-2xl" />
    if (dashboard.isError || data === undefined) return <DashboardUnavailable />
    if (data.totalDue > 0) return <DuePanel due={data.totalDue} />
    if (data.newCards > 0) return <ReadyToLearn newCards={data.newCards} />
    if (data.hasStudied) return <CaughtUp />

    const [firstSet] = data.recentSets
    if (firstSet) return <NothingReady set={firstSet} />

    return (
      <GettingStarted
        onCreate={() => setCreating(true)}
        onSeedDecks={() => setSeedDecksOpen(true)}
      />
    )
  }

  return (
    <div className="space-y-8 pb-8">
      <OnboardingModal />

      {/* ── Student Portal Greeting & Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {profileImage ? (
            <img
              src={profileImage}
              alt=""
              className="h-16 w-16 rounded-2xl object-cover border-2 border-primary/20 shrink-0 shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl shrink-0 border border-primary/20">
              {userGreeting.icon}
            </div>
          )}

          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {userGreeting.greeting} {userGreeting.icon} · {formattedDate}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {nickname
                ? `Welcome, ${nickname}`
                : user
                  ? `Welcome, ${user.email.split('@')[0] ?? 'there'}`
                  : 'Welcome'}
            </h1>
            <p className="text-xs text-muted-foreground">
              Build a set, highlight what matters, and study it in context.
            </p>
          </div>
        </div>
      </div>

      {/* ── Quick Action Shortcuts ── */}
      <QuickActions
        onQuickLearn={() => {
          void navigate('/study')
        }}
        onImportOcr={() => setImportingOcr(true)}
        onSeedDecks={() => setSeedDecksOpen(true)}
        onImportDeck={() => setUniversalImportOpen(true)}
        onNewSet={() => setCreating(true)}
      />

      {/* ── Primary Study Hero Section ── */}
      <section aria-labelledby="study-heading" className="space-y-4">
        <h2 id="study-heading" className="text-lg font-semibold tracking-tight">
          {heading()}
        </h2>

        {hero()}
      </section>

      {/* ── Progress Section ── */}
      {data?.hasStudied === true && <TodaySection data={data} />}

      {/* ── Recent Sets Section ── */}
      {data !== undefined && data.recentSets.length > 0 && (
        <RecentSets sets={data.recentSets} onCreate={() => setCreating(true)} />
      )}

      {/* ── Dialogs & Modals ── */}
      {creating && (
        <SetDialog
          open
          onClose={() => setCreating(false)}
          pending={createSet.isPending}
          onSubmit={async (values) => {
            const created = await createSet.mutateAsync(values)
            void navigate(`/sets/${created.set.id}`)
          }}
        />
      )}

      <FileImportDialog
        open={importingOcr}
        onClose={() => setImportingOcr(false)}
        onImport={() => {
          setImportingOcr(false)
          void navigate('/sets')
        }}
      />

      <SeedDecksDialog open={seedDecksOpen} onClose={() => setSeedDecksOpen(false)} />

      <UniversalImportDialog
        open={universalImportOpen}
        onClose={() => setUniversalImportOpen(false)}
      />
    </div>
  )
}

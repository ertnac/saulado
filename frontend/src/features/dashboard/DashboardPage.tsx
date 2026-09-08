import { useState, useMemo, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { DashboardResponse, RecentSet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardFigure, CardLabel } from '@/components/ui/card'
import { CountUp } from '@/components/motion/CountUp'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpenIcon,
  ChartIcon,
  ChevronRightIcon,
  ClockIcon,
  FlameIcon,
  PlusIcon,
  SparklesIcon,
  TrophyIcon,
  UploadIcon,
  ZapIcon,
} from '@/components/ui/icons'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { OnboardingModal } from '@/features/onboarding/OnboardingModal'
import { GoalRing } from '@/components/charts/GoalRing'
import { Sparkline } from '@/components/charts/Sparkline'
import { SetDialog } from '@/features/cards/SetDialog'
import { FileImportDialog } from '@/features/cards/import/FileImportDialog'
import { UniversalImportDialog } from '@/features/cards/transfer/UniversalImportDialog'
import { SeedDecksDialog } from '@/features/cards/transfer/SeedDecksDialog'
import { QuickLearnDialog } from '@/features/study/QuickLearnDialog'
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
  if (hour >= 5 && hour < 12) return { greeting: `Good morning, ${displayName}`, icon: '👋' }
  if (hour >= 12 && hour < 17) return { greeting: `Good afternoon, ${displayName}`, icon: '👋' }
  if (hour >= 17 && hour < 22) return { greeting: `Good evening, ${displayName}`, icon: '👋' }
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

// ── Metric Chip ──────────────────────────────────────────────────────────────

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
        'p-4 transition-all duration-150 border border-border/70 bg-surface shadow-xs',
        accent && 'border-accent/40 bg-accent/10',
        to && 'hover:border-primary/40 hover:shadow-sm cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-muted text-foreground">
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

// ── Quick Actions ────────────────────────────────────────────────────────────

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
          className="h-auto flex-col items-center justify-center py-3.5 gap-2 rounded-2xl border-border/70"
          onClick={onQuickLearn}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ZapIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Quick Study</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2 rounded-2xl border-border/70"
          onClick={onNewSet}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-foreground">
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">New Set</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2 rounded-2xl border-border/70"
          onClick={onImportOcr}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <UploadIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Import Document</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2 rounded-2xl border-border/70"
          onClick={onImportDeck}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-foreground">
            <BookOpenIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Import Cards</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-center justify-center py-3.5 gap-2 rounded-2xl border-border/70"
          onClick={onSeedDecks}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand/30 text-sand-foreground">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">Starter Decks</span>
        </Button>
      </div>
    </div>
  )
}

// ── Hero State Panels ────────────────────────────────────────────────────────

function DuePanel({ due }: { due: number }): ReactElement {
  return (
    <Card className="p-6 sm:p-7 relative overflow-hidden border border-border/70 bg-surface shadow-xs">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-strong">
          <FlameIcon className="h-3.5 w-3.5 text-accent" />
          Review Priority
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ready to review
        </span>
      </div>

      <div className="my-3 flex items-baseline gap-2">
        <CardFigure>
          <CountUp value={due} />
        </CardFigure>
        <span className="text-sm text-muted-foreground">
          {due === 1 ? 'card ready for review' : 'cards ready for review'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
        Spaced review strengthens recall at the exact moment a memory starts to fade.
      </p>

      <Link className={buttonClass({ size: 'lg', className: 'mt-5 shadow-xs' })} to="/study">
        Start studying
        <ChevronRightIcon />
      </Link>
    </Card>
  )
}

function ReadyToLearn({ newCards }: { newCards: number }): ReactElement {
  return (
    <Card className="p-6 sm:p-7 border border-border/70 bg-surface shadow-xs">
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
        <CardFigure>
          <CountUp value={newCards} />
        </CardFigure>
        <span className="text-sm text-muted-foreground">
          {newCards === 1 ? 'card waiting to be learned' : 'cards waiting to be learned'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
        Start your first learning session to place these cards into your spaced recall queue.
      </p>

      <Link className={buttonClass({ size: 'lg', className: 'mt-5 shadow-xs' })} to="/study">
        Start learning
        <ChevronRightIcon />
      </Link>
    </Card>
  )
}

function CaughtUp(): ReactElement {
  return (
    <Card className="flex items-start gap-4 p-6 sm:p-7 border border-border/70 bg-surface shadow-xs">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-xl text-success">
        <TrophyIcon className="h-5 w-5 text-success" />
      </span>
      <div>
        <p className="font-semibold text-foreground text-base">Caught up for today</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every review is done. The next batch unlocks tomorrow.
        </p>
      </div>
    </Card>
  )
}

function ExampleCard(): ReactElement {
  return (
    <Card className="p-6 sm:p-7 border border-border/70 bg-surface shadow-xs">
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
    <div className="space-y-4">
      <ExampleCard />

      <Card tone="dashed" className="p-6 sm:p-8 text-center space-y-3">
        <p className="font-bold text-foreground text-base">Get Started with Saulado</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Create a study set from your notes or jumpstart your library with pre-built starter decks.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <Button variant="accent" size="md" onClick={onSeedDecks}>
            <SparklesIcon />
            Explore Starter Decks
          </Button>
          <Button size="md" variant="outline" onClick={onCreate}>
            <PlusIcon />
            Create your first set
          </Button>
        </div>
      </Card>
    </div>
  )
}

function NothingReady({ set }: { set: RecentSet }): ReactElement {
  return (
    <Card tone="dashed" className="p-6">
      <p className="text-sm text-muted-foreground">
        A card becomes a question when you highlight the words worth recalling. Until then it is
        just a paragraph, and there is nothing to ask you.
      </p>
      <Link
        className={buttonClass({ size: 'md', className: 'mt-4 max-w-full' })}
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
    <Card tone="dashed" className="p-6">
      <p className="text-sm text-muted-foreground">
        Could not load today&apos;s summary. Studying still works.
      </p>
      <Link className={buttonClass({ className: 'mt-4' })} to="/study">
        Go to study
      </Link>
    </Card>
  )
}

// ── In-Progress Learning Content (Image 2 Inspo) ─────────────────────────────

interface InProgressSetsProps {
  sets: RecentSet[]
}

function InProgressSets({ sets }: InProgressSetsProps): ReactElement {
  if (sets.length === 0) return <></>

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-foreground tracking-tight">
            In progress learning content
          </h2>
          <span
            className="text-xs text-muted-foreground cursor-help"
            title="Sets with active learning material"
          >
            ⓘ
          </span>
        </div>
        <Link to="/sets" className="text-xs font-semibold text-primary hover:underline">
          View all
        </Link>
      </div>

      <div className="space-y-2.5">
        {sets.slice(0, 3).map((set) => {
          const completionPercent = Math.min(
            100,
            Math.max(
              10,
              Math.round(((set.cardCount - set.dueCount) / Math.max(1, set.cardCount)) * 100),
            ),
          )

          return (
            <div
              key={set.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-border/70 bg-surface shadow-xs hover:border-primary/40 transition-all duration-150"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <BookOpenIcon className="h-5 w-5 text-primary" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Course
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {set.cardCount} {set.cardCount === 1 ? 'Material' : 'Materials'}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-foreground truncate max-w-xs sm:max-w-md">
                    {set.title}
                  </h3>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 shrink-0">
                <div className="flex items-center gap-2">
                  <ProgressRing
                    value={completionPercent}
                    size={32}
                    strokeWidth={3.5}
                    variant={completionPercent === 100 ? 'success' : 'primary'}
                    showText
                  />
                  <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                    Completion
                  </span>
                </div>

                <div className="text-xs font-semibold">
                  {set.dueCount > 0 ? (
                    <span className="text-accent-strong flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5 text-accent" />
                      {set.dueCount} due
                    </span>
                  ) : (
                    <span className="text-success font-medium">✓ Up to date</span>
                  )}
                </div>

                <Link
                  to={`/sets/${set.id}`}
                  className={buttonClass({
                    variant: set.dueCount > 0 ? 'accent' : 'outline',
                    size: 'sm',
                    className: 'rounded-xl text-xs px-3.5 h-8',
                  })}
                >
                  {set.dueCount > 0 ? 'Continue' : 'Start'}
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </section>
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
    <StaggerItem as="li">
      <Link
        to={`/sets/${set.id}`}
        className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface px-5 py-4 transition-all hover:border-primary/40 hover:shadow-xs"
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
    </StaggerItem>
  )
}

function RecentSets({ sets, onCreate }: { sets: RecentSet[]; onCreate: () => void }): ReactElement {
  return (
    <section aria-labelledby="recent-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 id="recent-heading" className="text-base font-bold text-foreground tracking-tight">
            Your sets
          </h2>
          <Badge tone="muted">{sets.length}</Badge>
        </div>
        <Button variant="soft" size="sm" onClick={onCreate}>
          <PlusIcon />
          New set
        </Button>
      </div>

      <Stagger as="ul" count={sets.length} className="space-y-2">
        {sets.map((set) => (
          <RecentSetRow key={set.id} set={set} />
        ))}
      </Stagger>

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

// ── Today Progress Section (Preserves Test Assertions) ──────────────────────

function TodaySection({ data }: { data: DashboardResponse }): ReactElement {
  return (
    <section aria-labelledby="progress-heading" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="progress-heading" className="text-base font-bold text-foreground tracking-tight">
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

        <Card className="p-6 border border-border/70 bg-surface shadow-xs">
          <CardLabel>Today</CardLabel>
          <div className="mt-3">
            <GoalRing value={data.today.reviews} goal={data.today.goal} met={data.today.goalMet} />
          </div>
        </Card>
      </div>

      <Card className="p-6 border border-border/70 bg-surface shadow-xs">
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
  const [quickLearnOpen, setQuickLearnOpen] = useState(false)

  const nickname = settings?.nickname ?? ''
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

      {/* ── Welcome Greeting (Image 2 Inspo) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {userGreeting.greeting} {userGreeting.icon} · {formattedDate}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-sans mt-1">
            {nickname
              ? `Welcome, ${nickname}`
              : user
                ? `Welcome, ${user.email.split('@')[0] ?? 'Learner'}`
                : 'Welcome, Learner'}{' '}
            👋
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Build a set, highlight what matters, and study it in context.
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          <Button
            variant="soft"
            size="sm"
            onClick={() => setQuickLearnOpen(true)}
            className="rounded-xl text-xs gap-1.5"
          >
            <ZapIcon className="h-4 w-4 text-primary" />
            Quick Study
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setCreating(true)}
            className="rounded-xl text-xs gap-1.5"
          >
            <PlusIcon className="h-4 w-4" />
            New Set
          </Button>
        </div>
      </div>

      {/* ── Feature / Recommendation Announcement (Image 2 Inspo) ── */}
      {data && data.totalDue > 0 && (
        <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border border-primary/25 bg-primary/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground shrink-0 shadow-xs">
              Daily Boost
            </span>
            <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
              {data.totalDue} {data.totalDue === 1 ? 'card needs' : 'cards need'} your attention
              today.
            </p>
          </div>
          <Link
            to="/study"
            className="text-xs font-bold text-primary hover:underline shrink-0 inline-flex items-center gap-1"
          >
            Review now →
          </Link>
        </div>
      )}

      {/* ── Primary Study Hero Section ── */}
      <section aria-labelledby="study-heading" className="space-y-4">
        <h2 id="study-heading" className="text-lg font-semibold tracking-tight">
          {heading()}
        </h2>

        {hero()}
      </section>

      {/* ── In Progress Learning Content (Image 2 Inspo) ── */}
      {data !== undefined && data.recentSets.length > 0 && (
        <InProgressSets sets={data.recentSets} />
      )}

      {/* ── Quick Action Shortcuts ── */}
      <QuickActions
        onQuickLearn={() => setQuickLearnOpen(true)}
        onImportOcr={() => setImportingOcr(true)}
        onSeedDecks={() => setSeedDecksOpen(true)}
        onImportDeck={() => setUniversalImportOpen(true)}
        onNewSet={() => setCreating(true)}
      />

      {/* ── Progress Section (When user has studied) ── */}
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

      <QuickLearnDialog open={quickLearnOpen} onClose={() => setQuickLearnOpen(false)} />
    </div>
  )
}

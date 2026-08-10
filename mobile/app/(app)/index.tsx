import type { ReactElement } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { DashboardResponse, RecentSet } from '@saulado/shared'
import { Button, TextLink } from '../../components/button'
import { Card, CardFigure, CardLabel } from '../../components/card'
import { ChevronRightIcon } from '../../components/icons'
import { GoalRing } from '../../components/goal-ring'
import { Sparkline } from '../../components/sparkline'
import { StreakCard } from '../../components/streak-card'
import { useDashboard } from '../../hooks/progress'
import { useAuthStore } from '../../stores/auth'
import { useTokenColor } from '../../stores/theme'

/**
 * The dashboard — a port of `frontend/src/features/dashboard/DashboardPage.tsx`.
 *
 * One request, not six: everything below comes from `GET /api/dashboard`, so the
 * screen arrives in one piece rather than shifting four times as separate queries
 * land.
 *
 * **One dominant call to action**, and four honest states beneath it rather than
 * one number that means four different things. The secondary section — streak,
 * goal, sparkline — is gated on `hasStudied` and hidden entirely otherwise. A
 * brand-new account showing a 0-day streak, an empty ring and a flat sparkline is
 * three pieces of evidence that the user has failed at something they have not
 * yet been offered (saulado-ux §5).
 *
 * The mascot sprite does not come across (plan §5): `background-position`
 * stepping has no RN equivalent, and the web page's own comment says it "carries
 * no information to lose".
 */

// ── The hero: exactly one of these, and it owns the only large CTA ───────────

function DuePanel({ due, onStart }: { due: number; onStart: () => void }): ReactElement {
  return (
    // The one accent-toned panel on the screen, and the one filled CTA. The tint
    // is what makes "you have work waiting" legible before a word is read.
    <Card tone="accent">
      <CardLabel>Due today</CardLabel>
      <CardFigure>{due}</CardFigure>
      <Text className="mt-1 text-sm text-muted-foreground">
        {due === 1 ? 'One card is ready for review.' : `${String(due)} cards are ready for review.`}
      </Text>
      <Button label="Start studying" size="lg" className="mt-5" onPress={onStart} />
    </Card>
  )
}

/**
 * Nothing due, but there are cards the user has never seen.
 *
 * Kept apart from "caught up" because it is also the state of a user who has
 * built a set and not yet studied it — for them "every review is done" would be a
 * claim about work they have not started.
 */
function ReadyToLearn({
  newCards,
  onStart,
}: {
  newCards: number
  onStart: () => void
}): ReactElement {
  return (
    <Card>
      <CardLabel>New cards</CardLabel>
      <CardFigure>{newCards}</CardFigure>
      <Text className="mt-1 text-sm text-muted-foreground">
        {newCards === 1
          ? 'One card is waiting to be learned.'
          : `${String(newCards)} cards are waiting to be learned.`}
      </Text>
      <Button label="Start learning" size="lg" className="mt-5" onPress={onStart} />
    </Card>
  )
}

/**
 * The day's reviews are finished and there is nothing new left.
 *
 * Distinct from the never-studied empty state on purpose: "caught up" is an
 * achievement and should not look like "nothing here".
 */
function CaughtUp(): ReactElement {
  return (
    <Card>
      <Text className="font-medium text-foreground">Caught up for today</Text>
      <Text className="mt-1 text-sm text-muted-foreground">
        Every review is done. The next batch unlocks tomorrow.
      </Text>
    </Card>
  )
}

/** The never-studied state: teach what a card is instead of showing a zero. */
function ExampleCard(): ReactElement {
  return (
    <Card>
      <CardLabel>What a card looks like</CardLabel>

      <Text className="mt-3 text-base leading-relaxed text-foreground">
        {'The '}
        {/*
          Fixed-width blank (saulado-ux §1.1): a fixed 64pt regardless of the
          answer, so the gap never hints at the length of the word. Even in a
          static illustration — this is the shape the real thing has to keep.
        */}
        <Text className="text-muted-foreground">________</Text>
        {' is the brain of the computer, carrying out the instructions of a program.'}
      </Text>

      <Text className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {'You write the paragraph, highlight '}
        <Text className="font-medium text-highlight-foreground">CPU</Text>
        {
          ', and Saulado turns it into a question that keeps the sentence around it. Recall in context, not from a bare flashcard.'
        }
      </Text>
    </Card>
  )
}

function GettingStarted({ onOpenSets }: { onOpenSets: () => void }): ReactElement {
  return (
    <View className="gap-4">
      <ExampleCard />

      <Card tone="dashed">
        <Text className="text-sm text-muted-foreground">
          A set holds cards on one subject. Each card is a paragraph of your own notes with the
          words worth recalling blanked out.
        </Text>
        <Button label="Create your first set" size="lg" className="mt-5" onPress={onOpenSets} />
      </Card>
    </View>
  )
}

/**
 * Sets exist, but nothing in them can be studied yet.
 *
 * Split out from `GettingStarted` because that one says "create your first set",
 * which is plainly false for a user whose own sets are listed directly below it.
 * Two routes land here — a set with no cards, and a card whose words have not
 * been highlighted — and both end in the same place, so this points into the set
 * rather than guessing which of the two the user is in.
 */
function NothingReady({ set, onOpen }: { set: RecentSet; onOpen: () => void }): ReactElement {
  return (
    <Card tone="dashed">
      <Text className="text-sm text-muted-foreground">
        A card becomes a question when you highlight the words worth recalling. Until then it is
        just a paragraph, and there is nothing to ask you.
      </Text>
      <Button label={`Open ${set.title}`} size="lg" className="mt-5" onPress={onOpen} />
    </Card>
  )
}

/**
 * The dashboard could not be fetched.
 *
 * Not an error screen. Studying does not depend on this request, and a failed
 * background query should not stand between the user and their reviews.
 */
function DashboardUnavailable({ onStudy }: { onStudy: () => void }): ReactElement {
  return (
    <Card tone="dashed">
      <Text className="text-sm text-muted-foreground">
        Could not load today's summary. Studying still works.
      </Text>
      <Button label="Go to study" variant="outline" className="mt-4" onPress={onStudy} />
    </Card>
  )
}

// ── Secondary: only ever rendered for a user who has studied ─────────────────

function TodaySection({
  data,
  onProgress,
}: {
  data: DashboardResponse
  onProgress: () => void
}): ReactElement {
  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-4">
        <Text className="text-lg font-semibold tracking-tight text-foreground">Your progress</Text>
        <TextLink className="text-sm font-medium text-muted-foreground" onPress={onProgress}>
          See all progress
        </TextLink>
      </View>

      <StreakCard streak={data.streak} />

      <Card>
        <CardLabel>Today</CardLabel>
        <View className="mt-3">
          <GoalRing value={data.today.reviews} goal={data.today.goal} met={data.today.goalMet} />
        </View>
      </Card>

      <Card>
        <CardLabel>Last 7 days</CardLabel>
        <View className="mt-3">
          <Sparkline days={data.sparkline} label="Reviews in the last 7 days" />
        </View>
      </Card>
    </View>
  )
}

function RecentSets({
  sets,
  onOpen,
  onAll,
}: {
  sets: RecentSet[]
  onOpen: (id: string) => void
  onAll: () => void
}): ReactElement {
  function detail(set: RecentSet): string {
    if (set.dueCount > 0) {
      return set.dueCount === 1 ? '1 card due' : `${String(set.dueCount)} cards due`
    }
    // Falls back to size rather than to "0 due" — the row is a way back into a
    // set, not a scorecard for it.
    return set.cardCount === 1 ? '1 card' : `${String(set.cardCount)} cards`
  }

  return (
    <View className="gap-3">
      <Text className="text-lg font-semibold tracking-tight text-foreground">Your sets</Text>

      <View className="gap-2">
        {sets.map((set) => (
          <SetRow key={set.id} set={set} detail={detail(set)} onPress={() => onOpen(set.id)} />
        ))}
      </View>

      <TextLink className="text-sm font-medium text-muted-foreground" onPress={onAll}>
        All sets
      </TextLink>
    </View>
  )
}

function SetRow({
  set,
  detail,
  onPress,
}: {
  set: RecentSet
  detail: string
  onPress: () => void
}): ReactElement {
  const mutedForeground = useTokenColor('--muted-foreground')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${set.title}. ${detail}`}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 active:opacity-70"
    >
      <Text numberOfLines={1} className="min-w-0 flex-1 font-medium text-foreground">
        {set.title}
      </Text>
      <Text className="text-sm tabular-nums text-muted-foreground">{detail}</Text>
      <ChevronRightIcon color={mutedForeground} size={18} />
    </Pressable>
  )
}

export default function DashboardScreen(): ReactElement {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const dashboard = useDashboard()
  const primary = useTokenColor('--primary')

  const data = dashboard.data

  function heading(): string {
    if (dashboard.isPending || dashboard.isError || data === undefined) return 'Study'
    if (data.totalDue > 0) return 'Ready to review'
    if (data.newCards > 0) return data.hasStudied ? 'Today' : 'Ready when you are'
    if (data.hasStudied) return 'Today'
    return 'Nothing to study yet'
  }

  function study(): void {
    router.push('/study')
  }

  function hero(): ReactElement {
    if (dashboard.isPending) {
      return (
        <Card tone="muted">
          <Text className="text-sm text-muted-foreground">Loading today's summary…</Text>
        </Card>
      )
    }
    if (dashboard.isError || data === undefined) return <DashboardUnavailable onStudy={study} />
    if (data.totalDue > 0) return <DuePanel due={data.totalDue} onStart={study} />
    if (data.newCards > 0) return <ReadyToLearn newCards={data.newCards} onStart={study} />
    if (data.hasStudied) return <CaughtUp />

    // Sets exist, but nothing in them is studiable yet. Checked before the
    // never-started state so the dashboard never tells a user to create their
    // first set while that set is listed further down the same screen.
    const [firstSet] = data.recentSets
    if (firstSet) {
      return (
        <NothingReady
          set={firstSet}
          onOpen={() => {
            router.push(`/sets/${firstSet.id}`)
          }}
        />
      )
    }

    return (
      <GettingStarted
        onOpenSets={() => {
          router.push('/sets')
        }}
      />
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-8 p-5 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={dashboard.isRefetching}
          onRefresh={() => {
            void dashboard.refetch()
          }}
          tintColor={primary}
        />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-semibold tracking-tight text-foreground">
          {user ? `Welcome, ${user.email.split('@')[0] ?? 'there'}` : 'Welcome'}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Build a set, highlight what matters, and study it in context.
        </Text>
      </View>

      <View className="gap-4">
        {/*
          No count beside this heading, though the pattern is used elsewhere: the
          hero directly below already shows the figure, and the same number twice
          in adjacent lines reads as two different numbers.
        */}
        <Text className="text-lg font-semibold tracking-tight text-foreground">{heading()}</Text>
        {hero()}
      </View>

      {/*
        Gated on `hasStudied`, not on the data being present. A streak of 0, a
        ring at 0/20 and a flat sparkline are all *accurate* for a new user and
        all read as failure.
      */}
      {data?.hasStudied === true && (
        <TodaySection
          data={data}
          onProgress={() => {
            router.push('/progress')
          }}
        />
      )}

      {data !== undefined && data.recentSets.length > 0 && (
        <RecentSets
          sets={data.recentSets}
          onOpen={(id) => {
            router.push(`/sets/${id}`)
          }}
          onAll={() => {
            router.push('/sets')
          }}
        />
      )}
    </ScrollView>
  )
}

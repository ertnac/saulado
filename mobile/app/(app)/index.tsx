import { useState, type ReactElement, useEffect, useRef, useSyncExternalStore } from 'react'
import {
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { onlineManager } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { DashboardResponse, RecentSet } from '@saulado/shared'
import welcomeAvatar from '../../assets/welcome-avatar.png'
import { SauladoIcon } from '../../components/saulado-logo'
import { Button, TextLink } from '../../components/button'
import { Card, CardFigure, CardLabel } from '../../components/card'
import {
  BookOpenIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CloudOffIcon,
  FlameIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from '../../components/icons'
import { GoalRing } from '../../components/goal-ring'
import { QuickLearnSheet } from '../../components/quick-learn-sheet'
import { Sparkline } from '../../components/sparkline'
import { StreakCard } from '../../components/streak-card'
import { usePrefetchCards } from '../../hooks/cards'
import { useDashboard } from '../../hooks/progress'
import { useSettings } from '../../hooks/settings'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../../stores/auth'
import { useOfflineSetsStore } from '../../stores/offline-sets'
import { useTokenColor } from '../../stores/theme'

/**
 * The mascot waving at the user. Runs a smooth oscillating rotation that mimics
 * a hand wave — three cycles then rests, so it greets without looping forever.
 */
function WavingAvatar(): ReactElement {
  const wave = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // 3 full wave cycles (left → right → left) then stop.
    Animated.sequence([
      Animated.loop(
        Animated.sequence([
          Animated.timing(wave, {
            toValue: 1,
            duration: 200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(wave, {
            toValue: -1,
            duration: 200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(wave, {
            toValue: 0,
            duration: 200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        { iterations: 3 },
      ),
    ]).start()
  }, [wave])

  const rotate = wave.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-18deg', '0deg', '18deg'],
  })

  return (
    <Animated.View
      style={{
        width: 80,
        height: 80,
        borderRadius: 40,
        overflow: 'hidden',
        transform: [{ rotate }],
      }}
    >
      <Image
        source={welcomeAvatar}
        style={{ width: 80, height: 80 }}
        resizeMode="cover"
        accessibilityLabel="Saulado mascot waving hello"
      />
    </Animated.View>
  )
}

/**
 * Returns a warm, time-aware greeting string and icon.
 */
function getGreeting(name: string): { text: string; emoji: string } {
  const hour = new Date().getHours()
  const display = name.trim() || 'there'
  if (hour >= 5 && hour < 12) return { text: `Good morning, ${display}`, emoji: '☀️' }
  if (hour >= 12 && hour < 17) return { text: `Good afternoon, ${display}`, emoji: '🌤️' }
  if (hour >= 17 && hour < 22) return { text: `Good evening, ${display}`, emoji: '🌆' }
  return { text: `Good night, ${display}`, emoji: '🌙' }
}

/**
 * Formats today's date for the portal header (e.g. "Tuesday, Aug 18").
 */
function getFormattedDate(): string {
  try {
    const now = new Date()
    return now.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return 'Today'
  }
}

// ── Glance Metric Chip (Student Portal Stat Badge) ───────────────────────────

function MetricChip({
  icon,
  label,
  value,
  onPress,
  accent = false,
}: {
  icon: ReactElement
  label: string
  value: string | number
  onPress?: () => void
  accent?: boolean
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${String(value)}`}
      className={`min-w-[76px] flex-1 rounded-2xl border p-3 active:opacity-75 ${
        accent ? 'border-accent/40 bg-accent/10' : 'border-border bg-surface'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="h-7 w-7 items-center justify-center rounded-lg bg-surface-muted">
          {icon}
        </View>
      </View>
      <Text className="mt-2 text-lg font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </Text>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">
        {label}
      </Text>
    </Pressable>
  )
}

// ── 1-Tap Quick Action Row ───────────────────────────────────────────────────

function QuickActionRow({
  onScan,
  onQuickLearn,
  onNewSet,
  onProgress,
}: {
  onScan: () => void
  onQuickLearn: () => void
  onNewSet: () => void
  onProgress: () => void
}): ReactElement {
  const primary = useTokenColor('--primary')
  const accent = useTokenColor('--accent')
  const foreground = useTokenColor('--foreground')
  const mutedForeground = useTokenColor('--muted-foreground')

  const actions = [
    { label: 'Scan Note', icon: <ScanIcon color={accent} size={20} />, onPress: onScan },
    { label: 'Quick Learn', icon: <ZapIcon color={primary} size={20} />, onPress: onQuickLearn },
    { label: 'New Set', icon: <PlusIcon color={foreground} size={20} />, onPress: onNewSet },
    {
      label: 'Analytics',
      icon: <ChartIcon color={mutedForeground} size={20} />,
      onPress: onProgress,
    },
  ]

  return (
    <View className="gap-2.5">
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Quick Shortcuts
      </Text>
      <View className="flex-row justify-between gap-2.5">
        {actions.map((action, i) => (
          <Pressable
            key={i}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className="flex-1 items-center gap-1.5 rounded-2xl border border-border bg-surface py-3.5 active:opacity-70"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface-muted">
              {action.icon}
            </View>
            <Text numberOfLines={1} className="text-xs font-medium text-foreground">
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

// ── The Hero Sections (Student Portal Course/Task Banner) ─────────────────────

function DuePanel({ due, onStart }: { due: number; onStart: () => void }): ReactElement {
  const mins = Math.max(1, Math.ceil(due * 0.4))
  const accentStrong = useTokenColor('--accent-strong')

  return (
    <Card tone="accent">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1">
          <ClockIcon color={accentStrong} size={14} />
          <Text className="text-xs font-semibold text-accent-strong">~{mins} min review</Text>
        </View>
        <Text className="text-xs font-semibold uppercase tracking-wider text-accent-strong">
          Due Today
        </Text>
      </View>

      <View className="my-3 flex-row items-baseline gap-2">
        <CardFigure>{due}</CardFigure>
        <Text className="text-sm text-muted-foreground">
          {due === 1 ? 'card ready for review' : 'cards ready for review'}
        </Text>
      </View>

      <Text className="text-sm leading-relaxed text-muted-foreground">
        Review your highlighted blanks in context to reinforce retention.
      </Text>

      <Button label="Start studying now" size="lg" className="mt-5" onPress={onStart} />
    </Card>
  )
}

function ReadyToLearn({
  newCards,
  onStart,
}: {
  newCards: number
  onStart: () => void
}): ReactElement {
  const primary = useTokenColor('--primary')

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1">
          <BookOpenIcon color={primary} size={14} />
          <Text className="text-xs font-semibold text-primary">New Cards</Text>
        </View>
        <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ready to Learn
        </Text>
      </View>

      <View className="my-3 flex-row items-baseline gap-2">
        <CardFigure>{newCards}</CardFigure>
        <Text className="text-sm text-muted-foreground">
          {newCards === 1 ? 'card waiting to be learned' : 'cards waiting to be learned'}
        </Text>
      </View>

      <Text className="text-sm leading-relaxed text-muted-foreground">
        Start your first learning session to place these cards into your spaced recall queue.
      </Text>

      <Button label="Start learning" size="lg" className="mt-5" onPress={onStart} />
    </Card>
  )
}

function CaughtUp({
  reviews,
  goal,
  onExplore,
}: {
  reviews: number
  goal: number
  onExplore: () => void
}): ReactElement {
  const successColor = useTokenColor('--success')

  return (
    <Card>
      <View className="flex-row items-center gap-3.5">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-success/15">
          <TrophyIcon color={successColor} size={24} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-foreground">Caught up for today! 🎉</Text>
          <Text className="text-xs text-muted-foreground mt-0.5">
            {reviews > 0
              ? `Completed ${String(reviews)} reviews today (Goal: ${String(goal)})`
              : 'Every review is completed. Next batch unlocks tomorrow.'}
          </Text>
        </View>
      </View>

      <View className="my-4 h-px bg-border" />

      <Text className="text-sm leading-relaxed text-muted-foreground">
        Your active recall queue is clear. Take a break or explore more sets below.
      </Text>

      <View className="mt-4 flex-row gap-3">
        <Button
          label="Browse all study sets"
          variant="outline"
          size="md"
          className="flex-1"
          onPress={onExplore}
        />
      </View>
    </Card>
  )
}

/** The never-studied state: teach what a card is instead of showing a zero. */
function ExampleCard(): ReactElement {
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <SparklesIcon color="#eab308" size={16} />
        <CardLabel>How Saulado active recall works</CardLabel>
      </View>

      <Text className="mt-3 text-base leading-relaxed text-foreground">
        {'The '}
        <Text className="text-muted-foreground">________</Text>
        {' is the brain of the computer, carrying out the instructions of a program.'}
      </Text>

      <Text className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {'You write your note, highlight '}
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

// ── Progress & Habit Section ─────────────────────────────────────────────────

function TodaySection({
  data,
  onProgress,
}: {
  data: DashboardResponse
  onProgress: () => void
}): ReactElement {
  const { reviews, goal, goalMet } = data.today
  const left = Math.max(0, goal - reviews)

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-4">
        <Text className="text-lg font-semibold tracking-tight text-foreground">
          Habit & Progress
        </Text>
        <TextLink className="text-sm font-medium text-muted-foreground" onPress={onProgress}>
          Full analytics →
        </TextLink>
      </View>

      <StreakCard streak={data.streak} />

      <Card>
        <View className="flex-row items-center gap-4">
          <GoalRing value={reviews} goal={goal} met={goalMet} />
          <View className="min-w-0 flex-1">
            <CardLabel>Daily Study Target</CardLabel>
            <Text className="mt-0.5 text-base font-medium text-foreground">
              {reviews === 1 ? '1 review completed' : `${String(reviews)} reviews completed`}
            </Text>
            <Text className="mt-0.5 text-sm text-muted-foreground">
              {goalMet
                ? 'Daily goal met! Keep the momentum.'
                : `${String(left)} more to reach your daily goal of ${String(goal)}.`}
            </Text>
          </View>
        </View>

        <View className="my-5 h-px bg-border" />

        <CardLabel>Last 7 days volume</CardLabel>
        <View className="mt-3">
          <Sparkline days={data.sparkline} label="Reviews in the last 7 days" />
        </View>
      </Card>
    </View>
  )
}

// ── Student Portal Set Card ──────────────────────────────────────────────────

function StudentSetCard({
  set,
  onOpen,
  onStudy,
}: {
  set: RecentSet
  onOpen: () => void
  onStudy: () => void
}): ReactElement {
  const primary = useTokenColor('--primary')
  const accentStrong = useTokenColor('--accent-strong')
  const muted = useTokenColor('--muted-foreground')

  const hasDue = set.dueCount > 0
  const isUnsynced = set.id.startsWith('temp-set-')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${set.title}. ${set.cardCount} cards. ${set.dueCount} due.`}
      onPress={onOpen}
      className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 active:opacity-75"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-surface-muted">
        <BookOpenIcon color={hasDue ? accentStrong : primary} size={20} />
      </View>

      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-base font-semibold text-foreground">
          {set.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-xs text-muted-foreground">
            {set.cardCount === 1 ? '1 card' : `${String(set.cardCount)} cards`}
          </Text>
          {isUnsynced && (
            <View className="flex-row items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5">
              <CloudOffIcon color="#d97706" size={10} />
              <Text className="text-[10px] font-bold uppercase text-amber-600">Unsynced</Text>
            </View>
          )}
        </View>
      </View>

      {hasDue ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Study ${String(set.dueCount)} cards due`}
          onPress={onStudy}
          className="flex-row items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 active:opacity-80"
        >
          <Text className="text-xs font-bold text-accent-foreground">{set.dueCount} due</Text>
          <ChevronRightIcon color="#ffffff" size={13} />
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1">
          <CheckIcon color={muted} size={13} />
          <Text className="text-xs font-medium text-muted-foreground">Ready</Text>
        </View>
      )}
    </Pressable>
  )
}

function RecentSets({
  sets,
  onOpen,
  onStudySet,
  onAll,
}: {
  sets: RecentSet[]
  onOpen: (id: string) => void
  onStudySet: (id: string) => void
  onAll: () => void
}): ReactElement {
  return (
    <View className="gap-3.5">
      <View className="flex-row items-center justify-between gap-4">
        <Text className="text-lg font-semibold tracking-tight text-foreground">
          Your Study Sets
        </Text>
        <TextLink className="text-sm font-medium text-muted-foreground" onPress={onAll}>
          View all sets →
        </TextLink>
      </View>

      <View className="gap-2.5">
        {sets.map((set) => (
          <StudentSetCard
            key={set.id}
            set={set}
            onOpen={() => onOpen(set.id)}
            onStudy={() => onStudySet(set.id)}
          />
        ))}
      </View>
    </View>
  )
}

// ── Main Dashboard Screen ────────────────────────────────────────────────────

export default function DashboardScreen(): ReactElement {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const dashboard = useDashboard()
  const primary = useTokenColor('--primary')
  const accent = useTokenColor('--accent')
  const mutedForeground = useTokenColor('--muted-foreground')

  const [quickLearnVisible, setQuickLearnVisible] = useState(false)

  // Fetch settings to update the auth store on mount/focus
  useSettings()

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )
  const isOffline = !isOnline
  const offlineStore = useOfflineSetsStore()

  const offlineSets = Object.values(offlineStore.sets)
    .filter(
      (s) =>
        s.status === 'available' &&
        Boolean(
          s.isDownloaded || s.syncStatus?.startsWith('pending_') || s.setId.startsWith('temp-set-'),
        ) &&
        s.metadata &&
        !s.metadata.archivedAt,
    )
    .map((s) => s.metadata!)

  const totalOfflineCards = offlineSets.reduce((sum, s) => sum + s.cardCount, 0)

  const effectiveRecentSets: RecentSet[] = isOffline
    ? offlineSets.map((s) => ({
        id: s.id,
        title: s.title,
        cardCount: s.cardCount,
        dueCount: s.cardCount,
        lastStudiedAt: s.updatedAt,
      }))
    : (dashboard.data?.recentSets ?? [])

  const prefetchCards = usePrefetchCards()

  const settings = useAuthStore((s) => s.settings)
  const nickname = settings?.nickname ?? ''
  const profileImage = settings?.profileImage ?? null

  const data = dashboard.data

  useEffect(() => {
    if (!isOffline && data?.recentSets) {
      data.recentSets.forEach((set: RecentSet) => prefetchCards(set.id))
    }
  }, [isOffline, data?.recentSets, prefetchCards])

  const displayName = nickname || (user?.email.split('@')[0] ?? 'there')
  const greeting = getGreeting(displayName)
  const formattedDate = getFormattedDate()

  function study(setId?: string): void {
    const firstOfflineSet = offlineSets[0]
    if (setId) {
      router.push({ pathname: '/study', params: { set: setId } })
    } else if (isOffline && firstOfflineSet) {
      router.push({ pathname: '/study', params: { set: firstOfflineSet.id } })
    } else {
      router.push('/study')
    }
  }

  function hero(): ReactElement {
    if (isOffline) {
      const featuredSet = offlineSets[0]
      if (!featuredSet) {
        return (
          <Card tone="dashed">
            <Text className="text-sm text-muted-foreground">
              No downloaded sets available offline. Connect to the internet and save sets to study
              offline.
            </Text>
            <Button
              label="Browse study sets"
              variant="outline"
              className="mt-4"
              onPress={() => router.push('/sets')}
            />
          </Card>
        )
      }

      return (
        <Card tone="accent">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1">
              <ZapIcon color={accent} size={14} />
              <Text className="text-xs font-semibold text-accent-strong">Offline Ready</Text>
            </View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-accent-strong">
              Downloaded Set
            </Text>
          </View>

          <View className="my-3">
            <Text numberOfLines={2} className="text-xl font-bold text-foreground">
              {featuredSet.title}
            </Text>
            <Text className="text-sm text-muted-foreground mt-0.5">
              {featuredSet.cardCount} {featuredSet.cardCount === 1 ? 'card' : 'cards'} ready for
              recall
            </Text>
          </View>

          <Text className="text-sm leading-relaxed text-muted-foreground">
            Study your downloaded cards offline. All progress will automatically sync to your
            database when reconnected.
          </Text>

          <Button
            label={`Study ${featuredSet.title}`}
            size="lg"
            className="mt-5"
            onPress={() => router.push(`/study?set=${featuredSet.id}`)}
          />
        </Card>
      )
    }

    if (dashboard.isPending) {
      return (
        <Card tone="muted">
          <Text className="text-sm text-muted-foreground">Loading today's summary…</Text>
        </Card>
      )
    }
    if (dashboard.isError || data === undefined)
      return <DashboardUnavailable onStudy={() => study()} />
    if (data.totalDue > 0) return <DuePanel due={data.totalDue} onStart={() => study()} />
    if (data.newCards > 0) return <ReadyToLearn newCards={data.newCards} onStart={() => study()} />
    if (data.hasStudied) {
      return (
        <CaughtUp
          reviews={data.today.reviews}
          goal={data.today.goal}
          onExplore={() => router.push('/sets')}
        />
      )
    }

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
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-7 p-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 96, 128) }}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching}
            onRefresh={() => {
              if (!isOffline) {
                void dashboard.refetch()
              }
            }}
            tintColor={primary}
          />
        }
      >
        {/* Student Portal Top Bar */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <SauladoIcon size={26} />
            <Text className="text-base font-bold tracking-tight text-foreground">Saulado</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {isOffline && (
              <View className="rounded-full bg-amber-500/10 px-2 py-1 border border-amber-500/20 flex-row items-center gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <Text className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Offline
                </Text>
              </View>
            )}
            <View className="rounded-full bg-surface-muted px-3 py-1 border border-border">
              <Text className="text-xs font-medium text-muted-foreground">{formattedDate}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search cards and sets"
              onPress={() => router.push('/sets')}
              className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted border border-border active:opacity-70"
            >
              <SearchIcon color={mutedForeground} size={15} />
            </Pressable>
          </View>
        </View>

        {/* Student Profile & Welcoming Banner */}
        <View className="flex-row items-center gap-4 rounded-3xl border border-border bg-surface p-4">
          {profileImage ? (
            <Image
              source={{ uri: profileImage }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
              className="border border-border"
            />
          ) : (
            <WavingAvatar />
          )}

          <View className="flex-1">
            <Text className="text-xl font-bold tracking-tight text-foreground">
              {greeting.text} {greeting.emoji}
            </Text>
            <Text className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {isOffline
                ? `${totalOfflineCards} downloaded ${totalOfflineCards === 1 ? 'card' : 'cards'} across ${offlineSets.length} ${offlineSets.length === 1 ? 'set' : 'sets'} available offline.`
                : data && data.totalDue > 0
                  ? `${String(data.totalDue)} ${data.totalDue === 1 ? 'card' : 'cards'} ready for review today.`
                  : data && data.newCards > 0
                    ? `${String(data.newCards)} new ${data.newCards === 1 ? 'card' : 'cards'} waiting to be learned.`
                    : data?.hasStudied
                      ? 'All scheduled reviews completed for today.'
                      : 'Recall in context, not from a bare flashcard.'}
            </Text>
          </View>
        </View>

        {/* Glance Metric Chips (Student Portal Badges) */}
        {!isOffline && data !== undefined ? (
          <View className="flex-row gap-2.5">
            <MetricChip
              icon={<FlameIcon color={accent} size={16} />}
              label="Streak"
              value={`${String(data.streak.current)}d`}
              onPress={() => router.push('/progress')}
              accent={data.streak.current > 0}
            />
            <MetricChip
              icon={<TargetIcon color={primary} size={16} />}
              label="Today Goal"
              value={`${String(data.today.reviews)}/${String(data.today.goal)}`}
              onPress={() => router.push('/progress')}
            />
            <MetricChip
              icon={<ZapIcon color={accent} size={16} />}
              label="Due Now"
              value={data.totalDue}
              onPress={() => study()}
              accent={data.totalDue > 0}
            />
            <MetricChip
              icon={<BookOpenIcon color={mutedForeground} size={16} />}
              label="Active Sets"
              value={data.recentSets.length}
              onPress={() => router.push('/sets')}
            />
          </View>
        ) : isOffline ? (
          <View className="flex-row gap-2.5">
            <MetricChip
              icon={<BookOpenIcon color={primary} size={16} />}
              label="Offline Sets"
              value={offlineSets.length}
              onPress={() => router.push('/sets')}
            />
            <MetricChip
              icon={<ZapIcon color={accent} size={16} />}
              label="Ready Cards"
              value={totalOfflineCards}
              onPress={() => {
                const firstOfflineSet = offlineSets[0]
                if (firstOfflineSet) {
                  router.push(`/study?set=${firstOfflineSet.id}`)
                } else {
                  router.push('/sets')
                }
              }}
              accent={totalOfflineCards > 0}
            />
          </View>
        ) : null}

        {/* 1-Tap Quick Action Row */}
        <QuickActionRow
          onScan={() => router.push('/scan')}
          onQuickLearn={() => setQuickLearnVisible(true)}
          onNewSet={() => router.push('/sets')}
          onProgress={() => router.push('/progress')}
        />

        {/* Featured Study Hero (Course/Task Portal Style) */}
        <View className="gap-2.5">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Featured Session
          </Text>
          {hero()}
        </View>

        {/* Habit & Progress (Gated on hasStudied) */}
        {!isOffline && data?.hasStudied === true && (
          <TodaySection
            data={data}
            onProgress={() => {
              router.push('/progress')
            }}
          />
        )}

        {/* Your Sets (Rich Task Cards) */}
        {effectiveRecentSets.length > 0 && (
          <RecentSets
            sets={effectiveRecentSets}
            onOpen={(id) => {
              router.push(`/sets/${id}`)
            }}
            onStudySet={(id) => {
              study(id)
            }}
            onAll={() => {
              router.push('/sets')
            }}
          />
        )}
      </ScrollView>

      {/* Quick Learn Bottom Sheet Modal */}
      <QuickLearnSheet visible={quickLearnVisible} onClose={() => setQuickLearnVisible(false)} />
    </>
  )
}

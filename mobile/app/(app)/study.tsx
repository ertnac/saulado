import { useEffect, useRef, useState, type ReactElement } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SessionSummary,
  SubmitAnswerRequest,
  StartableMode,
  StartSessionRequest,
  AnsweringType,
} from '@saulado/shared'

import { Button } from '../../components/button'
import { FeedbackPanel } from '../../components/feedback-panel'
import { SessionSummaryView } from '../../components/session-summary'
import { StudyCard } from '../../components/study-card'
import { FlashcardCard } from '../../components/flashcard-card'
import { ModePicker } from '../../components/mode-picker'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  ShuffleIcon,
} from '../../components/icons'
import { StudyModeSheet } from '../../components/study-mode-sheet'
import { forgetSession, readResumableSession, rememberSession } from '../../lib/study-resume'
import { completeSession, getSession, startSession, submitAnswer } from '../../services/study'
import { ApiError } from '../../services/api'
import { useStudySession } from '../../hooks/useStudySession'
import { useDueCounts } from '../../hooks/study'
import { useSet } from '../../hooks/cards'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, useTokenColor } from '../../stores/theme'
import { getOfflineSet } from '../../lib/offline/sets'
import { generateOfflineSession } from '../../lib/offline/study-generation'
import { useAuthStore } from '../../stores/auth'
import { useOfflineSetsStore } from '../../stores/offline-sets'
import { updateOfflineState } from '../../lib/offline/state'
import type { OfflineMutation } from '../../lib/offline/types'

/**
 * The study screen (plan §4.2–4.4), ported from `StudySessionPage.tsx`.
 *
 * Holds the orchestration the pieces around it deliberately do not: starting or
 * resuming a session, submitting, and completing. `useStudySession` owns queue
 * position, `StudyCard` owns rendering, and this owns the network.
 *
 * The set to study comes from `?set=` rather than a path segment. Studying
 * everything is the same screen with no set, and `/study` + `/sets/:id/study`
 * would be two routes rendering one component with one difference.
 *
 * Three deliberate divergences from the web version:
 *
 * - The react-query hooks are inline rather than in a `queries.ts`. Cross-feature
 *   invalidation is most of what that file exists for on the web, and the caches
 *   it invalidates — sets, cards, dashboard, progress — do not exist on mobile
 *   until Phase 5. It gets a file when it gets a second caller.
 * - The buttons live in a footer outside the ScrollView, inside a
 *   `KeyboardAvoidingView`. saulado-ux §7: the submit button must never sit behind
 *   the keyboard, and on a phone a button below a scrolling paragraph does exactly
 *   that.
 * - No keyboard shortcut effect. `returnKeyType` walks the blanks and checks the
 *   card, which is the platform's own equivalent and needs no listener.
 */

/** Reviews start when the card is presented, so time-on-card excludes the fetch. */
function useCardTimer(cardId: string | undefined): () => number | null {
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    startedAt.current = cardId === undefined ? null : Date.now()
  }, [cardId])

  return () => {
    if (startedAt.current === null) return null
    // Clamped to the server's own bound. A card left open over lunch would
    // otherwise be rejected by the schema and fail an otherwise valid answer.
    return Math.min(Date.now() - startedAt.current, 3_600_000)
  }
}

/** The dashed notice card, which this screen needs in two flavours. */
function Notice({
  title,
  body,
  tick = false,
  children,
}: {
  title: string
  body: string
  tick?: boolean
  children: ReactElement | ReactElement[]
}): ReactElement {
  const accent = useTokenColor('--accent-strong')

  return (
    <View className="items-center rounded-xl border border-dashed border-border bg-surface p-8">
      {/*
        A finished day gets the accent tick, not a warning icon: two states share
        this component but only one of them is a problem.
      */}
      {tick && <CheckIcon color={accent} size={24} />}
      <Text className="mt-2 text-center font-medium text-foreground">{title}</Text>
      <Text className="mt-1 text-center text-sm text-muted-foreground">{body}</Text>
      <View className="mt-5 w-full gap-3">{children}</View>
    </View>
  )
}

export default function StudyScreen(): ReactElement {
  const { set, mode: initialMode } = useLocalSearchParams<{ set?: string; mode?: StartableMode }>()
  const studySetId = set ?? null
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const session = useStudySession()
  const start = useMutation({
    mutationFn: (body: StartSessionRequest) => startSession(body),
  })
  const submit = useMutation({
    // No retry. A retried submission is a second review booked for a card the
    // user answered once — the idempotency key makes a *deliberate* retry safe,
    // and this is where that decision belongs.
    retry: false,
    mutationFn: (input: { sessionId: string; body: SubmitAnswerRequest }) =>
      submitAnswer(input.sessionId, input.body),
  })
  const complete = useMutation({ mutationFn: (id: string) => completeSession(id) })

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isOfflineSession, setIsOfflineSession] = useState(false)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  /**
   * `undefined` means the pointer has not been read yet.
   *
   * The web reads `localStorage` synchronously in a `useState` initializer.
   * AsyncStorage has no synchronous read, so this needs a third value distinct
   * from "nothing saved" — treating a pending read as "nothing saved" starts a
   * second session while the first is still resumable.
   */
  const [resumeId, setResumeId] = useState<string | null | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<Error | null>(null)

  const [mode, setMode] = useState<StartableMode>(initialMode ?? 'spaced')
  const [answeringType, setAnsweringType] = useState<AnsweringType>('identification')
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false)
  const { isDark } = useTheme()
  const [picking, setPicking] = useState(false)

  const dueCounts = useDueCounts()
  const setDetails = useSet(studySetId ?? undefined)
  const offlineStore = useOfflineSetsStore()

  const isOffline = !onlineManager.isOnline()
  const offlineSetEntry = studySetId ? offlineStore.sets[studySetId] : undefined
  const totalCardsCount =
    setDetails.data?.set.cardCount ?? offlineSetEntry?.metadata?.cardCount ?? 0
  const setEntry = studySetId
    ? dueCounts.data?.counts.find((c) => c.studySetId === studySetId)
    : undefined
  const dueCardsCount = isOffline
    ? (offlineSetEntry?.metadata?.cardCount ?? 0)
    : studySetId
      ? (setEntry?.due ?? 0) + (setEntry?.newCards ?? 0)
      : (dueCounts.data?.totalDue ?? 0) + (dueCounts.data?.totalNew ?? 0)

  useEffect(() => {
    // If no cards are due and user hasn't explicitly specified a mode query param,
    // pre-select sequential drill so they are ready to study immediately.
    if (dueCardsCount === 0 && !initialMode && mode === 'spaced') {
      setMode('sequential')
    }
  }, [dueCardsCount, initialMode])

  const isResumeOffline =
    !onlineManager.isOnline() ||
    (typeof resumeId === 'string' && resumeId.startsWith('offline-session-'))

  const resumed = useQuery({
    queryKey: ['study', 'session', resumeId],
    queryFn: () => getSession(resumeId ?? ''),
    enabled: sessionId === null && typeof resumeId === 'string' && !isResumeOffline,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const elapsed = useCardTimer(session.card?.cardId)
  const started = useRef(false)
  const foreground = useTokenColor('--foreground')

  const currentSetRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    // Whenever studySetId changes (e.g. user goes back and picks another set to study)
    if (currentSetRef.current !== undefined && currentSetRef.current !== studySetId) {
      console.log(
        '[study.tsx] studySetId changed from',
        currentSetRef.current,
        'to',
        studySetId,
        '- resetting study state',
      )
      setSummary(null)
      setSessionId(null)
      setIsOfflineSession(false)
      setStartError(null)
      setStarting(false)
      started.current = false
      setPicking(studySetId !== null && !initialMode)
      void readResumableSession().then(setResumeId)
    }
    currentSetRef.current = studySetId
  }, [studySetId, initialMode])

  useEffect(() => {
    void readResumableSession().then(setResumeId)
  }, [])

  useEffect(() => {
    if (resumeId !== undefined) {
      const isOfflineOrLocal =
        !onlineManager.isOnline() ||
        (typeof resumeId === 'string' && resumeId.startsWith('offline-session-'))
      setPicking(
        (!onlineManager.isOnline() && studySetId === null) ||
          (studySetId !== null && !initialMode && (resumeId === null || isOfflineOrLocal)),
      )
    }
  }, [resumeId, studySetId, initialMode])

  /**
   * Start a session and adopt it.
   */
  const begin = async (chosenMode?: StartableMode, retakeOf?: string): Promise<void> => {
    console.log('[study.tsx] begin() called', { chosenMode, mode, studySetId, retakeOf })
    started.current = true
    setStartError(null)
    setStarting(true)

    const activeMode = chosenMode ?? mode
    const isOnline = onlineManager.isOnline()
    const offlineSet = studySetId ? await getOfflineSet(studySetId) : null

    // 1. DETERMINISTIC OFFLINE ROUTING
    if (!isOnline) {
      if (offlineSet) {
        console.log('[study.tsx] Device is offline; immediately starting local offline session')
        const localSession = generateOfflineSession(studySetId!, activeMode, offlineSet.cards)
        setIsOfflineSession(true)
        setSessionId(localSession.id)
        setMode(activeMode)
        void rememberSession(localSession.id)
        session.load(localSession)
        setPicking(false)
        setStarting(false)
        return
      } else {
        console.warn('[study.tsx] Device is offline and set is not downloaded')
        setStartError(new Error('This set has not been downloaded for offline study.'))
        setPicking(false)
        setStarting(false)
        return
      }
    }

    // 2. ONLINE FLOW
    const body: StartSessionRequest = retakeOf
      ? { retakeOf }
      : {
          studySetId: studySetId ?? undefined,
          ...(activeMode !== 'spaced' ? { mode: activeMode } : {}),
        }

    console.log('[study.tsx] Sending startSession request with body:', body)

    try {
      const data = await start.mutateAsync(body)
      console.log('[study.tsx] startSession succeeded! Session:', data.session)
      setIsOfflineSession(false)
      setSessionId(data.session.id)
      setMode(activeMode)
      void rememberSession(data.session.id)
      session.load(data.session)
      setPicking(false)
    } catch (error: unknown) {
      console.error('[study.tsx] startSession failed with error:', error)

      // Phase 5.5: Offline Set Fallback if online start unexpectedly failed
      const isNetworkError =
        error instanceof Error &&
        (error.message.includes('Network') || error.message.includes('Failed to fetch'))

      if (isNetworkError && studySetId) {
        try {
          const fallbackSet = await getOfflineSet(studySetId)
          if (fallbackSet) {
            console.log(
              '[study.tsx] Online start failed with network error; falling back to downloaded set',
            )
            const localSession = generateOfflineSession(studySetId, activeMode, fallbackSet.cards)
            setIsOfflineSession(true)
            setSessionId(localSession.id)
            void rememberSession(localSession.id)
            session.load(localSession)
            setPicking(false)
            setStarting(false)
            return
          }
        } catch (e) {
          console.error('[study.tsx] Failed to start offline fallback session', e)
        }
      }

      setStartError(error instanceof Error ? error : new Error('Could not start this session.'))
      setPicking(false)
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    /**
     * Auto-start session if:
     * - Resume pointer is already read and is null (no resume) or offline/local
     * - We have not started yet
     * - Either we are studying all sets (studySetId === null) or mode query param is explicitly provided
     */
    if (started.current || resumeId === undefined) return

    const isOfflineOrLocal =
      !onlineManager.isOnline() ||
      (typeof resumeId === 'string' && resumeId.startsWith('offline-session-'))

    if (resumeId === null || isOfflineOrLocal) {
      if (studySetId === null) {
        if (!onlineManager.isOnline()) {
          setPicking(true)
        } else {
          void begin('spaced')
        }
      } else if (initialMode) {
        void begin(initialMode)
      }
    }
  })

  useEffect(() => {
    // The resumed session arrived. Adopting it is the same operation as adopting
    // a freshly started one — the queue already excludes answered cards.
    if (!resumed.data || resumed.isFetching || sessionId !== null) return

    const resumedSession = resumed.data.session

    // If the resumed session belongs to a different set than the one the user
    // just tapped "Study" on, discard the stale pointer and start fresh rather
    // than hijacking a new study intent with leftover cards from another set.
    if (studySetId !== null && resumedSession.studySetId !== studySetId) {
      void forgetSession()
      if (!initialMode) {
        setPicking(true)
      } else {
        void begin(initialMode)
      }
      return
    }

    setIsOfflineSession(false)
    setSessionId(resumedSession.id)
    session.load(resumedSession)
  }, [resumed.data, sessionId, session])

  useEffect(() => {
    /**
     * A stale pointer is not an error worth showing. The session may have been
     * completed on the web or aged out server-side; either way the right response
     * is to drop it and start fresh.
     */
    if (!resumed.isError || started.current) return
    void forgetSession()

    // Resuming failed, if we have a set and no mode we show the picker, otherwise start spaced rep
    if (studySetId && !initialMode) {
      setPicking(true)
    } else {
      void begin(initialMode ?? 'spaced')
    }
  })

  const queryClient = useQueryClient()

  const finish = (id: string): void => {
    const isOffline =
      isOfflineSession || id.startsWith('offline-session-') || !onlineManager.isOnline()

    if (isOffline) {
      void forgetSession()
      const answered = session.progress.answered
      const correct = session.progress.correct
      const userSettings = useAuthStore.getState().settings
      const dailyGoal = userSettings?.dailyGoal ?? 10
      const reviewsToday = correct
      const goalMet = reviewsToday >= dailyGoal

      const offlineSummary: SessionSummary = {
        sessionId: id,
        startedAt: new Date(Date.now() - 60000).toISOString(),
        completedAt: new Date().toISOString(),
        cardsSeen: answered,
        correctCards: correct,
        accuracy: answered === 0 ? 0 : correct / answered,
        durationMs: 60000,
        toRevisit: [],
        mode,
        unanswered: [],
        reviewsToday,
        dailyGoal,
        goalMet,
      }

      setSummary(offlineSummary)
      session.reset()
      return
    }

    complete.mutate(id, {
      onSuccess: (data) => {
        void forgetSession()
        setSummary(data.summary)
        session.reset()
        void queryClient.invalidateQueries({ queryKey: ['study'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        void queryClient.invalidateQueries({ queryKey: ['progress'] })
        void queryClient.invalidateQueries({ queryKey: ['sets'] })
      },
    })
  }

  const send = (revealed: boolean, overrideValues?: Record<number, string>): void => {
    if (!session.card || !sessionId || session.answer) return

    const submittedValues = overrideValues ?? session.values
    const activeCardId = session.card.cardId

    // 1. INSTANT LOCAL EVALUATION (0ms UX)
    const localVerdict = session.evaluateLocally(submittedValues, revealed)
    if (localVerdict) {
      session.accept(localVerdict, activeCardId)
      if (answeringType === 'flashcard') {
        const spent = session.advance()
        if (spent && sessionId) finish(sessionId)
      }
    }

    // 2. BACKGROUND SERVER SYNC OR OFFLINE QUEUE
    if (
      !isOfflineSession &&
      !sessionId.startsWith('offline-session-') &&
      onlineManager.isOnline()
    ) {
      const body: SubmitAnswerRequest = {
        cardId: activeCardId,
        blanks: Object.entries(submittedValues).map(([ordinal, submitted]) => ({
          ordinal: Number(ordinal),
          submitted,
        })),
        durationMs: elapsed(),
        idempotencyKey: session.idempotencyKey,
        ...(revealed ? { revealed: true } : {}),
      }

      submit.mutate(
        { sessionId, body },
        {
          onSuccess: (data) => {
            // If user hasn't advanced yet, update with true SM-2 schedules from server
            session.accept(data, activeCardId)
          },
        },
      )
    } else {
      // 3. QUEUE OFFLINE ANSWER MUTATION FOR LATER SYNC
      const mutation: OfflineMutation = {
        userId: useAuthStore.getState().user?.id,
        sessionId,
        cardId: activeCardId,
        submittedValues,
        revealed,
        durationMs: elapsed(),
        idempotencyKey: session.idempotencyKey,
        queuedAt: new Date().toISOString(),
        status: 'pending',
      }
      void updateOfflineState((prev) => ({
        ...prev,
        queue: [...prev.queue, mutation],
      }))
    }
  }

  const next = (): void => {
    const spent = session.advance()
    if (spent && sessionId) finish(sessionId)
  }

  /**
   * A session that was adopted but has no cards left in it.
   *
   * Indistinguishable from "still loading" by `session.card` alone — both are
   * null. `sessionId` is the discriminator: it is set only once a session has
   * actually loaded, so this means the queue arrived and was empty rather than
   * that it has not arrived yet.
   *
   * Reachable whenever a session is answered to the end without the completion
   * call landing: the last card answered and then the app killed, or the same
   * session finished on the web. Without a branch of its own it falls through to
   * the skeleton and waits for a card that is never coming.
   */
  const sessionSpent =
    sessionId !== null && !session.card && summary === null && !complete.isPending

  useEffect(() => {
    // Drop the pointer so a relaunch starts a fresh session rather than resuming
    // one with nothing left in it.
    if (sessionSpent) void forgetSession()
  }, [sessionSpent])

  const shell = (children: ReactElement, showBack = true): ReactElement => (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background">
      {showBack && (
        <View className="flex-row items-center px-4 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace('/')
              }
            }}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface border border-border/80 shadow-xs active:bg-surface-muted"
          >
            <ChevronLeftIcon color={foreground} size={20} />
          </Pressable>
        </View>
      )}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 p-6 pt-3 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  )

  if (picking) {
    if (!onlineManager.isOnline() && studySetId === null) {
      const offlineSets = Object.values(offlineStore.sets)
        .filter((s) => s.status === 'available' && s.metadata)
        .map((s) => s.metadata!)

      if (offlineSets.length === 0) {
        return shell(
          <Notice
            title="No downloaded sets"
            body="No downloaded sets are available for offline study. Connect to the internet and save a set for offline use."
          >
            <Button label="Back to dashboard" size="lg" onPress={() => router.replace('/')} />
          </Notice>,
        )
      }

      return shell(
        <View className="gap-4">
          <Text className="text-xl font-bold text-foreground">Offline Sets</Text>
          <Text className="text-sm text-muted-foreground">
            Select a downloaded set to study offline.
          </Text>
          <View className="gap-2 mt-2">
            {offlineSets.map((set) => (
              <Pressable
                key={set.id}
                onPress={() => router.push(`/study?set=${set.id}`)}
                className="gap-1 rounded-2xl border border-border bg-surface p-4 active:opacity-75"
              >
                <Text className="text-lg font-bold text-foreground">{set.title}</Text>
                <Text className="text-sm font-medium text-muted-foreground">
                  {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>,
      )
    }

    return shell(
      <ModePicker
        selected={mode}
        onChange={setMode}
        onStart={() => {
          console.log('[study.tsx] ModePicker onStart triggered with mode:', mode)
          void begin(mode)
        }}
        pending={starting}
        dueCount={dueCardsCount}
        totalCount={totalCardsCount}
        isOffline={isOffline}
      />,
    )
  }

  if (summary) {
    return shell(
      <SessionSummaryView
        summary={summary}
        studySetId={studySetId}
        pending={starting}
        onClose={() => {
          setSummary(null)
          setSessionId(null)
          started.current = false
        }}
        onStudyAgain={() => {
          setSummary(null)
          setSessionId(null)
          started.current = false
          if (studySetId) {
            setPicking(true)
          } else {
            void begin(mode)
          }
        }}
        onRetake={() => {
          const finishedSessionId = summary.sessionId
          setSummary(null)
          setSessionId(null)
          started.current = false
          void begin(undefined, finishedSessionId)
        }}
      />,
    )
  }

  /*
    A failed start is usually not a failure at all — "nothing is due right now"
    arrives as a 400, and it is the single most likely response for a user who has
    already studied today. Showing it as an error screen with a retry button would
    misdescribe a finished day as a broken one.
  */
  if (startError) {
    const nothingDue =
      startError instanceof ApiError &&
      startError.code === 'VALIDATION_ERROR' &&
      startError.message.toLowerCase().includes('nothing is due')

    return shell(
      <Notice
        tick={nothingDue}
        title={nothingDue ? 'Nothing due right now' : 'Could not start'}
        body={
          nothingDue
            ? 'Every card in this set has been reviewed for today. New reviews unlock tomorrow.'
            : startError.message
        }
      >
        <>
          <Button
            label="Try again"
            size="lg"
            disabled={starting}
            onPress={() => {
              void begin()
            }}
          />
          {studySetId !== null && !initialMode && (
            <Button
              label="Pick a different study mode"
              size="lg"
              variant="outline"
              onPress={() => {
                setStartError(null)
                setPicking(true)
              }}
            />
          )}
          <Button
            label="Back to the dashboard"
            size="lg"
            variant="ghost"
            onPress={() => {
              router.replace('/')
            }}
          />
        </>
      </Notice>,
    )
  }

  if (sessionSpent) {
    return shell(
      <Notice
        title="This session is finished"
        body="Every card in it has been answered. Start another to keep going."
      >
        <>
          <Button
            label={starting ? 'Starting…' : 'Study again'}
            size="lg"
            loading={starting}
            onPress={() => {
              setSessionId(null)
              void begin()
            }}
          />
          <Button
            label="Back to the dashboard"
            size="lg"
            variant="outline"
            onPress={() => {
              router.replace('/')
            }}
          />
        </>
      </Notice>,
    )
  }

  if (!session.card) {
    return shell(
      <View accessibilityLabel="Loading your session" className="gap-5">
        <View className="h-2.5 w-full rounded-full bg-surface-muted" />
        <View className="gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <View className="h-5 w-24 rounded-full bg-surface-muted" />
          <View className="h-6 w-full rounded-lg bg-surface-muted" />
          <View className="h-6 w-full rounded-lg bg-surface-muted" />
          <View className="h-6 w-3/4 rounded-lg bg-surface-muted" />
        </View>
      </View>,
    )
  }

  const answered = session.progress.answered
  const total = Math.max(session.progress.total, 1)
  const percentComplete = Math.min(100, Math.round((answered / total) * 100))
  const deckTitle =
    setDetails.data?.set.title || offlineSetEntry?.metadata?.title || 'Cardiovascular Drugs'

  const currentModeTitle =
    answeringType === 'identification'
      ? 'Identification'
      : answeringType === 'multiple-choice'
        ? 'Multiple Choice'
        : 'Smart Flashcards'

  const currentModePillLabel =
    answeringType === 'identification'
      ? 'Identification'
      : answeringType === 'multiple-choice'
        ? 'Multiple Choice'
        : 'Flashcards'

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
    >
      {/* ── 1. Top Header (Matching Images 1, 2, 3) ── */}
      <View
        style={{
          paddingTop: Math.max(14, insets.top),
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: isDark ? '#050D0A' : '#FAFBF9',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 3, flex: 1, marginRight: 12 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '800',
                letterSpacing: -0.4,
                color: isDark ? '#FFFFFF' : '#052E24',
              }}
            >
              {currentModeTitle}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: '500',
                color: isDark ? '#889591' : '#4C5854',
              }}
            >
              {deckTitle} · Study
            </Text>

            {/* In-Session Mode Dropdown Pill */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Current mode is ${currentModePillLabel}. Tap to change study mode.`}
              onPress={() => setIsModeSheetOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                marginTop: 6,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 1,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: isDark ? '#A6C2B5' : '#052E24',
                }}
              >
                {currentModePillLabel}
              </Text>
              <ChevronDownIcon color={isDark ? '#A6C2B5' : '#052E24'} size={14} />
            </Pressable>
          </View>

          {/* Close Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close study session"
            disabled={complete.isPending}
            onPress={() => {
              if (sessionId) finish(sessionId)
              else if (router.canGoBack()) router.back()
              else router.replace('/')
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E8F3EE',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon color={isDark ? '#FFFFFF' : '#052E24'} size={16} />
          </Pressable>
        </View>

        {/* ── 2. Progress Indicator Section ── */}
        <View style={{ marginTop: 16, gap: 6 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#889591' : '#4C5854' }}
            >
              Card {Math.min(answered + 1, total)} of {total}
            </Text>
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#A6C2B5' : '#317054' }}
            >
              {percentComplete}% Complete
            </Text>
          </View>

          {/* Rounded Green Progress Bar */}
          <View
            style={{
              height: 5,
              width: '100%',
              borderRadius: 3,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(3, percentComplete))}%`,
                borderRadius: 3,
                backgroundColor: '#317054',
              }}
            />
          </View>
        </View>
      </View>

      {/* ── 3. Active Quiz Question Viewport ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {answeringType === 'flashcard' ? (
          <FlashcardCard
            card={session.card}
            disabled={session.answer !== null}
            onSubmit={(overrideValues) => {
              send(false, overrideValues)
            }}
          />
        ) : (
          <StudyCard
            card={session.card}
            values={session.values}
            results={session.answer?.results ?? null}
            disabled={session.answer !== null}
            answeringType={answeringType}
            onChange={session.setValue}
            onSubmit={(overrideValues) => {
              send(false, overrideValues)
            }}
          />
        )}

        {session.answer && answeringType !== 'flashcard' && (
          <View style={{ marginTop: 14 }}>
            <FeedbackPanel answer={session.answer} />
          </View>
        )}
      </ScrollView>

      {/* ── 4. Bottom Action Footer (Matching Images 1 & 2) ── */}
      {answeringType !== 'flashcard' && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(16, insets.bottom),
            backgroundColor: isDark ? '#050D0A' : '#FAFBF9',
            borderTopWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            gap: 12,
          }}
        >
          {/* Utility Row (Shuffle Remaining & Don't know? Reveal) */}
          {!session.answer && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {session.remaining > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Shuffle remaining questions"
                  onPress={() => session.reshuffleRemaining()}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <ShuffleIcon color={isDark ? '#889591' : '#4C5854'} size={14} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isDark ? '#889591' : '#4C5854',
                    }}
                  >
                    Shuffle Remaining
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reveal answer"
                onPress={() => send(true)}
              >
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#A6C2B5' : '#4C5854' }}
                >
                  Don't know? <Text style={{ textDecorationLine: 'underline' }}>Reveal</Text>
                </Text>
              </Pressable>
            </View>
          )}

          {/* Primary Action Button (Deep Forest #052E24) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={session.answer ? 'Next Question' : 'Check Answer'}
            onPress={() => {
              if (session.answer) {
                next()
              } else {
                send(false)
              }
            }}
            style={{
              height: 52,
              borderRadius: 18,
              backgroundColor: '#052E24',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
              {session.answer
                ? session.isLast
                  ? 'Finish Session 🎉'
                  : 'Next Question'
                : 'Check Answer'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── 5. In-Session Study Mode Bottom Sheet (Matching Image 4) ── */}
      <StudyModeSheet
        visible={isModeSheetOpen}
        currentMode={answeringType}
        onSelectMode={(newMode) => {
          setAnsweringType(newMode)
        }}
        onClose={() => setIsModeSheetOpen(false)}
      />
    </KeyboardAvoidingView>
  )
}

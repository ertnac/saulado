import { useEffect, useRef, useState, type ReactElement } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
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
  AlertIcon,
  CheckIcon,
  CloseIcon,
  PencilIcon,
  ListIcon,
  CardsIcon,
} from '../../components/icons'
import { forgetSession, readResumableSession, rememberSession } from '../../lib/study-resume'
import { completeSession, getSession, startSession, submitAnswer } from '../../services/study'
import { ApiError } from '../../services/api'
import { useStudySession } from '../../hooks/useStudySession'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTokenColor } from '../../stores/theme'

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
  const [isChecking, setIsChecking] = useState(false)
  const [startError, setStartError] = useState<Error | null>(null)

  const [mode, setMode] = useState<StartableMode>(initialMode ?? 'spaced')
  const [answeringType, setAnsweringType] = useState<AnsweringType>('identification')
  const [picking, setPicking] = useState(false)

  const resumed = useQuery({
    queryKey: ['study', 'session', resumeId],
    queryFn: () => getSession(resumeId ?? ''),
    enabled: sessionId === null && typeof resumeId === 'string',
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const elapsed = useCardTimer(session.card?.cardId)
  const started = useRef(false)
  const danger = useTokenColor('--danger')
  const primaryColor = useTokenColor('--primary')
  const mutedColor = useTokenColor('--muted-foreground')

  useEffect(() => {
    void readResumableSession().then(setResumeId)
  }, [])

  useEffect(() => {
    if (resumeId !== undefined) {
      setPicking(studySetId !== null && !initialMode && resumeId === null)
    }
  }, [resumeId, studySetId, initialMode])

  /**
   * Start a session and adopt it.
   */
  const begin = (chosenMode?: StartableMode, retakeOf?: string): void => {
    started.current = true
    setStartError(null)
    setStarting(true)

    const activeMode = chosenMode ?? mode
    const body: StartSessionRequest = retakeOf
      ? { retakeOf }
      : {
          studySetId: studySetId ?? undefined,
          ...(activeMode !== 'spaced' ? { mode: activeMode } : {}),
        }

    start
      .mutateAsync(body)
      .then((data) => {
        setSessionId(data.session.id)
        void rememberSession(data.session.id)
        session.load(data.session)
        setPicking(false)
      })
      .catch((error: unknown) => {
        setStartError(error instanceof Error ? error : new Error('Could not start this session.'))
      })
      .finally(() => {
        setStarting(false)
      })
  }

  useEffect(() => {
    /**
     * Auto-start session if:
     * - Resume pointer is already read and is null (no resume)
     * - We have not started yet
     * - Either we are studying all sets (studySetId === null) or mode query param is explicitly provided
     */
    if (started.current || resumeId === undefined || resumeId !== null) return

    if (studySetId === null) {
      begin('spaced')
    } else if (initialMode) {
      begin(initialMode)
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
        begin(initialMode)
      }
      return
    }

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
      begin(initialMode ?? 'spaced')
    }
  })

  const finish = (id: string): void => {
    complete.mutate(id, {
      onSuccess: (data) => {
        void forgetSession()
        setSummary(data.summary)
        session.reset()
      },
    })
  }

  const send = (revealed: boolean, overrideValues?: Record<number, string>): void => {
    if (!session.card || !sessionId || session.answer) return

    setIsChecking(true)

    const submittedValues = overrideValues ?? session.values

    const body: SubmitAnswerRequest = {
      cardId: session.card.cardId,
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
          session.accept(data)
          if (answeringType === 'flashcard') {
            const spent = session.advance()
            if (spent && sessionId) finish(sessionId)
          }
        },
        onSettled: () => setIsChecking(false),
      },
    )
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

  const shell = (children: ReactElement): ReactElement => (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-6 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )

  if (picking) {
    return shell(
      <ModePicker
        selected={mode}
        onChange={setMode}
        onStart={() => {
          begin(mode)
        }}
        pending={starting}
      />,
    )
  }

  if (summary) {
    return shell(
      <SessionSummaryView
        summary={summary}
        studySetId={studySetId}
        pending={starting}
        onStudyAgain={() => {
          setSummary(null)
          setSessionId(null)
          if (studySetId) {
            setPicking(true)
          } else {
            begin(mode)
          }
        }}
        onRetake={() => {
          setSummary(null)
          setSessionId(null)
          begin(undefined, summary.sessionId)
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
    const nothingDue = startError instanceof ApiError && startError.code === 'VALIDATION_ERROR'

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
          {!nothingDue && (
            <Button label="Try again" size="lg" disabled={starting} onPress={begin} />
          )}
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
              begin()
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

  const getModeInfo = (type: AnsweringType) => {
    switch (type) {
      case 'identification':
        return { label: 'Type In', icon: <PencilIcon color={primaryColor} size={13} /> }
      case 'multiple-choice':
        return { label: 'Quiz', icon: <ListIcon color={primaryColor} size={13} /> }
      case 'flashcard':
        return { label: 'Cards', icon: <CardsIcon color={primaryColor} size={13} /> }
    }
  }

  const modeInfo = getModeInfo(answeringType)

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
    >
      {/* ── Sleek Top Navigation Bar ── */}
      <View
        style={{ paddingTop: Math.max(12, insets.top) }}
        className="flex-row items-center justify-between border-b border-border/50 bg-surface px-4 pb-3 shadow-xs"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End session"
          className="h-9 w-9 rounded-full bg-surface border border-border/80 items-center justify-center shadow-xs active:bg-surface-muted"
          disabled={complete.isPending}
          onPress={() => {
            if (sessionId) finish(sessionId)
          }}
        >
          <CloseIcon color={mutedColor} size={15} />
        </Pressable>

        <View className="flex-1 mx-3 gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Progress
            </Text>
            <Text className="text-xs font-bold text-foreground">
              {answered}{' '}
              <Text className="font-normal text-muted-foreground">/ {session.progress.total}</Text>
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: total, now: answered }}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-muted border border-border/40"
          >
            <View
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.min(100, Math.max(5, (answered / total) * 100))}%` }}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch answering mode"
          disabled={session.answer !== null || isChecking || submit.isPending}
          className={`rounded-full bg-surface border border-border/80 px-3 py-1.5 flex-row items-center gap-1.5 shadow-xs active:bg-surface-muted ${
            session.answer !== null ? 'opacity-40' : 'opacity-100'
          }`}
          onPress={() => {
            if (session.answer !== null) return
            setAnsweringType((prev) =>
              prev === 'identification'
                ? 'multiple-choice'
                : prev === 'multiple-choice'
                  ? 'flashcard'
                  : 'identification',
            )
          }}
        >
          {modeInfo.icon}
          <Text className="text-xs font-semibold text-foreground">{modeInfo.label}</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {answeringType === 'flashcard' ? (
          <FlashcardCard
            card={session.card}
            disabled={session.answer !== null || isChecking || submit.isPending}
            onSubmit={(overrideValues) => {
              send(false, overrideValues)
            }}
          />
        ) : (
          <StudyCard
            card={session.card}
            values={session.values}
            results={session.answer?.results ?? null}
            disabled={session.answer !== null || isChecking || submit.isPending}
            answeringType={answeringType}
            onChange={session.setValue}
            onSubmit={(overrideValues) => {
              send(false, overrideValues)
            }}
          />
        )}

        {session.answer && answeringType !== 'flashcard' && (
          <FeedbackPanel answer={session.answer} />
        )}

        {submit.isError && (
          <View
            accessibilityLiveRegion="polite"
            className="rounded-2xl border border-danger/30 bg-danger/10 p-4 shadow-sm"
          >
            <View className="flex-row items-start gap-2">
              <AlertIcon color={danger} size={18} />
              <Text className="flex-1 text-sm text-foreground">{submit.error.message}</Text>
            </View>
            <Button
              className="mt-3 self-start"
              label="Try again"
              variant="outline"
              size="md"
              onPress={() => {
                send(false)
              }}
            />
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Sticky Action Footer ── */}
      {answeringType !== 'flashcard' && (
        <View
          style={{ paddingBottom: Math.max(16, insets.bottom) }}
          className="flex-row gap-3 border-t border-border/80 bg-surface/95 px-5 pt-3.5 shadow-md"
        >
          {session.answer ? (
            <Button
              className="flex-1"
              size="lg"
              label={session.isLast ? 'Finish session 🎉' : 'Next card →'}
              loading={complete.isPending}
              onPress={next}
            />
          ) : (
            <>
              <Button
                size="lg"
                variant="outline"
                label="Reveal"
                disabled={isChecking || submit.isPending}
                onPress={() => {
                  send(true)
                }}
              />
              <Button
                className="flex-1"
                size="lg"
                label={isChecking || submit.isPending ? 'Checking…' : 'Check answer'}
                loading={isChecking || submit.isPending}
                onPress={() => {
                  send(false)
                }}
              />
            </>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

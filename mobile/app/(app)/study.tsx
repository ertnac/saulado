import { useEffect, useRef, useState, type ReactElement } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { SessionSummary, SubmitAnswerRequest } from '@saulado/shared'

import { Button } from '../../components/button'
import { FeedbackPanel } from '../../components/feedback-panel'
import { SessionSummaryView } from '../../components/session-summary'
import { StudyCard } from '../../components/study-card'
import { AlertIcon, CheckIcon } from '../../components/icons'
import { forgetSession, readResumableSession, rememberSession } from '../../lib/study-resume'
import { completeSession, getSession, startSession, submitAnswer } from '../../services/study'
import { ApiError } from '../../services/api'
import { useStudySession } from '../../hooks/useStudySession'
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
  const { set } = useLocalSearchParams<{ set?: string }>()
  const studySetId = set ?? null
  const router = useRouter()

  const session = useStudySession()
  const start = useMutation({ mutationFn: (id: string | undefined) => startSession(id) })
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
  const [startError, setStartError] = useState<Error | null>(null)

  const resumed = useQuery({
    queryKey: ['study', 'session', resumeId],
    queryFn: () => getSession(resumeId ?? ''),
    enabled: sessionId === null && typeof resumeId === 'string',
    staleTime: Infinity,
    retry: false,
  })

  const elapsed = useCardTimer(session.card?.cardId)
  const started = useRef(false)
  const danger = useTokenColor('--danger')

  useEffect(() => {
    void readResumableSession().then(setResumeId)
  }, [])

  /**
   * Start a session and adopt it.
   *
   * `mutateAsync` with local state, rather than `mutate` with callbacks and
   * `start.isPending` / `start.error`: query-core's `MutationObserver` detaches
   * from the in-flight mutation when its subscription is torn down, so a screen
   * that remounts while a start is in flight would hold an observer wired to
   * nothing — a session created on the server, and a screen waiting for a card
   * that cannot come. The promise `mutateAsync` returns belongs to the mutation
   * rather than the observer, so it settles regardless.
   */
  const begin = (): void => {
    started.current = true
    setStartError(null)
    setStarting(true)

    start
      .mutateAsync(studySetId ?? undefined)
      .then((data) => {
        setSessionId(data.session.id)
        void rememberSession(data.session.id)
        session.load(data.session)
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
     * One start per mount, guarded by a ref rather than a dependency list. This
     * has a side effect on the server — an unguarded version would create two
     * sessions and abandon the first. Skipped while the pointer is still being
     * read (`undefined`) and when there is one to resume.
     */
    if (started.current || resumeId !== null) return

    begin()
  })

  useEffect(() => {
    // The resumed session arrived. Adopting it is the same operation as adopting
    // a freshly started one — the queue already excludes answered cards.
    if (!resumed.data || sessionId !== null) return

    setSessionId(resumed.data.session.id)
    session.load(resumed.data.session)
  }, [resumed.data, sessionId, session])

  useEffect(() => {
    /**
     * A stale pointer is not an error worth showing. The session may have been
     * completed on the web or aged out server-side; either way the right response
     * is to drop it and start fresh.
     */
    if (!resumed.isError || started.current) return
    void forgetSession()

    begin()
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

  const send = (revealed: boolean): void => {
    if (!session.card || !sessionId || session.answer) return

    const body: SubmitAnswerRequest = {
      cardId: session.card.cardId,
      blanks: Object.entries(session.values).map(([ordinal, submitted]) => ({
        ordinal: Number(ordinal),
        submitted,
      })),
      durationMs: elapsed(),
      idempotencyKey: session.idempotencyKey,
      ...(revealed ? { revealed: true } : {}),
    }

    submit.mutate({ sessionId, body }, { onSuccess: session.accept })
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
      contentContainerClassName="gap-5 p-5 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )

  if (summary) {
    return shell(
      <SessionSummaryView
        summary={summary}
        studySetId={studySetId}
        pending={starting}
        onStudyAgain={() => {
          setSummary(null)
          setSessionId(null)
          begin()
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
    // Skeleton bars matching the final layout, not a spinner: a spinner swapped
    // for a card is a second layout shift on a screen whose whole premise is that
    // the text does not move.
    return shell(
      <View accessibilityLabel="Loading your session" className="gap-5">
        <View className="h-2 w-full rounded-full bg-surface-muted" />
        <View className="gap-3 rounded-xl border border-border bg-surface p-5">
          <View className="h-5 w-full rounded bg-surface-muted" />
          <View className="h-5 w-full rounded bg-surface-muted" />
          <View className="h-5 w-3/4 rounded bg-surface-muted" />
        </View>
      </View>,
    )
  }

  const answered = session.progress.answered
  const total = Math.max(session.progress.total, 1)

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      // Android resizes the window for the keyboard on its own; iOS does not, and
      // padding there is what keeps the footer above it.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-5 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            {/*
              Progress is the server's count, so a re-queued card is honest about
              having been answered rather than silently rewinding the bar.
            */}
            <Text className="text-sm text-muted-foreground">
              {answered} of {session.progress.total} answered
            </Text>
            <Button
              label="End session"
              variant="ghost"
              disabled={complete.isPending}
              onPress={() => {
                if (sessionId) finish(sessionId)
              }}
            />
          </View>
          {/*
            No `<progress>` element here, so the bar carries its own value for a
            screen reader rather than relying on a role that does not exist.
          */}
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Session progress"
            accessibilityValue={{ min: 0, max: total, now: answered }}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            <View className="h-full bg-primary" style={{ width: `${(answered / total) * 100}%` }} />
          </View>
        </View>

        <StudyCard
          card={session.card}
          values={session.values}
          results={session.answer?.results ?? null}
          disabled={session.answer !== null || submit.isPending}
          onChange={session.setValue}
          onSubmit={() => {
            send(false)
          }}
        />

        {session.answer && <FeedbackPanel answer={session.answer} />}

        {/*
          A failed submission keeps the card and its typed answers on screen. The
          idempotency key is unchanged, so the retry either books the review once
          or replays the verdict of an attempt that actually landed.
        */}
        {submit.isError && (
          <View
            accessibilityLiveRegion="polite"
            className="rounded-lg border border-danger/30 bg-danger/10 p-4"
          >
            <View className="flex-row items-start gap-1.5">
              <AlertIcon color={danger} size={16} />
              <Text className="flex-1 text-sm text-foreground">{submit.error.message}</Text>
            </View>
            <Button
              className="mt-3 self-start"
              label="Try again"
              variant="outline"
              onPress={() => {
                send(false)
              }}
            />
          </View>
        )}
      </ScrollView>

      {/*
        Outside the ScrollView on purpose. saulado-ux §7 — the action the user
        needs next must never be behind the keyboard or below the fold, and on a
        long paragraph it would be both.
      */}
      <View className="flex-row gap-3 border-t border-border bg-surface px-5 py-3">
        {session.answer ? (
          <Button
            className="flex-1"
            size="lg"
            label={session.isLast ? 'Finish session' : 'Next card'}
            loading={complete.isPending}
            onPress={next}
          />
        ) : (
          <>
            <Button
              className="flex-1"
              size="lg"
              label={submit.isPending ? 'Checking…' : 'Check answer'}
              loading={submit.isPending}
              onPress={() => {
                send(false)
              }}
            />
            {/*
              Reveal is not a shortcut to a good grade — it books `again`
              server-side regardless of what is typed — so it is labelled as the
              escape hatch it is rather than hidden away.
            */}
            <Button
              size="lg"
              variant="outline"
              label="Reveal"
              disabled={submit.isPending}
              onPress={() => {
                send(true)
              }}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

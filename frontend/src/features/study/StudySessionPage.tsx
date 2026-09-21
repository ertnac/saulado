import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type {
  SessionSummary,
  SubmitAnswerRequest,
  StartableMode,
  AnsweringType,
} from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SauladoLoader } from '@/components/ui/saulado-logo'
import { AlertIcon, CheckIcon } from '@/components/ui/icons'
import { ApiError } from '@/services/api'
import { FeedbackPanel } from './FeedbackPanel'
import { SessionSummaryView } from './SessionSummaryView'
import { StudyCardView } from './StudyCardView'
import { StudyModeSwitcher } from './StudyModeSwitcher'
import { ModePicker } from './ModePicker'
import { forgetSession, readResumableSession, rememberSession } from './resume'
import { useCompleteSession, useSession, useStartSession, useSubmitAnswer } from './queries'
import { useStudySession } from './useStudySession'

/**
 * The study screen (plan §4.2–4.4).
 *
 * Holds the orchestration the pieces around it deliberately do not: starting or
 * resuming a session, submitting, and completing. `useStudySession` owns queue
 * position, `StudyCardView` owns rendering, and this owns the network.
 *
 * The set to study comes from `?set=` rather than a path segment. Studying
 * everything is the same screen with no set, and `/study` + `/sets/:id/study`
 * would be two routes rendering one component with one difference.
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

export function StudySessionPage(): ReactElement {
  const [params, setParams] = useSearchParams()
  const studySetId = params.get('set')
  const modeParam = params.get('mode') as StartableMode | null
  const typeParam = params.get('type') as AnsweringType | null

  const session = useStudySession()
  const start = useStartSession()
  const submit = useSubmitAnswer()
  const complete = useCompleteSession()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [resumeId] = useState(readResumableSession)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<Error | null>(null)

  const [mode, setMode] = useState<StartableMode>(modeParam ?? 'spaced')
  const [answeringType, setAnsweringType] = useState<AnsweringType>(typeParam ?? 'identification')
  const [picking, setPicking] = useState(
    studySetId !== null && modeParam === null && resumeId === null,
  )

  const handleAnsweringTypeChange = (nextType: AnsweringType): void => {
    if (session.answer !== null) return
    setAnsweringType(nextType)
    setParams(
      (prev) => {
        prev.set('type', nextType)
        return prev
      },
      { replace: true },
    )
  }

  const resumed = useSession(sessionId === null ? resumeId : null)
  const elapsed = useCardTimer(session.card?.cardId)
  const started = useRef(false)

  /**
   * Start a session and adopt it.
   */
  const begin = (chosenMode?: StartableMode, retakeOf?: string): void => {
    started.current = true
    setStartError(null)
    setStarting(true)

    const activeMode = chosenMode ?? mode
    const body = retakeOf
      ? { retakeOf }
      : {
          studySetId: studySetId ?? undefined,
          ...(activeMode !== 'spaced' ? { mode: activeMode } : {}),
        }

    start
      .mutateAsync(body)
      .then((data) => {
        setSessionId(data.session.id)
        rememberSession(data.session.id)
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
     * - Resuming a session (resumeId is handled by the other effect)
     * - Studying all sets (no studySetId) -> starts spaced rep
     * - A mode query parameter is explicitly provided
     */
    if (started.current || resumeId !== null) return

    if (studySetId === null) {
      begin('spaced')
    } else if (modeParam !== null) {
      begin(modeParam)
    }
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
     * completed in another tab or aged out server-side; either way the right
     * response is to drop it and start fresh, which the mount effect then does.
     */
    if (!resumed.isError || started.current) return
    forgetSession()

    // Resuming failed, if we have a set and no mode we show the picker, otherwise start spaced rep
    if (studySetId && modeParam === null) {
      setPicking(true)
    } else {
      begin(modeParam ?? 'spaced')
    }
  })

  const finish = (id: string): void => {
    complete.mutate(id, {
      onSuccess: (data) => {
        forgetSession()
        setSummary(data.summary)
        session.reset()
      },
    })
  }

  const send = (revealed: boolean, overrideValues?: Record<number, string>): void => {
    if (!session.card || !sessionId || session.answer) return

    const valuesToSubmit = overrideValues ?? session.values
    const activeCardId = session.card.cardId

    // 1. Instant 0ms local evaluation
    const hasAnswers = Boolean(
      (session.card.cardAnswers && session.card.cardAnswers.length > 0) ||
      (session.card.blankAnswers && session.card.blankAnswers.length > 0),
    )
    const localVerdict = hasAnswers ? session.evaluateLocally(valuesToSubmit, revealed, mode) : null

    if (localVerdict) {
      session.accept(localVerdict, activeCardId)
      if (answeringType === 'flashcard') {
        const spent = session.advance()
        if (spent && sessionId) finish(sessionId)
      }
    }

    // 2. Non-blocking background sync
    const body: SubmitAnswerRequest = {
      cardId: activeCardId,
      blanks: Object.entries(valuesToSubmit).map(([ordinal, submitted]) => ({
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
          session.accept(data, activeCardId)
        },
      },
    )
  }

  const next = (): void => {
    const spent = session.advance()
    if (spent && sessionId) finish(sessionId)
  }

  useEffect(() => {
    /**
     * Session shortcuts, on `window` because the target varies: Enter is handled
     * by whichever blank has focus, but Escape and the reveal have to work from
     * anywhere on the page.
     *
     * Only modifier-free keys, and never while a graded card is on screen — the
     * feedback panel's button owns Enter at that point.
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return

      if (event.key === 'Enter' && session.answer) {
        event.preventDefault()
        next()
        return
      }

      // Shift+Enter reveals. A bare key would fire while the user is typing an
      // answer into a blank, which is every keystroke of the session.
      if (event.key === 'Enter' && event.shiftKey && !session.answer) {
        event.preventDefault()
        send(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  })

  /**
   * A session that was adopted but has no cards left in it.
   *
   * Indistinguishable from "still loading" by `session.card` alone — both are
   * null. `sessionId` is the discriminator: it is set only once a session has
   * actually loaded, so this means the queue arrived and was empty rather than
   * that it has not arrived yet.
   *
   * Reachable whenever a session is answered to the end without the completion
   * call landing: the last card answered and then a reload, a closed tab, or the
   * same session finished elsewhere. Without a branch of its own it falls
   * through to the skeleton and waits for a card that is never coming.
   */
  const sessionSpent =
    sessionId !== null && !session.card && summary === null && !complete.isPending

  useEffect(() => {
    // Drop the pointer so a reload starts a fresh session rather than resuming
    // one with nothing left in it.
    if (sessionSpent) forgetSession()
  }, [sessionSpent])

  if (summary) {
    return (
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
      />
    )
  }

  if (picking) {
    return (
      <ModePicker
        selected={mode}
        onChange={setMode}
        onStart={() => {
          setParams(
            (prev) => {
              prev.set('mode', mode)
              return prev
            },
            { replace: true },
          )
          begin(mode)
        }}
        pending={starting}
      />
    )
  }

  /*
    A failed start is usually not a failure at all — "nothing is due right now"
    arrives as a 400, and it is the single most likely response for a user who
    has already studied today. Showing it as an error page with a retry button
    would misdescribe a finished day as a broken one.
  */
  if (startError) {
    const nothingDue =
      startError instanceof ApiError &&
      startError.code === 'VALIDATION_ERROR' &&
      startError.message.toLowerCase().includes('nothing is due')

    return (
      <Card tone="dashed" className="p-8 text-center">
        {/*
          A finished day gets the accent tick, not a warning icon: the two states
          share this branch but only one of them is a problem.
        */}
        {nothingDue && (
          <CheckIcon className="mx-auto mb-2 h-6 w-6 text-accent-strong" aria-hidden="true" />
        )}
        <p className="font-medium">{nothingDue ? 'Nothing due right now' : 'Could not start'}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {nothingDue
            ? 'Every card in this set has been reviewed for today. New reviews unlock tomorrow.'
            : startError.message}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link className={buttonClass({ variant: 'soft' })} to="/">
            Back to the dashboard
          </Link>
          {!nothingDue && (
            <Button
              disabled={starting}
              onClick={() => {
                begin()
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </Card>
    )
  }

  if (sessionSpent) {
    return (
      <Card tone="dashed" className="p-8 text-center">
        <p className="font-medium">This session is finished</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Every card in it has been answered. Start another to keep going.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link className={buttonClass({ variant: 'soft' })} to="/">
            Back to the dashboard
          </Link>
          <Button
            disabled={starting}
            onClick={() => {
              setSessionId(null)
              begin()
            }}
          >
            {starting ? 'Starting…' : 'Study again'}
          </Button>
        </div>
      </Card>
    )
  }

  if (!session.card) {
    return (
      <div className="py-12" aria-busy="true">
        <SauladoLoader
          size={84}
          starAnimation="star-gyro"
          showBrand
          showTagline
          message="Loading your study card"
        />
      </div>
    )
  }

  const answered = session.progress.answered
  const total = Math.max(session.progress.total, 1)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm tabular-nums text-muted-foreground">
            {/* Progress is the server's count, so a re-queued card is honest about
                having been answered rather than silently rewinding the bar. */}
            {answered} of {session.progress.total} answered
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
            <StudyModeSwitcher
              value={answeringType}
              onChange={handleAnsweringTypeChange}
              disabled={session.answer !== null || submit.isPending}
            />

            <Button
              variant="ghost"
              size="sm"
              disabled={complete.isPending}
              onClick={() => {
                if (sessionId) finish(sessionId)
              }}
            >
              End session
            </Button>
          </div>
        </div>

        {/*
          Native progress element rather than a styled div: it is announced with a
          value, and it degrades to something meaningful if styles fail to load.
        */}
        <progress
          className="h-2 w-full overflow-hidden rounded-full border-0 bg-surface-muted [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
          value={answered}
          max={total}
          aria-label="Session progress"
        />
      </header>

      <StudyCardView
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

      {session.answer ? (
        <FeedbackPanel
          answer={session.answer}
          pending={complete.isPending}
          isLast={session.isLast}
          onNext={next}
        />
      ) : answeringType === 'identification' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={session.answer !== null || submit.isPending}
            onClick={() => {
              send(false)
            }}
          >
            Check answer
          </Button>
          {/*
            Reveal is not a shortcut to a good grade — it books `again` server-side
            regardless of what is typed — so it is labelled as the escape hatch it
            is rather than hidden away.
          */}
          <Button
            variant="ghost"
            disabled={session.answer !== null || submit.isPending}
            onClick={() => {
              send(true)
            }}
          >
            Reveal answer
          </Button>
          <p className="ml-auto text-xs text-muted-foreground max-sm:hidden">
            Enter to check · Shift+Enter to reveal
          </p>
        </div>
      ) : answeringType === 'multiple-choice' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            disabled={session.answer !== null || submit.isPending}
            onClick={() => {
              send(true)
            }}
          >
            Reveal answer
          </Button>
          <p className="ml-auto text-xs text-muted-foreground max-sm:hidden">
            Press 1–4 or A–D to select
          </p>
        </div>
      ) : null}

      {/*
        A failed submission keeps the card and its typed answers on screen. The
        idempotency key is unchanged, so the retry either books the review once or
        replays the verdict of an attempt that actually landed.
      */}
      {submit.isError && (
        <Card role="alert" tone="danger" className="p-4">
          <p className="flex items-start gap-1.5 text-sm">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em] text-danger" />
            {submit.error.message}
          </p>
          <Button
            className="mt-3"
            variant="soft"
            size="sm"
            onClick={() => {
              send(false)
            }}
          >
            Try again
          </Button>
        </Card>
      )}
    </div>
  )
}

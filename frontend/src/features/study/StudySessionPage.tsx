import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { SessionSummary, SubmitAnswerRequest } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/services/api'
import { FeedbackPanel } from './FeedbackPanel'
import { SessionSummaryView } from './SessionSummaryView'
import { StudyCardView } from './StudyCardView'
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
  const [params] = useSearchParams()
  const studySetId = params.get('set')

  const session = useStudySession()
  const start = useStartSession()
  const submit = useSubmitAnswer()
  const complete = useCompleteSession()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [resumeId] = useState(readResumableSession)

  const resumed = useSession(sessionId === null ? resumeId : null)
  const elapsed = useCardTimer(session.card?.cardId)
  const started = useRef(false)

  useEffect(() => {
    /**
     * One start per mount, guarded by a ref rather than a dependency list.
     *
     * StrictMode double-invokes effects in development, and this one has a side
     * effect on the server — an unguarded version would create two sessions and
     * abandon the first, which is exactly the state `startSession` exists to
     * avoid. Skipped entirely when there is a session id to resume.
     */
    if (started.current || resumeId !== null) return
    started.current = true

    start.mutate(studySetId ?? undefined, {
      onSuccess: (data) => {
        setSessionId(data.session.id)
        rememberSession(data.session.id)
        session.load(data.session)
      },
    })
  }, [resumeId, start, studySetId, session])

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
    started.current = true

    start.mutate(studySetId ?? undefined, {
      onSuccess: (data) => {
        setSessionId(data.session.id)
        rememberSession(data.session.id)
        session.load(data.session)
      },
    })
  }, [resumed.isError, start, studySetId, session])

  const finish = (id: string): void => {
    complete.mutate(id, {
      onSuccess: (data) => {
        forgetSession()
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

  if (summary) {
    return (
      <SessionSummaryView
        summary={summary}
        studySetId={studySetId}
        pending={start.isPending}
        onStudyAgain={() => {
          setSummary(null)
          setSessionId(null)
          started.current = true
          start.mutate(studySetId ?? undefined, {
            onSuccess: (data) => {
              setSessionId(data.session.id)
              rememberSession(data.session.id)
              session.load(data.session)
            },
            onError: () => {
              // Nothing due. `startError` below renders the reason.
              started.current = true
            },
          })
        }}
      />
    )
  }

  /*
    A failed start is usually not a failure at all — "nothing is due right now"
    arrives as a 400, and it is the single most likely response for a user who
    has already studied today. Showing it as an error page with a retry button
    would misdescribe a finished day as a broken one.
  */
  if (start.isError) {
    const error = start.error
    const nothingDue = error instanceof ApiError && error.code === 'VALIDATION_ERROR'

    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-medium">{nothingDue ? 'Nothing due right now' : 'Could not start'}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {nothingDue
            ? 'Every card in this set has been reviewed for today. New reviews unlock tomorrow.'
            : error.message}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link className={buttonClass({ variant: 'outline' })} to="/">
            Back to the dashboard
          </Link>
          {!nothingDue && (
            <Button
              onClick={() => {
                start.reset()
                started.current = false
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (!session.card) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <div className="rounded-lg border border-border p-6">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="mt-4 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-3/4" />
        </div>
      </div>
    )
  }

  const answered = session.progress.answered
  const total = Math.max(session.progress.total, 1)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">
            {/* Progress is the server's count, so a re-queued card is honest about
                having been answered rather than silently rewinding the bar. */}
            {answered} of {session.progress.total} answered
          </p>
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
        {/*
          Native progress element rather than a styled div: it is announced with a
          value, and it degrades to something meaningful if styles fail to load.
        */}
        <progress
          className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-[hsl(var(--foreground))] [&::-moz-progress-bar]:bg-[hsl(var(--foreground))]"
          value={answered}
          max={total}
          aria-label="Session progress"
        />
      </header>

      <StudyCardView
        card={session.card}
        values={session.values}
        results={session.answer?.results ?? null}
        disabled={session.answer !== null || submit.isPending}
        onChange={session.setValue}
        onSubmit={() => {
          send(false)
        }}
      />

      {session.answer ? (
        <FeedbackPanel
          answer={session.answer}
          pending={complete.isPending}
          isLast={session.isLast}
          onNext={next}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={submit.isPending}
            onClick={() => {
              send(false)
            }}
          >
            {submit.isPending ? 'Checking…' : 'Check answer'}
          </Button>
          {/*
            Reveal is not a shortcut to a good grade — it books `again` server-side
            regardless of what is typed — so it is labelled as the escape hatch it
            is rather than hidden away.
          */}
          <Button
            variant="ghost"
            disabled={submit.isPending}
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
      )}

      {/*
        A failed submission keeps the card and its typed answers on screen. The
        idempotency key is unchanged, so the retry either books the review once or
        replays the verdict of an attempt that actually landed.
      */}
      {submit.isError && (
        <div role="alert" className="rounded-lg border border-warning p-4">
          <p className="text-sm">{submit.error.message}</p>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            onClick={() => {
              send(false)
            }}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

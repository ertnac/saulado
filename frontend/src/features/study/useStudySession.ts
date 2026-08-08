import { useCallback, useRef, useState } from 'react'
import {
  requeuePosition,
  type AnswerResponse,
  type SessionCard,
  type SessionProgress,
  type StudySession,
} from '@saulado/shared'

/**
 * The client half of a study session: which card is up, what is typed in it, and
 * what the server said about the last answer.
 *
 * The server owns grading and scheduling; this owns only *presentation order*,
 * and it deliberately does not refetch the queue between cards. Asking the server
 * "what is next" after every answer would replace a queue the user is halfway
 * through with a freshly computed one — a card studied in another tab, or a cap
 * recalculated at midnight, would reorder the deck under their fingers.
 *
 * So the queue is fetched once and walked locally. Where a re-queued card lands
 * is not guessed: {@link requeuePosition} is the same function the server used to
 * move the row, so the local order and the resumable order agree.
 */

/**
 * One key per card *presentation*, not per request.
 *
 * This is what makes a retry safe. A double-tap, or a manual retry after a
 * timeout that actually succeeded, replays the same key and gets the original
 * verdict back instead of booking a second review. The key must therefore
 * survive a failed attempt and change only when a new card is presented.
 */
function newIdempotencyKey(): string {
  // `randomUUID` needs a secure context; the fallback keeps this working over
  // plain HTTP on a LAN address, which is how `dev:lan` is used on a phone.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k${String(Date.now())}-${Math.random().toString(36).slice(2, 12)}`
}

export interface StudySessionController {
  card: SessionCard | null
  /** Typed answers for the current card, by blank ordinal. */
  values: Record<number, string>
  /** The graded verdict, or `null` while the current card is unanswered. */
  answer: AnswerResponse | null
  progress: SessionProgress
  /** Cards left including the current one. */
  remaining: number
  /** Answering this card ends the session, so the button says so. */
  isLast: boolean
  idempotencyKey: string
  setValue: (ordinal: number, value: string) => void
  /** Loads a session's queue, replacing anything in progress. */
  load: (session: StudySession) => void
  /** Records a graded answer and stops accepting input for this card. */
  accept: (answer: AnswerResponse) => void
  /** Advances past the graded card. Returns `true` when the session is spent. */
  advance: () => boolean
  reset: () => void
}

export function useStudySession(): StudySessionController {
  const [queue, setQueue] = useState<SessionCard[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [answer, setAnswer] = useState<AnswerResponse | null>(null)
  const [progress, setProgress] = useState<SessionProgress>({
    answered: 0,
    total: 0,
    correct: 0,
  })
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)

  /**
   * Mirrors `queue` and `answer` for {@link advance}, which has to read both and
   * write a new queue in the same tick.
   *
   * A state updater would not do: React runs `setState(prev => …)` during the
   * next render, not at the call site, so a value read out of one is the value
   * from *before* the last grade. `advance` has to return whether the session is
   * finished synchronously — that answer decides whether the page completes or
   * renders the next card — so it reads refs.
   */
  const queueRef = useRef<SessionCard[]>([])
  const answerRef = useRef<AnswerResponse | null>(null)

  const setQueueBoth = useCallback((next: SessionCard[]) => {
    queueRef.current = next
    setQueue(next)
  }, [])

  const setAnswerBoth = useCallback((next: AnswerResponse | null) => {
    answerRef.current = next
    setAnswer(next)
  }, [])

  const load = useCallback(
    (session: StudySession) => {
      setQueueBoth(session.queue)
      setProgress(session.progress)
      setValues({})
      setAnswerBoth(null)
      setIdempotencyKey(newIdempotencyKey())
    },
    [setQueueBoth, setAnswerBoth],
  )

  const accept = useCallback(
    (graded: AnswerResponse) => {
      setAnswerBoth(graded)
      // Trusted over any local tally: a re-queued card counts once per attempt,
      // and a replayed idempotency key must not advance the count at all. The
      // server is the only place that knows which of those just happened.
      setProgress(graded.progress)
    },
    [setAnswerBoth],
  )

  const advance = useCallback((): boolean => {
    const [head, ...rest] = queueRef.current
    const requeued = answerRef.current?.requeued ?? false

    let next = rest
    if (head && requeued) {
      next = [...rest]
      next.splice(requeuePosition(0, rest.length), 0, head)
    }

    setQueueBoth(next)
    setAnswerBoth(null)
    setValues({})
    setIdempotencyKey(newIdempotencyKey())

    return next.length === 0
  }, [setQueueBoth, setAnswerBoth])

  const setValue = useCallback((ordinal: number, value: string) => {
    setValues((current) => ({ ...current, [ordinal]: value }))
  }, [])

  const reset = useCallback(() => {
    setQueueBoth([])
    setValues({})
    setAnswerBoth(null)
    setProgress({ answered: 0, total: 0, correct: 0 })
  }, [setQueueBoth, setAnswerBoth])

  return {
    card: queue[0] ?? null,
    values,
    answer,
    progress,
    remaining: queue.length,
    isLast: queue.length === 1 && !(answer?.requeued ?? false),
    idempotencyKey,
    setValue,
    load,
    accept,
    advance,
    reset,
  }
}

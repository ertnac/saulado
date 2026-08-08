/**
 * Remembering an interrupted session across a reload (plan §4.2).
 *
 * Only the session id is stored, never the queue or the typed answers. The server
 * already holds everything that matters — `GET /api/study/sessions/:id` returns
 * the cards still unanswered — so persisting the queue would create a second copy
 * that can disagree with it, and persisting answers would let a reload replay
 * them against a card that has since been graded.
 *
 * A pointer, in other words, not a cache. If it turns out to be stale the resume
 * fails harmlessly and the user starts a fresh session.
 */

const KEY = 'saulado-study-session'

/** Beyond this a session is not worth resuming — the queue was built for a day. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

interface ResumePointer {
  sessionId: string
  savedAt: number
}

function isPointer(value: unknown): value is ResumePointer {
  if (typeof value !== 'object' || value === null) return false
  const pointer = value as Partial<ResumePointer>
  return typeof pointer.sessionId === 'string' && typeof pointer.savedAt === 'number'
}

export function readResumableSession(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isPointer(parsed)) return null

    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY)
      return null
    }

    return parsed.sessionId
  } catch {
    // Private-mode Safari throws on access; a hand-edited value throws on parse.
    // Either way there is nothing to resume, which is a valid answer.
    return null
  }
}

export function rememberSession(sessionId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sessionId, savedAt: Date.now() }))
  } catch {
    // Storage disabled or full. Resume is a convenience; the session itself is
    // unaffected and still completable in this tab.
  }
}

export function forgetSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ages out on its own.
  }
}

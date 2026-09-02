import { useEffect, useRef } from 'react'
import type { DraftAnswer } from '@saulado/shared'

/**
 * Debounced draft persistence for the card editor.
 *
 * The case this exists for: someone pastes two pages of notes, spends ten
 * minutes highlighting, then closes the tab or their phone kills the background
 * page. Without this, that work is gone and nothing warned them. Card creation
 * is the one flow in the app where losing state costs more than a re-fetch.
 *
 * Keyed per set so two drafts in two sets do not overwrite each other, and
 * timestamped so a stale draft can be aged out rather than resurrected months
 * later against a set the user has since rewritten.
 *
 * Answers are persisted alongside the paragraph deliberately. Saving only the
 * text would restore the words and silently drop every highlight — worse than
 * saving nothing, because the user sees their paragraph return and assumes the
 * rest came with it.
 */

/**
 * Versioned, and bumped when the stored shape changed.
 *
 * A draft saved by the previous build carries a `title` the card model no longer
 * has. Reading it back would restore a shape with a field nothing consumes —
 * harmless today, but the version is what makes that provable rather than
 * something to reason about, and the old entries age out on their own.
 */
const KEY_PREFIX = 'saulado-card-draft-v2'
const DEBOUNCE_MS = 500

/** Drafts older than this are treated as abandoned. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface CardDraftSnapshot {
  paragraph: string
  answers: DraftAnswer[]
  tags?: string[]
  savedAt: number
}

function keyFor(scope: string): string {
  return `${KEY_PREFIX}:${scope}`
}

/** Shape-checks a parsed draft — `localStorage` is user-writable and survives deploys. */
function isSnapshot(value: unknown): value is CardDraftSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<CardDraftSnapshot>

  return (
    typeof draft.paragraph === 'string' &&
    Array.isArray(draft.answers) &&
    typeof draft.savedAt === 'number'
  )
}

export function readDraft(scope: string): CardDraftSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(scope))
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isSnapshot(parsed)) return null

    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(scope))
      return null
    }

    return parsed
  } catch {
    // Private-mode Safari throws on access, and a hand-edited value throws on
    // parse. Neither is worth failing the editor over — the draft is a
    // convenience, and the live state is unaffected.
    return null
  }
}

export function clearDraft(scope: string): void {
  try {
    localStorage.removeItem(keyFor(scope))
  } catch {
    // Nothing to do; the draft ages out on its own.
  }
}

/**
 * Writes a snapshot at most once per {@link DEBOUNCE_MS} while it changes.
 *
 * `enabled` is what stops a save from resurrecting itself: after the card is
 * submitted the caller clears the draft and disables persistence, otherwise a
 * pending timer fires afterwards and writes it straight back.
 */
export function useCardDraftPersistence(
  scope: string,
  snapshot: Omit<CardDraftSnapshot, 'savedAt'>,
  enabled = true,
): void {
  const { paragraph, answers, tags } = snapshot
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Nothing typed yet — writing an empty draft would mask a real one saved
    // earlier in this scope.
    if (paragraph.trim().length === 0) return

    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          keyFor(scope),
          JSON.stringify({ paragraph, answers, tags, savedAt: Date.now() }),
        )
      } catch {
        // Quota exceeded or storage disabled. Silent by design: a toast here
        // would fire mid-typing for something the user cannot act on.
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [scope, paragraph, answers, tags, enabled])
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import type { DraftAnswer } from '@saulado/shared'

/**
 * Keeps an unsaved card on the device — a port of
 * `frontend/src/features/cards/useCardDraftPersistence.ts`.
 *
 * The reason it exists is sharper on a phone than in a browser tab: the OS kills
 * a backgrounded app whenever it wants memory, and a user who takes a call
 * mid-paragraph did not choose to discard their work.
 *
 * The answers persist alongside the paragraph, not just the text. Saving only
 * the text would restore the words and silently drop every highlight — worse
 * than saving nothing, because it looks like the app kept the work.
 *
 * **Where the port stops being mechanical.** The web reads `localStorage`
 * synchronously inside a `useState` initializer, so the restored draft is
 * available on the composer's first render. AsyncStorage has no synchronous
 * read. Seeding after mount would mean a `reset()` landing on top of whatever
 * the user has already typed, which is the exact race `CardComposer`'s own
 * header warns against — so instead {@link useRestoredDraft} returns
 * `undefined` while the read is in flight and the composer does not mount its
 * editor until it resolves. That is the same shape as gating on a card fetch,
 * and it costs one storage read rather than a lost keystroke.
 *
 * The key is shared with nothing: `scope` is `card:<id>` when editing and
 * `set:<id>:new` otherwise, so an edit in progress and a new card in the same
 * set cannot overwrite each other.
 */

const KEY_PREFIX = 'saulado-card-draft-v2'

/** Long enough that a burst of typing writes once, short enough to survive a kill. */
const DEBOUNCE_MS = 500

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface CardDraftSnapshot {
  paragraph: string
  answers: DraftAnswer[]
  tags: string[]
  savedAt: number
}

function keyFor(scope: string): string {
  return `${KEY_PREFIX}:${scope}`
}

function isSnapshot(value: unknown): value is CardDraftSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<CardDraftSnapshot>
  return (
    typeof draft.paragraph === 'string' &&
    Array.isArray(draft.answers) &&
    typeof draft.savedAt === 'number'
  )
}

export async function readDraft(scope: string): Promise<CardDraftSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(scope))
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isSnapshot(parsed)) return null

    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(keyFor(scope))
      return null
    }

    return parsed
  } catch {
    // A draft that cannot be read is a draft that never existed. Anything else
    // here would block the composer over a corrupt cache entry.
    return null
  }
}

export function clearDraft(scope: string): void {
  void AsyncStorage.removeItem(keyFor(scope)).catch(() => {
    // The draft is stale, not dangerous — the age check retires it either way.
  })
}

/**
 * Reads the stored draft once, on mount.
 *
 * `undefined` means "still reading", `null` means "nothing stored". Callers must
 * treat those differently: rendering the editor on `undefined` is what would
 * make the restore race the user's typing.
 *
 * `enabled: false` resolves to `null` immediately rather than reading, so the
 * editing and importing paths — which have their own source of truth — do not
 * wait on storage they are going to ignore.
 */
export function useRestoredDraft(
  scope: string,
  enabled: boolean,
): CardDraftSnapshot | null | undefined {
  const [state, setState] = useState<CardDraftSnapshot | null | undefined>(
    enabled ? undefined : null,
  )

  useEffect(() => {
    if (!enabled) return

    let live = true
    void readDraft(scope).then((draft) => {
      // A resolution arriving after unmount, or after the scope changed under it,
      // would seed the editor from a draft belonging to a different card.
      if (live) setState(draft)
    })

    return () => {
      live = false
    }
  }, [scope, enabled])

  return state
}

/**
 * Writes the draft on a debounce while the composer is open.
 *
 * `enabled` is what stops a submitted card being restored as if it were
 * unfinished: without it a pending timer fires after the save and writes the
 * draft straight back, and the next new card in that set opens pre-filled with
 * a card the user already saved.
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
    // An empty paragraph is not a draft. Storing one would mean opening and
    // closing the composer leaves a row behind that restores as nothing.
    if (paragraph.trim().length === 0) return

    timer.current = setTimeout(() => {
      const draft: CardDraftSnapshot = { paragraph, answers, tags, savedAt: Date.now() }
      void AsyncStorage.setItem(keyFor(scope), JSON.stringify(draft)).catch(() => {
        // A failed write costs the restore, not the card in front of the user.
      })
    }, DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [scope, paragraph, answers, tags, enabled])
}

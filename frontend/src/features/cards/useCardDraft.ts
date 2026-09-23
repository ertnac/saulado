import { useCallback, useState } from 'react'
import {
  ANSWERS_MAX_PER_CARD,
  assignOrdinals,
  ClozeError,
  createAnswer,
  needsReanchoring,
  normalizeParagraph,
  reanchorAnswers,
  type DraftAnswer,
} from '@saulado/shared'
import type { OffsetRange } from '@/lib/selection'

/**
 * State for the highlight editor.
 *
 * Two things make this more than a `useState` bag, and both come from the offset
 * model (plan §2.1).
 *
 * **1. The committed paragraph and the text being typed are different values.**
 * Every answer's offsets index into `paragraph`. While the user is editing in
 * compose mode those offsets are stale by definition — one inserted character at
 * the top invalidates all of them. So the textarea writes to `draftText` and
 * leaves `paragraph` alone until {@link commitParagraph} runs. Rendering the
 * preview from `paragraph` rather than `draftText` is what stops every keystroke
 * from producing a `TEXT_MISMATCH`.
 *
 * **2. Committing is the only place normalization happens.** `normalizeParagraph`
 * changes lengths (CRLF collapses, NFC recomposes), so running it on a paragraph
 * that already has answers would shift offsets out from under them. Commit
 * normalizes and re-anchors in the same step, so the two can never be applied
 * out of order.
 */

export type EditorMode = 'compose' | 'highlight'

/** A draft answer carrying the positional ordinal the UI labels it with. */
export interface EditorAnswer extends DraftAnswer {
  ordinal: number
}

export interface CardDraftState {
  mode: EditorMode
  /** Committed, normalized text. Every answer offset indexes into this. */
  paragraph: string
  /** The textarea's live value. Diverges from `paragraph` while composing. */
  draftText: string
  answers: EditorAnswer[]
  /** Highlights whose text vanished in the last edit. Never dropped silently. */
  orphaned: DraftAnswer[]
  canUndo: boolean
  canRedo: boolean
}

export interface CardDraftActions {
  setMode: (mode: EditorMode) => void
  setDraftText: (text: string) => void
  /** Normalizes `draftText`, re-anchors the answers onto it, surfaces orphans. */
  commitParagraph: () => void
  /** Discards the in-progress edit and returns to the committed paragraph. */
  revertDraftText: () => void
  addHighlight: (range: OffsetRange) => void
  removeHighlight: (ordinal: number) => void
  setAltAnswers: (ordinal: number, alts: string[]) => void
  dismissOrphans: () => void
  reset: (
    next: { paragraph: string; answers?: readonly DraftAnswer[] },
    clearHistory?: boolean,
  ) => void
  undo: () => void
  redo: () => void
}

export interface CardDraftInit {
  paragraph?: string
  answers?: readonly DraftAnswer[]
  /**
   * Which surface to open on. Defaults to `compose`.
   *
   * `highlight` is for a draft that arrives with its blanks already placed — an
   * image import, where the user highlighted them in the dialog. Opening that on
   * the textarea would show a paragraph with no visible highlights, which reads
   * as the work having been thrown away.
   */
  mode?: EditorMode
}

/** Sorts, renumbers, and caps a set of answers in one place. */
function renumber(answers: readonly DraftAnswer[]): EditorAnswer[] {
  return assignOrdinals(answers).slice(0, ANSWERS_MAX_PER_CARD)
}

export function useCardDraft(init: CardDraftInit = {}): CardDraftState & CardDraftActions {
  const initialParagraph = normalizeParagraph(init.paragraph ?? '')

  const [mode, setMode] = useState<EditorMode>(init.mode ?? 'compose')
  const [paragraph, setParagraph] = useState(initialParagraph)
  const [draftText, setDraftText] = useState(initialParagraph)
  const [answers, setAnswers] = useState<EditorAnswer[]>(() => renumber(init.answers ?? []))
  const [orphaned, setOrphaned] = useState<DraftAnswer[]>([])

  const [past, setPast] = useState<{ paragraph: string; answers: EditorAnswer[] }[]>([])
  const [future, setFuture] = useState<{ paragraph: string; answers: EditorAnswer[] }[]>([])

  const pushHistory = useCallback(() => {
    setPast((p) => [...p, { paragraph, answers }])
    setFuture([])
  }, [paragraph, answers])

  const undo = useCallback(() => {
    if (past.length === 0) return
    const previous = past[past.length - 1]
    if (!previous) return

    setFuture((f) => [{ paragraph, answers }, ...f])
    setPast((p) => p.slice(0, -1))

    setParagraph(previous.paragraph)
    setDraftText(previous.paragraph)
    setAnswers(previous.answers)
    setOrphaned([])
  }, [past, paragraph, answers])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[0]
    if (!next) return

    setPast((p) => [...p, { paragraph, answers }])
    setFuture((f) => f.slice(1))

    setParagraph(next.paragraph)
    setDraftText(next.paragraph)
    setAnswers(next.answers)
    setOrphaned([])
  }, [future, paragraph, answers])

  /**
   * Reads `answers` directly rather than through a functional updater: the
   * re-anchor also has to set `orphaned`, and a state updater that calls another
   * setter is not pure — StrictMode runs it twice.
   */
  const commitParagraph = useCallback(() => {
    const next = normalizeParagraph(draftText)

    setParagraph(next)
    setDraftText(next)

    if (answers.length === 0) {
      if (paragraph !== next) pushHistory()
      return
    }

    // The cheap pre-check: appending to the end leaves every offset valid, and
    // that is the common case. Skipping the search there also avoids re-anchoring
    // relocating an answer onto an identical word elsewhere when nothing moved.
    if (!needsReanchoring(paragraph, next, answers)) {
      if (paragraph !== next) pushHistory()
      return
    }

    pushHistory()
    const { matched, orphaned: lost } = reanchorAnswers(paragraph, next, answers)
    setAnswers(renumber(matched))
    setOrphaned(lost)
  }, [answers, draftText, paragraph])

  const revertDraftText = useCallback(() => {
    setDraftText(paragraph)
  }, [paragraph])

  /**
   * Adds a highlight from an already-vetted range.
   *
   * Overlap rejection belongs to `resolveHighlight`, which the surface calls so
   * it can name the colliding blanks inline. `createAnswer` still runs here
   * because it is what derives `answerText` from the paragraph — the editor never
   * types that string itself, which is what makes it a usable corruption
   * tripwire later.
   */
  const addHighlight = useCallback(
    (range: OffsetRange) => {
      if (answers.length >= ANSWERS_MAX_PER_CARD) return

      let answer: DraftAnswer
      try {
        answer = createAnswer(paragraph, range.startOffset, range.endOffset)
      } catch (error) {
        // A ClozeError means the range was already invalid against the paragraph,
        // so there is nothing to add. Anything else is a real bug — rethrow it
        // rather than losing it inside a click handler.
        if (error instanceof ClozeError) return
        throw error
      }

      pushHistory()
      setAnswers(renumber([...answers, answer]))
    },
    [answers, paragraph, pushHistory],
  )

  const removeHighlight = useCallback(
    (ordinal: number) => {
      pushHistory()
      setAnswers((current) => renumber(current.filter((answer) => answer.ordinal !== ordinal)))
    },
    [pushHistory],
  )

  const setAltAnswers = useCallback((ordinal: number, alts: string[]) => {
    pushHistory()
    setAnswers((current) =>
      current.map((answer) =>
        answer.ordinal === ordinal
          ? { ...answer, altAnswers: alts.filter((alt) => alt.trim().length > 0) }
          : answer,
      ),
    )
  }, [])

  const dismissOrphans = useCallback(() => {
    setOrphaned([])
  }, [])

  const reset = useCallback(
    (next: { paragraph: string; answers?: readonly DraftAnswer[] }, clearHistory = true) => {
      if (!clearHistory) {
        pushHistory()
      } else {
        setPast([])
        setFuture([])
      }
      const normalized = normalizeParagraph(next.paragraph)
      setParagraph(normalized)
      setDraftText(normalized)
      setAnswers(renumber(next.answers ?? []))
      setOrphaned([])
    },
    [pushHistory],
  )

  return {
    mode,
    paragraph,
    draftText,
    answers,
    orphaned,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    setMode,
    setDraftText,
    commitParagraph,
    revertDraftText,
    addHighlight,
    removeHighlight,
    setAltAnswers,
    dismissOrphans,
    reset,
    undo,
    redo,
  }
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { sliceCodePoints } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  HIGHLIGHT_ORDINAL_ATTR,
  PARAGRAPH_DECORATION_ATTR,
  resolveHighlight,
  type SelectionResult,
} from '@/lib/selection'
import type { EditorAnswer } from './useCardDraft'

/**
 * The read-only paragraph the user highlights against (plan §3.3, "highlight
 * mode").
 *
 * A `<textarea>` cannot render styled spans, so per ADR 0001 highlighting happens
 * on a separate rendered surface rather than in place. That rendering is what
 * splits the paragraph into multiple text nodes — which is precisely the case
 * `lib/selection.ts` walks, and the reason the mapping there is not a matter of
 * reading `anchorOffset`.
 *
 * Segments are built here rather than with `renderCloze` because the two want
 * opposite things: `renderCloze` replaces answers with fixed-width blanks to
 * *hide* them for study, while the editor must show the highlighted words so the
 * user can see what they picked.
 */

interface Piece {
  text: string
  ordinal: number | null
  /** Code point offset this run begins at — a stable React key. */
  start: number
}

/**
 * Splits the paragraph into plain and highlighted runs.
 *
 * Answers arrive sorted and non-overlapping (`assignOrdinals` sorts, and
 * `resolveHighlight` rejects overlaps before anything is added), so a single
 * forward pass is enough. Out-of-order input would produce a negative slice, so
 * the cursor guard skips anything that would rewind — same defence as
 * `renderCloze`.
 *
 * Each piece carries its start offset so React can key on position rather than
 * array index: the same word can appear in several runs, and an index key makes
 * React reuse the wrong node when a highlight is removed from the middle.
 */
export function toPieces(paragraph: string, answers: readonly EditorAnswer[]): Piece[] {
  const pieces: Piece[] = []
  let cursor = 0

  for (const answer of [...answers].sort((a, b) => a.startOffset - b.startOffset)) {
    if (answer.startOffset < cursor) continue

    if (answer.startOffset > cursor) {
      pieces.push({
        text: sliceCodePoints(paragraph, cursor, answer.startOffset),
        ordinal: null,
        start: cursor,
      })
    }

    pieces.push({
      text: sliceCodePoints(paragraph, answer.startOffset, answer.endOffset),
      ordinal: answer.ordinal,
      start: answer.startOffset,
    })

    cursor = answer.endOffset
  }

  const tail = sliceCodePoints(paragraph, cursor)
  if (tail.length > 0) pieces.push({ text: tail, ordinal: null, start: cursor })

  return pieces
}

interface HighlightSurfaceProps {
  paragraph: string
  answers: readonly EditorAnswer[]
  /** Called with every attempt, successful or not, so the caller can explain a rejection. */
  onSelect: (result: SelectionResult) => void
  onRemoveHighlight: (ordinal: number) => void
  /** Snap to word boundaries — on for touch, off for mouse and keyboard. */
  snap?: boolean
  className?: string
}

export function HighlightSurface({
  paragraph,
  answers,
  onSelect,
  onRemoveHighlight,
  snap = false,
  className,
}: HighlightSurfaceProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const attempt = useCallback(() => {
    const root = rootRef.current
    if (!root) return

    const result = resolveHighlight(root, paragraph, answers, { snap })

    // A bare click reports `collapsed`. Surfacing that as a message would put an
    // error on screen every time the user taps the paragraph, so it is dropped
    // here rather than in the caller.
    if (!result.ok && (result.reason === 'collapsed' || result.reason === 'no-selection')) return

    onSelect(result)
  }, [answers, onSelect, paragraph, snap])

  /**
   * Tracks whether a usable selection exists, to show the touch action bar.
   *
   * `selectionchange` on the document is the only event that fires for touch
   * handle dragging — `mouseup` does not, which is exactly why touch needs a
   * button rather than relying on the same gesture the mouse path uses. The
   * handler stays cheap because this event fires on every caret move.
   */
  useEffect(() => {
    const onSelectionChange = (): void => {
      const root = rootRef.current
      const selection = window.getSelection()

      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setHasSelection(false)
        return
      }

      const range = selection.getRangeAt(0)
      setHasSelection(root.contains(range.startContainer) && root.contains(range.endContainer))
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [])

  /**
   * `Ctrl/Cmd+H` highlights the current selection (plan §3.3). Bound on the
   * surface rather than the window so it cannot fire while focus is in the title
   * field, where the user means "type an H".
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        attempt()
      }
    },
    [attempt],
  )

  const pieces = toPieces(paragraph, answers)

  return (
    <>
      <div
        ref={rootRef}
        // `tabIndex` so Shift+arrow selection has somewhere to start from, and so
        // the Ctrl/Cmd+H binding is reachable without a mouse.
        tabIndex={0}
        role="group"
        aria-label="Paragraph — select text to create a blank"
        onMouseUp={attempt}
        onKeyDown={onKeyDown}
        className={cn(
          'whitespace-pre-wrap rounded-md border border-border bg-surface p-4 text-base leading-relaxed',
          className,
        )}
      >
        {pieces.map((piece) =>
          piece.ordinal === null ? (
            <span key={piece.start}>{piece.text}</span>
          ) : (
            <HighlightMark
              key={piece.start}
              ordinal={piece.ordinal}
              text={piece.text}
              onRemove={onRemoveHighlight}
            />
          ),
        )}
      </div>

      {/*
        The touch path. A long-press selects but fires no `mouseup`, so without an
        explicit button there is no way to commit a selection on a phone. Shown
        only while a selection is live inside this surface, and pinned to the
        bottom of the viewport because that is the one region the selection
        handles and the OS's own copy/paste bubble leave clear.

        `sm:hidden` rather than a `pointer: coarse` check: a media query in CSS
        survives a device that reports both, and the keyboard and mouse paths
        already work on wider screens.
      */}
      {hasSelection && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 shadow-lift sm:hidden">
          <Button onClick={attempt} className="w-full">
            Blank out selection
          </Button>
        </div>
      )}
    </>
  )
}

interface HighlightMarkProps {
  ordinal: number
  text: string
  onRemove: (ordinal: number) => void
}

/**
 * One highlighted run, with its numbered badge.
 *
 * A `<button>` wrapping a `<mark>` so Tab reaches every highlight in document
 * order for free (plan §3.3) — a `<div onClick>` would need a roving tabindex to
 * match. `Delete` is handled here rather than on the surface so it removes *this*
 * blank, which is the one the user has focused.
 *
 * The badge is `aria-hidden`: it is a visual index, and the accessible name
 * already carries the ordinal in words. It also carries
 * {@link PARAGRAPH_DECORATION_ATTR}, without which its digits would be counted as
 * paragraph text and every offset after the first highlight would be wrong.
 */
function HighlightMark({ ordinal, text, onRemove }: HighlightMarkProps): ReactElement {
  const label = ordinal + 1

  return (
    <button
      type="button"
      {...{ [HIGHLIGHT_ORDINAL_ATTR]: ordinal }}
      onClick={() => {
        onRemove(ordinal)
      }}
      onKeyDown={(event) => {
        // Removes without confirmation, which is safe because the paragraph text
        // is untouched — re-highlighting is one selection away. A confirm dialog
        // for something this reversible would be noise.
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          onRemove(ordinal)
        }
      }}
      aria-label={`Blank ${String(label)}: ${text}. Click or press Delete to remove.`}
      className={cn(
        'inline-flex items-center gap-1 mx-0.5 rounded-lg px-2 py-0.5 text-left align-baseline font-semibold transition-all shadow-2xs',
        'bg-highlight/35 text-foreground border border-highlight hover:bg-highlight/50 focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      <span
        aria-hidden="true"
        {...{ [PARAGRAPH_DECORATION_ATTR]: '' }}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground tabular-nums shrink-0"
      >
        {label}
      </span>
      <mark className="bg-transparent text-inherit font-semibold">{text}</mark>
    </button>
  )
}

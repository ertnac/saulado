import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { ANSWERS_MAX_PER_CARD, codePointLength, PARAGRAPH_MAX_CODE_POINTS } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SelectionResult } from '@/lib/selection'
import { ClozePreview } from './ClozePreview'
import { HighlightPopover } from './HighlightPopover'
import { HighlightSurface } from './HighlightSurface'
import { OrphanedNotice } from './OrphanedNotice'
import type { CardDraftActions, CardDraftState } from './useCardDraft'

/**
 * The highlight editor (plan §3.3) — compose, highlight, preview.
 *
 * Two modes rather than one surface, because ADR 0001 chose a `<textarea>` over a
 * rich-text framework and a `<textarea>` cannot render styled spans. Composing
 * and highlighting therefore happen on different elements, and the mode switch is
 * the commit boundary where the paragraph is normalized and answers are
 * re-anchored.
 *
 * The editor is deliberately state-agnostic: it takes {@link useCardDraft}'s
 * state and actions as props rather than owning them, so the create and edit
 * flows share one editor and one state machine instead of two of each.
 */

/** What the user is told when a selection cannot become a blank. */
function explainRejection(result: Extract<SelectionResult, { ok: false }>): string | null {
  switch (result.reason) {
    case 'overlap': {
      const names = result.ordinals.map((ordinal) => String(ordinal + 1)).join(', ')
      return result.ordinals.length === 1
        ? `That overlaps blank ${names}. Remove it first, or select different words.`
        : `That overlaps blanks ${names}. Remove them first, or select different words.`
    }
    case 'whitespace':
      return 'Select a word or phrase — a blank cannot be only spaces.'
    case 'outside':
      return 'Select inside the paragraph.'
    // Both mean "the user clicked without dragging", which is not a failure worth
    // narrating. HighlightSurface filters these before they reach here.
    case 'collapsed':
    case 'no-selection':
      return null
  }
}

interface HighlightEditorProps {
  draft: CardDraftState & CardDraftActions
}

export function HighlightEditor({ draft }: HighlightEditorProps): ReactElement {
  const {
    mode,
    paragraph,
    draftText,
    answers,
    orphaned,
    setMode,
    setDraftText,
    commitParagraph,
    addHighlight,
    removeHighlight,
    setAltAnswers,
    dismissOrphans,
  } = draft

  const [message, setMessage] = useState<string | null>(null)
  const [openOrdinal, setOpenOrdinal] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const length = codePointLength(draftText)
  const overLimit = length > PARAGRAPH_MAX_CODE_POINTS
  const atAnswerLimit = answers.length >= ANSWERS_MAX_PER_CARD

  /**
   * Autosize. Measured from `scrollHeight` after resetting to `auto`, because
   * scrollHeight never shrinks on its own — without the reset, deleting a
   * paragraph leaves the box at its tallest.
   */
  useEffect(() => {
    const node = textareaRef.current
    if (!node || mode !== 'compose') return

    node.style.height = 'auto'
    node.style.height = `${String(node.scrollHeight)}px`
  }, [draftText, mode])

  const onSelect = useCallback(
    (result: SelectionResult) => {
      if (result.ok) {
        if (atAnswerLimit) {
          setMessage(`You have reached the limit of ${String(ANSWERS_MAX_PER_CARD)} blanks.`)
          return
        }

        addHighlight(result.range)
        setMessage(null)

        // The selection has served its purpose. Leaving it up means the next
        // Ctrl/Cmd+H re-fires against the same range and reports an overlap with
        // the blank just created.
        window.getSelection()?.removeAllRanges()
        return
      }

      setMessage(explainRejection(result))
    },
    [addHighlight, atAnswerLimit],
  )

  const toHighlightMode = (): void => {
    commitParagraph()
    setMode('highlight')
    setMessage(null)
  }

  const toComposeMode = (): void => {
    setMode('compose')
    setOpenOrdinal(null)
    setMessage(null)
  }

  const openAnswer = answers.find((answer) => answer.ordinal === openOrdinal)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Editor mode"
          className="inline-flex rounded-md border border-border p-0.5"
        >
          <ModeTab active={mode === 'compose'} onClick={toComposeMode}>
            Write
          </ModeTab>
          <ModeTab
            active={mode === 'highlight'}
            onClick={toHighlightMode}
            disabled={draftText.trim().length === 0 || overLimit}
          >
            Highlight
          </ModeTab>
        </div>

        <p
          className={cn(
            'text-xs tabular-nums',
            overLimit ? 'font-medium text-warning' : 'text-muted-foreground',
          )}
        >
          {length.toLocaleString()} / {PARAGRAPH_MAX_CODE_POINTS.toLocaleString()}
        </p>
      </div>

      {mode === 'compose' ? (
        <div className="space-y-2">
          <label htmlFor="card-paragraph" className="block text-sm font-medium">
            Paragraph
          </label>
          <textarea
            id="card-paragraph"
            ref={textareaRef}
            value={draftText}
            onChange={(event) => {
              setDraftText(event.target.value)
            }}
            // Committing on blur means a user who tabs straight to Save still gets
            // their text normalized and their answers re-anchored.
            onBlur={commitParagraph}
            rows={6}
            aria-invalid={overLimit ? true : undefined}
            aria-describedby="card-paragraph-hint"
            placeholder="Paste or write the paragraph you want to study, then switch to Highlight."
            className={cn(
              'w-full resize-none overflow-hidden rounded-md border border-border bg-background p-4',
              'text-base leading-relaxed placeholder:text-muted-foreground',
              overLimit && 'border-warning',
            )}
          />
          <p id="card-paragraph-hint" className="text-xs text-muted-foreground">
            {answers.length > 0
              ? 'Your existing blanks follow their words as you edit. If you delete a highlighted word, you will be told.'
              : 'Write it the way you want to read it back — the context is what makes recall work.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <HighlightSurface
            paragraph={paragraph}
            answers={answers}
            onSelect={onSelect}
            onOpenHighlight={setOpenOrdinal}
            onRemoveHighlight={(ordinal) => {
              removeHighlight(ordinal)
              // Ordinals renumber on removal, so an open panel would otherwise be
              // showing a different blank than the one the user was editing.
              setOpenOrdinal(null)
            }}
            snap={isTouch()}
          />

          <div aria-live="polite" className="min-h-5">
            {message && <p className="text-sm text-warning">{message}</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            Select words to blank them.{' '}
            <kbd className="rounded border border-border px-1">Ctrl</kbd>/
            <kbd className="rounded border border-border px-1">⌘</kbd>+
            <kbd className="rounded border border-border px-1">H</kbd> also works, and Tab moves
            between blanks.
          </p>
        </div>
      )}

      <OrphanedNotice orphaned={orphaned} onDismiss={dismissOrphans} />

      {openAnswer && (
        <HighlightPopover
          answer={openAnswer}
          onRemove={removeHighlight}
          onChangeAlts={setAltAnswers}
          onClose={() => {
            setOpenOrdinal(null)
          }}
        />
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Preview
          <span className="ml-2 font-normal text-muted-foreground">
            {answers.length === 0
              ? 'no blanks yet'
              : `${String(answers.length)} ${answers.length === 1 ? 'blank' : 'blanks'}`}
          </span>
        </h3>
        <ClozePreview paragraph={paragraph} answers={answers} />
      </section>
    </div>
  )
}

interface ModeTabProps {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ModeTab({ active, disabled, onClick, children }: ModeTabProps): ReactElement {
  return (
    <Button
      role="tab"
      aria-selected={active}
      size="sm"
      variant={active ? 'default' : 'ghost'}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * Whether to snap selections to word boundaries.
 *
 * Touch only. A long-press lands mid-word and dragging handles onto an exact
 * boundary is fiddly, so snapping saves real effort there — but applying it to a
 * mouse or keyboard selection would fight a user who deliberately highlighted a
 * prefix, and "bio" in "biology" is a legitimate answer.
 */
function isTouch(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

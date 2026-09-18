import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  ANSWERS_MAX_PER_CARD,
  codePointLength,
  PARAGRAPH_MAX_CODE_POINTS,
  sliceCodePoints,
} from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { AlertIcon } from '@/components/ui/icons'
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
  showPreview?: boolean
}

export function HighlightEditor({ draft, showPreview = true }: HighlightEditorProps): ReactElement {
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
          className="inline-flex gap-1 rounded-full bg-surface-muted p-1"
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
              // Stays a 12px rounded well rather than going pill-shaped: a pill
              // textarea puts its first and last characters inside the curve.
              'w-full resize-none overflow-hidden rounded-md border border-border bg-surface p-4',
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
            snap={true}
          />

          <div aria-live="polite" className="min-h-5">
            {message && (
              // Icon as well as colour: a rejection the user cannot see the colour
              // of still has to read as a rejection.
              <p className="flex items-start gap-1.5 text-sm text-warning">
                <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
                {message}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Select words to blank them.{' '}
            <kbd className="rounded-full bg-surface-muted px-2 py-0.5 font-medium">Ctrl</kbd>/
            <kbd className="rounded-full bg-surface-muted px-2 py-0.5 font-medium">⌘</kbd>+
            <kbd className="rounded-full bg-surface-muted px-2 py-0.5 font-medium">H</kbd> also
            works, and Tab moves between blanks.
          </p>

          {answers.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-surface-muted/30 p-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Answer Options ({answers.length})
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  Click to edit alternatives
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {answers.map((ans) => {
                  const text = sliceCodePoints(paragraph, ans.startOffset, ans.endOffset)
                  return (
                    <div
                      key={ans.ordinal}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2.5 py-1 text-xs shadow-2xs hover:border-primary/50 transition-colors"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground tabular-nums shrink-0">
                        {ans.ordinal + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenOrdinal(ans.ordinal)
                        }}
                        aria-label={`Options for blank ${String(ans.ordinal + 1)}: ${text}`}
                        className="font-medium text-foreground hover:text-primary transition-colors text-left"
                      >
                        {text}
                        {ans.altAnswers.length > 0 && (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            (+{ans.altAnswers.length})
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeHighlight(ans.ordinal)
                        }}
                        aria-label={`Remove blank ${String(ans.ordinal + 1)}: ${text}`}
                        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors text-[11px]"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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

      {showPreview && (
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
      )}
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

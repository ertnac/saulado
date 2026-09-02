import { useRef, useState, type ReactElement } from 'react'
import { enhanceOcrText, type AnswerRange } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { OcrToolbar } from './OcrToolbar'
import { CardHighlightEditor } from './CardHighlightEditor'
import { cn } from '@/lib/utils'

export interface OcrReviewEditorProps {
  initialText: string
  onCommitCards: (cards: { text: string; answers: AnswerRange[] }[]) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function OcrReviewEditor({
  initialText,
  onCommitCards,
  onCancel,
  isSubmitting = false,
}: OcrReviewEditorProps): ReactElement {
  const [text, setText] = useState(initialText)
  const [mode, setMode] = useState<'edit' | 'highlight'>('highlight')
  const [cardAnswers, setCardAnswers] = useState<Record<number, AnswerRange[]>>({})
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: text.length,
    end: text.length,
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Split into card paragraphs on blank lines
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const wordsCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const validCardsCount = paragraphs.filter(
    (_p, index) => (cardAnswers[index] ?? []).length > 0,
  ).length

  const handleInsertSymbol = (symbol: string): void => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? selection.start ?? text.length
    const end = textarea?.selectionEnd ?? selection.end ?? text.length

    const nextText = text.slice(0, start) + symbol + text.slice(end)
    setText(nextText)
    setCardAnswers({}) // Clear blank mappings when text changes

    const nextCursor = start + symbol.length
    setSelection({ start: nextCursor, end: nextCursor })

    setTimeout(() => {
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(nextCursor, nextCursor)
      }
    }, 0)
  }

  const handleAutoClean = (): void => {
    const cleaned = enhanceOcrText(text)
    setText(cleaned)
    setCardAnswers({})
  }

  const handleReset = (): void => {
    setText(initialText)
    setCardAnswers({})
  }

  const handleUpdateAnswers = (index: number, answers: AnswerRange[]): void => {
    setCardAnswers((prev) => ({ ...prev, [index]: answers }))
  }

  const handleCommit = (): void => {
    const cardsToImport = paragraphs
      .map((paragraph, index) => ({
        text: paragraph,
        answers: cardAnswers[index] ?? [],
      }))
      .filter((card) => card.answers.length > 0)

    if (cardsToImport.length > 0) {
      onCommitCards(cardsToImport)
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[85vh] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
      {/* ── Fixed Toolbar at top ── */}
      <OcrToolbar
        mode={mode}
        onModeChange={setMode}
        onInsertSymbol={handleInsertSymbol}
        onAutoClean={handleAutoClean}
        onReset={handleReset}
        disabled={isSubmitting}
        wordCount={wordsCount}
        paragraphCount={paragraphs.length}
      />

      {/* ── Document Page Content ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-muted/20">
        <div className="mx-auto max-w-3xl rounded-xl border border-border/70 bg-surface p-6 sm:p-8 shadow-sm">
          {mode === 'edit' ? (
            <div className="space-y-2">
              <label
                htmlFor="ocr-document-textarea"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block"
              >
                Document Text (Editable)
              </label>
              <textarea
                id="ocr-document-textarea"
                ref={textareaRef}
                value={text}
                disabled={isSubmitting}
                onChange={(e) => {
                  setText(e.target.value)
                  setCardAnswers({})
                }}
                onSelect={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  setSelection({ start: target.selectionStart, end: target.selectionEnd })
                }}
                placeholder="Paste or type document text here. Leave blank lines between questions..."
                rows={16}
                className={cn(
                  'w-full resize-y rounded-lg border border-border bg-surface p-4 font-mono text-sm leading-relaxed text-foreground',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all',
                )}
              />
              <p className="text-xs text-muted-foreground">
                Tip: Separate each question or flashcard paragraph with a blank line. Switch to
                &quot;Highlight Cards&quot; when ready.
              </p>
            </div>
          ) : (
            <CardHighlightEditor
              paragraphs={paragraphs}
              cards={cardAnswers}
              onUpdateAnswers={handleUpdateAnswers}
            />
          )}
        </div>
      </div>

      {/* ── Footer Actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3.5">
        <div className="text-xs text-muted-foreground">
          {validCardsCount > 0 ? (
            <span className="font-medium text-foreground">
              Ready to import <strong>{validCardsCount}</strong>{' '}
              {validCardsCount === 1 ? 'card' : 'cards'} with highlights.
            </span>
          ) : (
            <span>Highlight at least one word in any paragraph to create a card.</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled={isSubmitting} onClick={onCancel}>
            Cancel
          </Button>

          <Button
            variant="default"
            disabled={isSubmitting || validCardsCount === 0}
            onClick={handleCommit}
            className="px-6"
          >
            {isSubmitting
              ? 'Saving Cards…'
              : `Import ${String(validCardsCount)} ${validCardsCount === 1 ? 'Card' : 'Cards'}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

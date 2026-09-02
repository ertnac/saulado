import { useState, type ReactElement } from 'react'
import {
  ANSWERS_MAX_PER_CARD,
  assignOrdinals,
  createAnswer,
  type AnswerRange,
} from '@saulado/shared'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { CloseIcon } from '@/components/ui/icons'
import { HighlightSurface } from '../HighlightSurface'
import type { EditorAnswer } from '../useCardDraft'
import { type SelectionResult } from '@/lib/selection'

export interface ParagraphCardDraft {
  paragraph: string
  answers: AnswerRange[]
}

export interface CardHighlightEditorProps {
  paragraphs: string[]
  cards: Record<number, AnswerRange[]>
  onUpdateAnswers: (index: number, answers: AnswerRange[]) => void
}

export function CardHighlightEditor({
  paragraphs,
  cards,
  onUpdateAnswers,
}: CardHighlightEditorProps): ReactElement {
  const [activePopover, setActivePopover] = useState<{
    paragraphIndex: number
    ordinal: number
  } | null>(null)
  const [rejections, setRejections] = useState<Record<number, string>>({})

  const handleSelect = (index: number, paragraphText: string, result: SelectionResult): void => {
    if (!result.ok) {
      if (result.reason !== 'no-selection' && result.reason !== 'collapsed') {
        const msg =
          result.reason === 'outside'
            ? 'Select inside the paragraph text.'
            : result.reason === 'whitespace'
              ? 'Select at least one word.'
              : result.reason === 'overlap'
                ? 'Blanks cannot overlap.'
                : 'Could not create blank.'
        setRejections((prev) => ({ ...prev, [index]: msg }))
      }
      return
    }

    setRejections((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })

    const current = cards[index] ?? []
    if (current.length >= ANSWERS_MAX_PER_CARD) {
      setRejections((prev) => ({
        ...prev,
        [index]: `Maximum of ${String(ANSWERS_MAX_PER_CARD)} blanks per card.`,
      }))
      return
    }

    const answer = createAnswer(paragraphText, result.range.startOffset, result.range.endOffset)
    onUpdateAnswers(index, [...current, answer])
  }

  const handleRemove = (index: number, ordinal: number): void => {
    const current = cards[index] ?? []
    const assigned = assignOrdinals(current)
    const target = assigned.find((a) => a.ordinal === ordinal)
    if (!target) return

    onUpdateAnswers(
      index,
      current.filter((a) => a.startOffset !== target.startOffset),
    )
    if (activePopover?.paragraphIndex === index && activePopover.ordinal === ordinal) {
      setActivePopover(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-muted/50 p-3.5 border border-border/50 text-xs text-muted-foreground">
        💡 <strong>How to create cards:</strong> Drag your mouse or finger across the key words in
        each paragraph below to turn them into study blanks. Paragraphs with at least 1 blank will
        be imported into your study set.
      </div>

      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => {
          const currentAnswers = cards[index] ?? []
          const assigned: EditorAnswer[] = assignOrdinals(currentAnswers).map((a) => ({
            ...a,
            id: `temp-${String(a.ordinal)}`,
            status: 'saved',
          }))

          const blankCount = currentAnswers.length
          const rejection = rejections[index]

          return (
            <Card
              key={`${index}-${paragraph.slice(0, 20)}`}
              className="overflow-hidden border border-border/80 p-4 sm:p-5 transition-shadow hover:shadow-soft"
            >
              {/* Header */}
              <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Card Paragraph #{index + 1}
                </span>

                <div className="flex items-center gap-2">
                  {blankCount > 0 ? (
                    <Badge tone="accent">
                      {blankCount} {blankCount === 1 ? 'blank' : 'blanks'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      No blanks yet (highlight words)
                    </span>
                  )}
                </div>
              </div>

              {/* Surface */}
              <div className="relative leading-relaxed">
                <HighlightSurface
                  paragraph={paragraph}
                  answers={assigned}
                  onSelect={(res) => handleSelect(index, paragraph, res)}
                  onOpenHighlight={(ord) =>
                    setActivePopover({ paragraphIndex: index, ordinal: ord })
                  }
                  onRemoveHighlight={(ord) => handleRemove(index, ord)}
                />
              </div>

              {/* Rejection notice */}
              {rejection && <p className="mt-2 text-xs text-danger">{rejection}</p>}

              {/* Blank Chips List */}
              {assigned.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <span className="text-[11px] font-semibold text-muted-foreground">Blanks:</span>
                  {assigned.map((ans) => (
                    <span
                      key={ans.ordinal}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      <span>
                        {ans.ordinal + 1}. {ans.answerText}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove blank ${ans.answerText}`}
                        onClick={() => handleRemove(index, ans.ordinal)}
                        className="rounded hover:bg-primary/20 p-0.5 text-primary"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

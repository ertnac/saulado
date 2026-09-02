import type { ReactElement } from 'react'
import type { AnsweringType, BlankResult, SessionCard } from '@saulado/shared'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TypeInMode } from './modes/TypeInMode'
import { MultipleChoiceMode } from './modes/MultipleChoiceMode'
import { FlashcardMode } from './modes/FlashcardMode'

export interface StudyCardViewProps {
  card: SessionCard
  values: Record<number, string>
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  answeringType?: AnsweringType
  onChange: (ordinal: number, value: string) => void
  onSubmit: (overrideValues?: Record<number, string>) => void
}

/**
 * The study card view container: delegates rendering to the active answering mode.
 *
 * Supported modes:
 * - `identification`: Type-In cloze slots
 * - `multiple-choice`: A/B/C/D option choice grid
 * - `flashcard`: 3D flip card with self-grading
 */
export function StudyCardView({
  card,
  values,
  results,
  disabled,
  answeringType = 'identification',
  onChange,
  onSubmit,
}: StudyCardViewProps): ReactElement {
  const meta = card.isNew || card.isLeech

  return (
    <Card className="p-5 sm:p-6">
      {/* ── Status Flags ── */}
      {meta && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {card.isNew && <Badge tone="accent">New</Badge>}
          {card.isLeech && <Badge tone="warning">Difficult</Badge>}
        </div>
      )}

      {/* ── Mode Delegation ── */}
      {(() => {
        switch (answeringType) {
          case 'multiple-choice':
            return (
              <MultipleChoiceMode
                card={card}
                values={values}
                results={results}
                disabled={disabled}
                onChange={onChange}
                onSubmit={onSubmit}
              />
            )
          case 'flashcard':
            return (
              <FlashcardMode
                card={card}
                results={results}
                disabled={disabled}
                onSubmit={onSubmit}
              />
            )
          case 'identification':
          default:
            return (
              <TypeInMode
                card={card}
                values={values}
                results={results}
                disabled={disabled}
                onChange={onChange}
                onSubmit={onSubmit}
              />
            )
        }
      })()}
    </Card>
  )
}

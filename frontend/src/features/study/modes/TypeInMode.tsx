import { useEffect, useRef, type ReactElement } from 'react'
import type { BlankResult, SessionCard } from '@saulado/shared'
import { BlankSlot } from '../BlankSlot'

export interface TypeInModeProps {
  card: SessionCard
  values: Record<number, string>
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  onChange: (ordinal: number, value: string) => void
  onSubmit: () => void
}

/**
 * Type-In cloze study mode: renders the paragraph with inline `BlankSlot` inputs.
 */
export function TypeInMode({
  card,
  values,
  results,
  disabled,
  onChange,
  onSubmit,
}: TypeInModeProps): ReactElement {
  const firstBlank = useRef<HTMLInputElement>(null)

  useEffect(() => {
    /**
     * Focus the first blank when the card changes, so a keyboard user can type
     * straight into a new card without tabbing to it.
     */
    if (!results) firstBlank.current?.focus()
  }, [card.cardId, results])

  const byOrdinal = new Map(results?.map((result) => [result.ordinal, result]))

  return (
    <p className="whitespace-pre-wrap text-base leading-loose sm:text-lg">
      {card.segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={`t${String(index)}`}>{segment.text}</span>
        ) : (
          <BlankSlot
            key={`b${String(segment.ordinal)}`}
            ref={segment.ordinal === 0 ? firstBlank : undefined}
            ordinal={segment.ordinal}
            blankCount={card.blankCount}
            answerLength={segment.answerLength}
            value={values[segment.ordinal] ?? ''}
            result={byOrdinal.get(segment.ordinal) ?? null}
            disabled={disabled}
            onChange={(value) => {
              onChange(segment.ordinal, value)
            }}
            onSubmit={onSubmit}
          />
        ),
      )}
    </p>
  )
}

import { useEffect, useRef, type ReactElement } from 'react'
import type { BlankResult, SessionCard } from '@saulado/shared'
import { BlankSlot } from './BlankSlot'

/**
 * The card under review: the paragraph with its blanks as inputs.
 *
 * The paragraph is rendered from `segments`, which is all the server sends — the
 * text *around* the answers. There is no client-side blanking step here, and no
 * `answers` array to accidentally render, which is what makes "the answer is not
 * in the DOM before submission" a property of the wire format rather than a rule
 * this component has to remember to follow.
 *
 * Layout notes that matter for review specifically:
 *
 * - `whitespace-pre-wrap` preserves the paragraph's own spacing and line breaks.
 *   A cloze sentence often depends on them, and collapsing runs of spaces would
 *   silently change the text the user is being asked to recall.
 * - Slots are `align-middle` inline elements inside flowing text, with
 *   `leading-loose` so a 44px input does not overlap the line above it. The
 *   alternative — a separate list of inputs under the paragraph — breaks the
 *   whole premise of contextual recall by divorcing the blank from its sentence.
 */

interface StudyCardViewProps {
  card: SessionCard
  values: Record<number, string>
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  onChange: (ordinal: number, value: string) => void
  onSubmit: () => void
}

export function StudyCardView({
  card,
  values,
  results,
  disabled,
  onChange,
  onSubmit,
}: StudyCardViewProps): ReactElement {
  const firstBlank = useRef<HTMLInputElement>(null)

  useEffect(() => {
    /**
     * Focus the first blank when the card changes, so a keyboard user can type
     * straight into a new card without tabbing to it.
     *
     * Keyed on `cardId` rather than running once: the same component instance is
     * reused for every card in the queue, so a mount-only effect would focus the
     * first card and then never again. Skipped while graded — moving focus back
     * into a disabled input after an answer would strand a screen reader away
     * from the feedback it should be reading.
     */
    if (!results) firstBlank.current?.focus()
  }, [card.cardId, results])

  const byOrdinal = new Map(results?.map((result) => [result.ordinal, result]))

  return (
    <div className="rounded-lg border border-border bg-background p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto min-w-0 text-lg font-semibold tracking-tight">{card.title}</h2>
        {card.isNew && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">New</span>
        )}
        {/*
          Surfaced so the user can act on it — a leech is a card that keeps being
          forgotten, and the fix is usually to rewrite it, not to keep failing it.
        */}
        {card.isLeech && (
          <span className="rounded-full bg-[hsl(var(--warning)/0.15)] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--warning))]">
            Difficult
          </span>
        )}
      </div>

      {card.tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {card.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {/*
        The paragraph is one labelled region rather than a form: the blanks are
        parts of a sentence, and announcing "edit text, blank 1" in isolation
        loses the context that is the entire point of the exercise.
      */}
      <p className="mt-4 whitespace-pre-wrap text-base leading-loose sm:text-lg">
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
    </div>
  )
}

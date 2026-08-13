import { forwardRef, type ReactElement } from 'react'
import type { BlankResult } from '@saulado/shared'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * One blank, as an input before grading and as a verdict after — in the same box.
 *
 * This component is where plan §2.7's "no layout shift on reveal" is actually
 * paid for. The slot's width is set once, from `answerLength`, and never changes:
 * the input, the correct answer and the canonical spelling all render inside a
 * container whose geometry was fixed before the user typed anything.
 *
 * Two invariants make that safe rather than merely hopeful:
 *
 * - `answerLength` is always at least as long as the canonical answer that will
 *   appear here. Under `fixed` mode it is the longest answer on the card; under
 *   `proportional` it is this answer's own length. So the revealed text fits the
 *   reserved width in both modes, and neither mode needs a fallback.
 * - The input and the verdict share `font-mono` at one size, so `Nch` is exactly
 *   N characters for both. In a proportional font `ch` is the width of `0` and
 *   the two would disagree.
 *
 * What the user typed is *not* shown here when it was wrong — the slot shows the
 * canonical spelling, because that is the thing worth reading twice. The wrong
 * submission is echoed in the feedback panel instead, where it can be as long as
 * they made it without stretching the paragraph.
 */

interface BlankSlotProps {
  ordinal: number
  blankCount: number
  answerLength: number
  value: string
  /** `null` until this card is graded. */
  result: BlankResult | null
  disabled: boolean
  onChange: (value: string) => void
  /** Enter anywhere in the card submits it. */
  onSubmit: () => void
}

/**
 * Padding is part of the reserved width, not on top of it.
 *
 * `px-2` on the inner elements plus this on the container means the *text* area
 * is exactly `answerLength` characters wide. Adding padding only to the input
 * would make the graded state a few pixels narrower and shift the line.
 */
const SLOT_PADDING = '1rem'

export const BlankSlot = forwardRef<HTMLInputElement, BlankSlotProps>(function BlankSlot(
  { ordinal, blankCount, answerLength, value, result, disabled, onChange, onSubmit },
  ref,
): ReactElement {
  const width = `calc(${String(answerLength)}ch + ${SLOT_PADDING})`
  const position = `Blank ${String(ordinal + 1)} of ${String(blankCount)}`

  if (result) {
    // `matchType` rather than `correct`: a typo counts as correct but still has to
    // show the canonical form, or the user rehearses their own misspelling.
    const showCanonical = result.matchType !== 'exact'

    return (
      <motion.span
        initial={{ opacity: 0.5, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{ width }}
        className={cn(
          'mx-0.5 inline-flex h-11 items-center overflow-hidden rounded-md border px-2 align-middle',
          'font-mono text-base',
          // Green and red, not green and amber. Amber reads as "nearly", and the
          // one thing a graded blank has to be is unambiguous. Colour never
          // stands alone here: the sr-only text below spells the verdict out,
          // and the feedback panel repeats it with an icon.
          result.correct
            ? 'border-success bg-success/10 text-success'
            : 'border-danger bg-danger/10 text-danger',
        )}
      >
        <span className="sr-only">{`${position}: `}</span>
        <span className="truncate">{showCanonical ? result.canonical : result.submitted}</span>
        <span className="sr-only">
          {result.correct
            ? result.matchType === 'typo'
              ? `, correct — spelled ${result.canonical}`
              : ', correct'
            : `, incorrect — the answer was ${result.canonical}`}
        </span>
      </motion.span>
    )
  }

  return (
    <input
      ref={ref}
      style={{ width }}
      value={value}
      disabled={disabled}
      aria-label={position}
      /*
        Every one of these is off for a recall test. A browser that autocompletes
        the answer, capitalises the first letter of a lowercase term, or offers a
        spelling correction is answering the question for the user.
      */
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="done"
      onChange={(event) => {
        onChange(event.target.value)
      }}
      onKeyDown={(event) => {
        // Shift+Enter is the page's reveal shortcut. Handling it here too would
        // submit the card *and* reveal it on one keypress.
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmit()
        }
      }}
      className={cn(
        'mx-0.5 inline-flex h-11 rounded-md border border-border bg-surface px-2 align-middle',
        'font-mono text-base transition-colors duration-150',
        // The global focus ring offsets against the page; this input sits on a
        // card, so it offsets against the card instead.
        'focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    />
  )
})

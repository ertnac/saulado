import type { AnswerRange, Segment } from '../cloze/types.js'
import type { BlankWidthMode } from '../auth/types.js'
import { renderCloze } from '../cloze/render.js'

/**
 * Sizing blanks for study mode.
 *
 * Plan §2.7 asks for two things that pull against each other:
 *
 * 1. **Fixed width by default** — a blank sized to its answer leaks the answer.
 *    `_____` next to `______________` rules out `photosynthesis` before the user
 *    has thought about it.
 * 2. **Zero layout shift on reveal** — the slot must already be as wide as the
 *    answer that will appear in it, or the paragraph reflows mid-review and the
 *    user loses their place.
 *
 * Sizing every blank to five characters satisfies (1) and breaks (2). Sizing
 * each to its own answer satisfies (2) and breaks (1).
 *
 * The resolution: under `fixed`, every blank **on the same card** is widened to
 * the same width — the longest answer on that card, with a floor of
 * {@link MIN_BLANK_WIDTH}. Within a card no blank can be compared against
 * another, so nothing is leaked about *which* blank is long; and every slot is
 * wide enough for its own answer, so nothing reflows.
 *
 * What remains visible is one number per card — that its longest answer is
 * roughly this long. That is a far weaker signal than per-blank widths, and it
 * is the price of not moving the text under the user's eyes.
 */

/** No blank is narrower than this, so a one-letter answer still reads as a gap. */
export const MIN_BLANK_WIDTH = 5

/**
 * Renders a card for study, with blank widths normalised per {@link BlankWidthMode}.
 *
 * Runs on the **server**. The returned segments are what crosses the wire, so
 * this is also the point where per-blank answer lengths are discarded under the
 * default mode — they are not sent and then ignored, they never leave.
 */
export function toSessionSegments(
  paragraph: string,
  answers: readonly AnswerRange[],
  mode: BlankWidthMode = 'fixed',
): Segment[] {
  const segments = renderCloze(paragraph, answers)

  if (mode === 'proportional') return segments

  const width = fixedBlankWidth(segments)

  return segments.map((segment) =>
    segment.kind === 'blank' ? { ...segment, answerLength: width } : segment,
  )
}

/** The one width every blank on a card shares under `fixed` mode. */
export function fixedBlankWidth(segments: readonly Segment[]): number {
  return segments.reduce(
    (widest, segment) =>
      segment.kind === 'blank' ? Math.max(widest, segment.answerLength) : widest,
    MIN_BLANK_WIDTH,
  )
}

/** How many blanks a rendered card has. */
export function countBlanks(segments: readonly Segment[]): number {
  return segments.reduce((count, segment) => count + (segment.kind === 'blank' ? 1 : 0), 0)
}

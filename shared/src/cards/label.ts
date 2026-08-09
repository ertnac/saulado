import { codePointLength, sliceCodePoints } from '../cloze/codepoints.js'
import { CARD_LABEL_MAX_CODE_POINTS } from './limits.js'

/**
 * The one-line label a card is listed under.
 *
 * Cards have no title — a card is a paragraph with blanks in it, and asking for
 * a second name for it was work with no payoff. Every list that used to print
 * `card.title` prints this instead: the search results, the command palette, the
 * session summary, and the card rows on a set page.
 *
 * It lives in `shared` rather than in the frontend because the backend needs it
 * too (the account export writes a label per card), and because a pure string
 * function that has to be code-point-safe is exactly the kind of thing that
 * deserves its own tests rather than being inlined into a JSX expression.
 */

/** Any run of whitespace, including the newlines a pasted paragraph carries. */
const WHITESPACE = /\s+/g

/**
 * Derives a short label from a paragraph.
 *
 * Collapses whitespace, then truncates to `max` **code points** — not
 * `String.prototype.slice`, which counts UTF-16 units and would cut a surrogate
 * pair in half, emitting a lone surrogate. A paragraph opening with an emoji is
 * not exotic input for a study app, and the failure would be a replacement
 * character in a list rather than anything that throws.
 *
 * Truncation prefers a word boundary, but only when one falls in the last
 * quarter of the budget: breaking at the last space of "supercalifragilistic…"
 * would return an almost-empty label, and a mid-word cut reads better than that.
 *
 * The ellipsis is a single U+2026, appended only when text was actually removed
 * — a label exactly at the limit is complete and must not claim otherwise.
 */
export function cardLabel(paragraph: string, max: number = CARD_LABEL_MAX_CODE_POINTS): string {
  const flat = paragraph.replace(WHITESPACE, ' ').trim()

  if (max <= 0) return ''
  if (codePointLength(flat) <= max) return flat

  const cut = sliceCodePoints(flat, 0, max)

  // `lastIndexOf` on a UTF-16 string is safe here: it searches for a space,
  // which is a single code unit that can never be part of a surrogate pair, so
  // the index it returns is always on a character boundary.
  const lastSpace = cut.lastIndexOf(' ')
  const keepWords =
    lastSpace > 0 && codePointLength(cut.slice(0, lastSpace)) >= Math.floor(max * 0.75)

  const kept = keepWords ? cut.slice(0, lastSpace) : cut

  // Trailing punctuation before an ellipsis reads as a typo ("the CPU,…").
  return `${kept.replace(/[\s,;:.!?—-]+$/, '')}…`
}

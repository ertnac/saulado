import { sliceCodePoints, toCodePoints } from '@saulado/shared'
import type { AnswerRange } from '@saulado/shared'

/**
 * The offset arithmetic behind the highlight surface, with no React in it.
 *
 * `window.getSelection()` does not exist here, so the mobile editor selects by
 * tapping the first and last word of a span (plan §4.1). That turns "where did
 * the user select" into "which code points does this word occupy", which is
 * arithmetic over a string — testable on its own, and identical on both
 * platforms because it never asks the platform anything.
 *
 * Keeping it out of the component is the same split the web editor has, and it
 * matters more here: there is no jsdom to render into, so logic left inside a
 * component is logic that can only be checked by hand on a device.
 *
 * **Every offset in this module is a code point index**, matching what the
 * server stores. `"café".length` is 4 or 5 depending on the encoding and
 * `"👨‍👩‍👧".length` is 8; neither number is what an offset means.
 */

/**
 * A run of the paragraph that is either all word or all whitespace.
 *
 * Whitespace runs are tokens rather than being dropped because the surface
 * renders from this list — dropping them would print the paragraph with no
 * spaces in it. They are simply not tappable.
 */
export interface WordToken {
  text: string
  /** Code point offset this run begins at. Inclusive. */
  start: number
  /** Code point offset this run ends at. Exclusive. */
  end: number
  isWord: boolean
}

/**
 * Splits a paragraph into maximal runs of word and whitespace code points.
 *
 * The word rule is `snapToWordBoundaries`'s, deliberately: a word is a maximal
 * run of non-whitespace, so punctuation attaches to the word it touches. That
 * function is where the web path snaps a loose selection to word edges, and a
 * tokenizer using a *different* rule would mean the same paragraph offers
 * different blanks depending on which client the user opened it in.
 *
 * A consequence worth stating: "bio" cannot be selected out of "biology" here,
 * where the web allows it. Plan §4.1 accepts that for v1.
 */
export function tokenize(paragraph: string): WordToken[] {
  const points = toCodePoints(paragraph)
  const tokens: WordToken[] = []

  let start = 0
  while (start < points.length) {
    const isWord = !/\s/.test(points[start] as string)

    let end = start + 1
    while (end < points.length && !/\s/.test(points[end] as string) === isWord) end += 1

    tokens.push({ text: points.slice(start, end).join(''), start, end, isWord })
    start = end
  }

  return tokens
}

/**
 * The range covering both words, in either tap order.
 *
 * Tapping bottom-then-top has to produce the same blank as top-then-bottom —
 * the user is naming two ends, not a direction. Tapping one word twice gives
 * that word alone, which is how a single-word blank is made.
 */
export function spanBetween(
  a: Pick<WordToken, 'start' | 'end'>,
  b: Pick<WordToken, 'start' | 'end'>,
): { startOffset: number; endOffset: number } {
  return {
    startOffset: Math.min(a.start, b.start),
    endOffset: Math.max(a.end, b.end),
  }
}

/**
 * One run of the rendered paragraph: either plain text or one answer's span.
 *
 * Moved unchanged from `frontend/src/features/cards/HighlightSurface.tsx`.
 */
export interface Piece {
  text: string
  /** `null` for the text between answers. */
  ordinal: number | null
  /** Code point offset this run begins at — a stable React key. */
  start: number
}

/**
 * Slices the paragraph into alternating plain and highlighted runs.
 *
 * `start` is the key rather than the array index because the same word can
 * appear in several runs, and an index key makes React reuse the wrong node when
 * a highlight is removed from the middle of the paragraph.
 */
export function toPieces(
  paragraph: string,
  answers: readonly (AnswerRange & { ordinal: number })[],
): Piece[] {
  const pieces: Piece[] = []
  let cursor = 0

  for (const answer of [...answers].sort((a, b) => a.startOffset - b.startOffset)) {
    // Anything that would rewind the cursor is dropped rather than duplicated.
    // Overlaps are rejected before they get here; if one arrives anyway, losing
    // the highlight is recoverable and printing the text twice is not.
    if (answer.startOffset < cursor) continue

    if (answer.startOffset > cursor) {
      pieces.push({
        text: sliceCodePoints(paragraph, cursor, answer.startOffset),
        ordinal: null,
        start: cursor,
      })
    }

    pieces.push({
      text: sliceCodePoints(paragraph, answer.startOffset, answer.endOffset),
      ordinal: answer.ordinal,
      start: answer.startOffset,
    })

    cursor = answer.endOffset
  }

  const tail = sliceCodePoints(paragraph, cursor)
  if (tail.length > 0) pieces.push({ text: tail, ordinal: null, start: cursor })

  return pieces
}

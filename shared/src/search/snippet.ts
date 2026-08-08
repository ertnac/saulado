import { codePointLength, sliceCodePoints } from '../cloze/codepoints.js'
import { SNIPPET_BROWSE_MAX_CODE_POINTS, SNIPPET_START, SNIPPET_STOP } from './limits.js'
import type { SnippetSegment } from './types.js'

/**
 * Turning `ts_headline` output into renderable segments (plan §6.1).
 *
 * Pure string handling, so it lives in `shared` with tests rather than inline in
 * the route — this is the function standing between a user's pasted paragraph
 * and the DOM, and it deserves to be exercised directly.
 */

/**
 * Parses a delimited headline into alternating matched / unmatched runs.
 *
 * The contract that matters: **the output never contains the delimiters, and
 * the concatenation of every `text` is the headline with the delimiters
 * removed.** Nothing is interpreted, escaped or stripped beyond that — the
 * client renders each segment as a text node, so `<script>` in a segment is
 * five visible characters, exactly as it was in the user's paragraph.
 *
 * Malformed input is treated as text rather than an error. Postgres always
 * emits balanced pairs, but a stray U+E000 inside a user's own paragraph would
 * arrive here unbalanced, and the right answer to that is a slightly odd
 * highlight, not a 500.
 */
export function parseSnippet(headline: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let rest = headline

  const push = (text: string, match: boolean): void => {
    if (text.length === 0) return

    // Merge into the previous run when the flag matches. Adjacent same-flag
    // segments are not wrong, just noise — they would render as two React nodes
    // saying what one could, and they make test assertions read badly.
    const last = segments.at(-1)
    if (last !== undefined && last.match === match) {
      last.text += text
      return
    }

    segments.push({ text, match })
  }

  while (rest.length > 0) {
    const openAt = rest.indexOf(SNIPPET_START)

    if (openAt === -1) {
      push(rest, false)
      break
    }

    const closeAt = rest.indexOf(SNIPPET_STOP, openAt + SNIPPET_START.length)

    if (closeAt === -1) {
      // An opener with no closer. Drop the marker, keep the text — the
      // alternative is rendering an invisible private-use character.
      push(rest.slice(0, openAt), false)
      push(rest.slice(openAt + SNIPPET_START.length), false)
      break
    }

    push(rest.slice(0, openAt), false)
    push(rest.slice(openAt + SNIPPET_START.length, closeAt), true)
    rest = rest.slice(closeAt + SNIPPET_STOP.length)
  }

  return segments
}

/**
 * The opening of a paragraph, as a single unmatched segment.
 *
 * Browse mode has no query to highlight, so there is nothing to centre a window
 * on. Truncation is by code point (see `cloze/codepoints.ts`) — cutting a
 * UTF-16 string at a fixed index splits surrogate pairs and produces a lone
 * surrogate, which renders as a replacement glyph.
 *
 * The cut is pulled back to the last space so the snippet ends on a word rather
 * than mid-syllable, unless that would discard most of it.
 */
export function browseSnippet(paragraph: string): SnippetSegment[] {
  if (paragraph.length === 0) return []

  if (codePointLength(paragraph) <= SNIPPET_BROWSE_MAX_CODE_POINTS) {
    return [{ text: paragraph, match: false }]
  }

  const cut = sliceCodePoints(paragraph, 0, SNIPPET_BROWSE_MAX_CODE_POINTS)
  const lastSpace = cut.lastIndexOf(' ')

  // Only honour the word boundary if it is near the end. A 220-character run
  // with one space at index 4 would otherwise truncate to four characters.
  const text = lastSpace > cut.length * 0.6 ? cut.slice(0, lastSpace) : cut

  return [{ text: `${text}…`, match: false }]
}

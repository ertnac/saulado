import { sliceCodePoints, codePointLength } from './codepoints.js'
import { answerLength } from './answers.js'
import type { AnswerRange, Segment } from './types.js'

/**
 * Turns a paragraph plus its answers into renderable segments.
 *
 * This is the "____" form, derived on every render and never persisted. The
 * output is a flat list rather than a string so the UI can attach input
 * elements, focus handlers, and per-blank state to each blank — a string with
 * underscores in it would have to be re-parsed to do any of that, which is how
 * offset bugs get reintroduced at the view layer.
 *
 * Guarantees, all covered by tests:
 * - Segments appear in document order.
 * - Concatenating every `text` segment with each blank's original answer text
 *   reproduces the paragraph exactly. (See {@link reconstructParagraph}.)
 * - No empty text segments, so the UI never renders a stray empty node.
 *
 * Answers are sorted defensively here. Callers should pass validated, sorted
 * input, but rendering is on the hot path for every card view — a render that
 * throws or scrambles text because of upstream disorder is a far worse failure
 * than a redundant sort.
 */
export function renderCloze(paragraph: string, answers: readonly AnswerRange[]): Segment[] {
  if (answers.length === 0) {
    return paragraph.length > 0 ? [{ kind: 'text', text: paragraph }] : []
  }

  const ordered = [...answers].sort((a, b) => a.startOffset - b.startOffset)
  const segments: Segment[] = []
  let cursor = 0

  ordered.forEach((answer, ordinal) => {
    // Skip anything that would rewind the cursor. Overlapping answers are
    // rejected by validateAnswers; if one reaches here anyway, dropping it
    // preserves the text rather than duplicating a span.
    if (answer.startOffset < cursor) return

    if (answer.startOffset > cursor) {
      segments.push({
        kind: 'text',
        text: sliceCodePoints(paragraph, cursor, answer.startOffset),
      })
    }

    segments.push({
      kind: 'blank',
      ordinal,
      answerLength: answerLength(answer),
    })

    cursor = answer.endOffset
  })

  const totalLength = codePointLength(paragraph)
  if (cursor < totalLength) {
    segments.push({ kind: 'text', text: sliceCodePoints(paragraph, cursor, totalLength) })
  }

  return segments
}

/**
 * Rebuilds the original paragraph from segments plus the answers they came from.
 *
 * Exists to prove the round-trip property in tests, and as the mechanism behind
 * "reveal all" in study mode.
 */
export function reconstructParagraph(
  segments: readonly Segment[],
  answers: readonly AnswerRange[],
): string {
  const ordered = [...answers].sort((a, b) => a.startOffset - b.startOffset)

  return segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.text
      return ordered[segment.ordinal]?.answerText ?? ''
    })
    .join('')
}

/**
 * Renders to a plain string with blanks as underscores. For previews, plain
 * text export, and screen reader summaries — not for the interactive view,
 * which uses {@link renderCloze} directly.
 *
 * `width: 'fixed'` is the default deliberately (plan §2.7): sizing a blank to
 * its answer's length leaks the answer. `_____` versus `______________` is a
 * free hint that measurably degrades recall.
 */
export function renderClozeText(
  paragraph: string,
  answers: readonly AnswerRange[],
  options: { width?: 'fixed' | 'proportional'; placeholder?: string } = {},
): string {
  const { width = 'fixed', placeholder = '_' } = options
  const FIXED_WIDTH = 5

  return renderCloze(paragraph, answers)
    .map((segment) => {
      if (segment.kind === 'text') return segment.text
      const count = width === 'fixed' ? FIXED_WIDTH : Math.max(1, segment.answerLength)
      return placeholder.repeat(count)
    })
    .join('')
}

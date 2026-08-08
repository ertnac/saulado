import { codePointLength, sliceCodePoints, toCodePoints } from './codepoints.js'
import {
  ClozeError,
  type AnswerRange,
  type CardAnswer,
  type ClozeIssue,
  type DraftAnswer,
} from './types.js'

/**
 * Normalizes a paragraph on write.
 *
 * Every stored offset is an index into the *normalized* form, so normalization
 * must happen once, before any answer is created, and never again afterwards.
 * Re-normalizing a paragraph that already has answers would shift offsets out
 * from under them.
 *
 * Three transformations, each for a concrete reason:
 *
 * 1. **NFC.** "café" can be encoded as 4 code points (composed é) or 5
 *    (e + combining acute). They render identically and compare unequal. macOS
 *    filesystems hand out NFD, most keyboards produce NFC — so a paste from
 *    Finder and a typed word would be different strings with different lengths.
 * 2. **CRLF → LF.** Windows and pasted Word content carry `\r\n`. Left alone,
 *    every line ending counts as two code points, so offsets after the first
 *    newline drift by one per line.
 * 3. **Trailing whitespace.** Trimmed per line and at the end, so a stray space
 *    can't sit inside a highlightable range.
 *
 * Leading whitespace is preserved: indentation can be meaningful in the kind of
 * technical notes this app is built for.
 */
export function normalizeParagraph(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\s+$/, '')
}

/** True when the slice is empty or contains nothing but whitespace. */
function isBlankText(s: string): boolean {
  return s.trim().length === 0
}

/**
 * Creates a validated answer from a selection.
 *
 * Throws rather than returning a result type: a caller asking for one specific
 * range either gets a usable answer or has a bug. Bulk validation of an
 * existing set uses {@link validateAnswers}, which collects issues instead.
 *
 * `answerText` is derived here, never accepted from the caller — that's what
 * makes it trustworthy as a corruption tripwire later.
 */
export function createAnswer(
  paragraph: string,
  startOffset: number,
  endOffset: number,
  altAnswers: string[] = [],
): DraftAnswer {
  const length = codePointLength(paragraph)

  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    throw new ClozeError('OUT_OF_BOUNDS', 'Offsets must be integers')
  }

  if (startOffset < 0 || endOffset > length) {
    throw new ClozeError(
      'OUT_OF_BOUNDS',
      `Range [${String(startOffset)}, ${String(endOffset)}) falls outside the paragraph (length ${String(length)})`,
    )
  }

  if (startOffset >= endOffset) {
    throw new ClozeError(
      'EMPTY_RANGE',
      `Range [${String(startOffset)}, ${String(endOffset)}) is empty — start must be less than end`,
    )
  }

  const answerText = sliceCodePoints(paragraph, startOffset, endOffset)

  if (isBlankText(answerText)) {
    throw new ClozeError('WHITESPACE_ONLY', 'An answer cannot be only whitespace')
  }

  return {
    startOffset,
    endOffset,
    answerText,
    altAnswers: altAnswers.filter((alt) => !isBlankText(alt)),
  }
}

/**
 * Checks every invariant from plan §2.1 against a set of answers.
 *
 * Returns all issues rather than the first, so a card with three problems
 * reports three problems. An empty array means the set is safe to persist and
 * to render.
 *
 * The same rules are enforced by DB check constraints — this is the fast,
 * user-facing half of a two-layer guard, not the only one.
 */
export function validateAnswers(paragraph: string, answers: readonly AnswerRange[]): ClozeIssue[] {
  const issues: ClozeIssue[] = []
  const length = codePointLength(paragraph)

  answers.forEach((answer, index) => {
    const { startOffset, endOffset, answerText } = answer

    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
      issues.push({ code: 'OUT_OF_BOUNDS', message: 'Offsets must be integers', index })
      return
    }

    // Invariant 1: 0 <= start < end <= length
    if (startOffset < 0 || endOffset > length) {
      issues.push({
        code: 'OUT_OF_BOUNDS',
        message: `Range [${String(startOffset)}, ${String(endOffset)}) falls outside the paragraph (length ${String(length)})`,
        index,
      })
      return
    }

    if (startOffset >= endOffset) {
      issues.push({
        code: 'EMPTY_RANGE',
        message: `Range [${String(startOffset)}, ${String(endOffset)}) is empty`,
        index,
      })
      return
    }

    const actual = sliceCodePoints(paragraph, startOffset, endOffset)

    // Invariant 4: not pure whitespace
    if (isBlankText(actual)) {
      issues.push({
        code: 'WHITESPACE_ONLY',
        message: 'An answer cannot be only whitespace',
        index,
      })
    }

    // The tripwire. Fires when a paragraph was edited without re-anchoring.
    if (actual !== answerText) {
      issues.push({
        code: 'TEXT_MISMATCH',
        message: `Stored text ${JSON.stringify(answerText)} no longer matches the paragraph at this range (${JSON.stringify(actual)})`,
        index,
      })
    }
  })

  // Invariant 2: no overlaps. Compared on a sorted copy so the check is
  // independent of the caller's ordering — an unsorted input is reported as an
  // ordering issue below, not misdiagnosed as an overlap here.
  const sorted = [...answers]
    .map((answer, index) => ({ answer, index }))
    .sort((a, b) => a.answer.startOffset - b.answer.startOffset)

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (!previous || !current) continue

    // Strict `>`: adjacent ranges that merely touch (prev.end === cur.start) are
    // legal and a real use case — two consecutive words highlighted separately.
    if (previous.answer.endOffset > current.answer.startOffset) {
      issues.push({
        code: 'OVERLAP',
        message: `Overlaps the answer at index ${String(previous.index)}`,
        index: current.index,
      })
    }
  }

  // Invariant 3: stored order matches offset order.
  for (let i = 1; i < answers.length; i += 1) {
    const previous = answers[i - 1]
    const current = answers[i]
    if (!previous || !current) continue

    if (previous.startOffset > current.startOffset) {
      issues.push({
        code: 'ORDINAL_MISMATCH',
        message: 'Answers must be stored sorted by startOffset',
        index: i,
      })
      break
    }
  }

  return issues
}

/**
 * Sorts answers by position and reassigns `ordinal` to match.
 *
 * Ordinals are positional, not identity — the first blank in the paragraph is
 * always ordinal 0, regardless of the order the user highlighted things in.
 */
export function assignOrdinals<T extends AnswerRange>(
  answers: readonly T[],
): (T & { ordinal: number })[] {
  return [...answers]
    .sort((a, b) => a.startOffset - b.startOffset)
    .map((answer, ordinal) => ({ ...answer, ordinal }))
}

/**
 * Type guard: has this answer been persisted (does it carry id and ordinal)?
 */
export function isCardAnswer(answer: AnswerRange): answer is CardAnswer {
  return (
    typeof (answer as Partial<CardAnswer>).id === 'string' &&
    typeof (answer as Partial<CardAnswer>).ordinal === 'number'
  )
}

/**
 * Re-derives `answerText` for every answer from its current range.
 *
 * Repair helper for the case where offsets are known-good but the denormalized
 * text drifted. Do NOT reach for this to silence a `TEXT_MISMATCH` — that issue
 * usually means the *offsets* are wrong, and overwriting the text would destroy
 * the only evidence of what the answer was supposed to be.
 */
export function refreshAnswerText<T extends AnswerRange>(
  paragraph: string,
  answers: readonly T[],
): T[] {
  return answers.map((answer) => ({
    ...answer,
    answerText: sliceCodePoints(paragraph, answer.startOffset, answer.endOffset),
  }))
}

/** Code points spanned by an answer. */
export function answerLength(answer: AnswerRange): number {
  return answer.endOffset - answer.startOffset
}

/**
 * True when the two ranges share at least one character.
 *
 * Half-open intervals, so `[4,7)` and `[7,10)` are adjacent rather than
 * overlapping — highlighting two neighbouring words has to be allowed.
 *
 * Typed on the offsets alone rather than on a full {@link AnswerRange}: the
 * editor needs this to vet a *candidate* selection, which has no `answerText`
 * yet — that is derived only once the range is known to be usable. Every
 * `AnswerRange` still satisfies the narrower shape.
 */
export function rangesOverlap(
  a: Pick<AnswerRange, 'startOffset' | 'endOffset'>,
  b: Pick<AnswerRange, 'startOffset' | 'endOffset'>,
): boolean {
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset
}

/**
 * Finds the answer containing a code point index, if any.
 * Used by the editor to detect a click landing on an existing highlight.
 */
export function answerAtOffset<T extends AnswerRange>(
  answers: readonly T[],
  offset: number,
): T | undefined {
  return answers.find((answer) => offset >= answer.startOffset && offset < answer.endOffset)
}

/**
 * Expands a range outward to the nearest word boundaries.
 *
 * Touch selection is imprecise — a long-press typically lands mid-word. Without
 * snapping, the user gets "Perte" from "HyperText" and has to fight the handles.
 * The editor calls this before {@link createAnswer}.
 *
 * Whitespace-only selections are returned unchanged, so the caller still gets a
 * `WHITESPACE_ONLY` rejection rather than having a neighbouring word silently
 * pulled in.
 */
export function snapToWordBoundaries(
  paragraph: string,
  startOffset: number,
  endOffset: number,
): { startOffset: number; endOffset: number } {
  const points = toCodePoints(paragraph)
  const isWordChar = (c: string | undefined): boolean => c !== undefined && /[^\s]/.test(c)

  let start = Math.max(0, Math.min(startOffset, points.length))
  let end = Math.max(start, Math.min(endOffset, points.length))

  if (isBlankText(points.slice(start, end).join(''))) {
    return { startOffset, endOffset }
  }

  while (start > 0 && isWordChar(points[start - 1])) start -= 1
  while (end < points.length && isWordChar(points[end])) end += 1

  return { startOffset: start, endOffset: end }
}

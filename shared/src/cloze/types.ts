/**
 * Types for the cloze engine.
 *
 * The offset model (plan §2.1): the paragraph is immutable plain text, and
 * answers are character ranges into it. The rendered "____" form is derived at
 * display time and never persisted — baking blanks into stored text makes the
 * original paragraph unrecoverable and makes editing a highlight destructive.
 */

/**
 * The minimum an answer needs for the engine to operate on it.
 *
 * Deliberately excludes `id` and `ordinal`: those are assigned at persistence,
 * and the engine must work on unsaved drafts coming out of the editor. Every
 * function here is generic over this shape, so it accepts both a draft and a
 * fully persisted `CardAnswer`.
 *
 * Offsets are **Unicode code point** indices, not UTF-16 units. See
 * `./codepoints.ts` for why that distinction is load-bearing.
 */
export interface AnswerRange {
  /** Inclusive. Code point index into the paragraph. */
  startOffset: number
  /** Exclusive. Code point index into the paragraph. */
  endOffset: number
  /**
   * Denormalized copy of the spanned text.
   *
   * This is deliberate redundancy (plan §2.1): it is both the validation
   * payload and a corruption tripwire. If it stops matching the slice it points
   * at, the paragraph was edited without reconciling its answers.
   */
  answerText: string
  /** Additional accepted spellings. Empty is the common case. */
  altAnswers: string[]
}

/** An answer produced by the editor but not yet persisted. */
export type DraftAnswer = AnswerRange

/** An answer as stored. `ordinal` always matches ascending `startOffset` order. */
export interface CardAnswer extends AnswerRange {
  id: string
  /** 0-based position among the card's answers, ordered by `startOffset`. */
  ordinal: number
}

/**
 * A piece of a rendered cloze. Derived, never persisted.
 *
 * `answerLength` is exposed so the UI can reserve exactly the width the revealed
 * answer will occupy — otherwise the paragraph reflows on reveal and the reader
 * loses their place (plan §2.7). Note that reserving space is not the same as
 * *sizing the blank to the answer*, which leaks the answer as a free hint; the
 * default width mode is fixed, and this value is what makes the reveal stable.
 */
export type Segment =
  { kind: 'text'; text: string } | { kind: 'blank'; ordinal: number; answerLength: number }

export type ClozeIssueCode =
  /** Range falls outside the paragraph, or start >= end. */
  | 'OUT_OF_BOUNDS'
  /** Range is empty after slicing. */
  | 'EMPTY_RANGE'
  /** Range contains only whitespace — invariant 4. */
  | 'WHITESPACE_ONLY'
  /** Two answers claim overlapping characters — invariant 2. */
  | 'OVERLAP'
  /** `answerText` no longer matches the slice it points at. */
  | 'TEXT_MISMATCH'
  /** Answers are out of order, or `ordinal` disagrees with position — invariant 3. */
  | 'ORDINAL_MISMATCH'

/**
 * A validation failure. Returned as a list rather than thrown so the UI can
 * surface every problem on a card at once instead of one per save attempt.
 */
export interface ClozeIssue {
  code: ClozeIssueCode
  message: string
  /** Index into the answers array, or -1 when the issue is paragraph-level. */
  index: number
}

/** Thrown by the single-range helpers, where a failure is programmer error. */
export class ClozeError extends Error {
  readonly code: ClozeIssueCode

  constructor(code: ClozeIssueCode, message: string) {
    super(message)
    this.name = 'ClozeError'
    this.code = code
  }
}

/** Outcome of re-anchoring answers onto an edited paragraph. */
export interface ReanchorResult<T extends AnswerRange> {
  /** Answers relocated successfully, offsets rewritten to the new paragraph. */
  matched: T[]
  /**
   * Answers whose text could no longer be found. Never silently dropped —
   * the user is asked to re-highlight or delete them (plan §2.1).
   */
  orphaned: T[]
}

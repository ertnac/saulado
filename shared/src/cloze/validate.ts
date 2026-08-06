import { codePointLength } from './codepoints.js'
import { levenshtein } from './levenshtein.js'
import type { AnswerCheck, AnswerRange, CheckOptions, Grade, MatchType } from './types.js'

/**
 * Normalizes a submitted answer and a stored answer to a comparable form
 * (plan §2.5).
 *
 * Applied to *both* sides, always. Comparing a normalized input against a raw
 * stored answer is a bug that only shows up for users whose keyboards produce
 * different bytes than the author's did.
 *
 * Unlike `normalizeParagraph`, this is lossy and is never persisted — it exists
 * only to decide equality. Lowercasing here is why "cpu" is accepted for "CPU";
 * the canonical spelling is always what gets displayed back.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'") // smart single quotes → straight
    .replace(/[“”]/g, '"') // smart double quotes → straight
    .replace(/\s+/g, ' ')
}

/**
 * Edit-distance budget for an answer of the given length.
 *
 * `min(2, floor(len / 6))` (plan §2.5). The scaling matters more than the cap:
 * with a flat threshold of 2, "CPU" would accept "cat", and "RAM" would accept
 * "run" — the answer would be unlearnable. Short answers get zero tolerance and
 * must be typed exactly.
 */
export function typoThreshold(normalizedLength: number): number {
  return Math.min(2, Math.floor(normalizedLength / 6))
}

/**
 * Walks the validation ladder and stops at the first hit (plan §2.5).
 *
 * Order is load-bearing: an input that exactly matches an alternative must be
 * reported as `alternative`, not as a `typo` against the primary answer, or the
 * UI "corrects" the user's perfectly valid spelling.
 */
export function checkAnswer(
  input: string,
  answer: Pick<AnswerRange, 'answerText' | 'altAnswers'>,
  options: CheckOptions = {},
): AnswerCheck {
  const { typoTolerance = true } = options

  const normalizedInput = normalize(input)
  const normalizedAnswer = normalize(answer.answerText)

  // An empty submission is never correct — not even against an empty answer,
  // which validateAnswers rejects anyway. Skipping a blank is not answering it.
  if (normalizedInput.length === 0) {
    return { correct: false, matchType: 'wrong', canonical: answer.answerText }
  }

  // 1. Exact
  if (normalizedInput === normalizedAnswer) {
    return { correct: true, matchType: 'exact', canonical: answer.answerText }
  }

  // 2. Alternative
  for (const alt of answer.altAnswers) {
    if (normalize(alt) === normalizedInput) {
      return { correct: true, matchType: 'alternative', canonical: alt }
    }
  }

  // 3. Typo, against the primary answer and every alternative
  if (typoTolerance) {
    for (const candidate of [answer.answerText, ...answer.altAnswers]) {
      const normalizedCandidate = normalize(candidate)
      const threshold = typoThreshold(codePointLength(normalizedCandidate))
      if (threshold === 0) continue

      if (levenshtein(normalizedInput, normalizedCandidate, threshold) <= threshold) {
        // Canonical is always the primary answer here: a near-miss on an
        // alternative should still teach the spelling the card was built around.
        return { correct: true, matchType: 'typo', canonical: answer.answerText }
      }
    }
  }

  // 4. Wrong
  return { correct: false, matchType: 'wrong', canonical: answer.answerText }
}

/** Checks every blank on a card, in ordinal order. */
export function checkAnswers(
  inputs: readonly string[],
  answers: readonly Pick<AnswerRange, 'answerText' | 'altAnswers'>[],
  options: CheckOptions = {},
): AnswerCheck[] {
  return answers.map((answer, index) => checkAnswer(inputs[index] ?? '', answer, options))
}

/**
 * Grades a whole card from its per-blank results (plan §2.5).
 *
 * all correct → `good`, some correct → `hard`, none correct → `again`.
 *
 * `easy` is deliberately not derivable from correctness — it means "I knew this
 * instantly," which only the user can report. It stays available in the `Grade`
 * union for a self-rating control, and is never inferred here.
 *
 * A card with no blanks grades `again` rather than `good`: an empty card is
 * broken data, and rewarding it would push it out to a long interval where the
 * user would never see the problem.
 */
export function gradeCard(results: readonly Pick<AnswerCheck, 'correct'>[]): Grade {
  if (results.length === 0) return 'again'

  const correct = results.filter((result) => result.correct).length

  if (correct === results.length) return 'good'
  if (correct === 0) return 'again'
  return 'hard'
}

/** True when every blank on the card was answered correctly. */
export function isCardCorrect(results: readonly Pick<AnswerCheck, 'correct'>[]): boolean {
  return results.length > 0 && results.every((result) => result.correct)
}

/** Human-readable reason for a match, for the reveal UI. */
export function describeMatch(matchType: MatchType): string {
  switch (matchType) {
    case 'exact':
      return 'Correct'
    case 'alternative':
      return 'Correct — accepted alternative'
    case 'typo':
      return 'Correct — check the spelling'
    case 'wrong':
      return 'Incorrect'
  }
}

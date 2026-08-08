import type { Grade } from '../cloze/types.js'

/**
 * The grade wire/storage codec.
 *
 * `reviews.grade` is a `SMALLINT` (plan §2.2) while every line of application
 * code speaks in `Grade` strings. Something has to translate, and the risk in a
 * numeric encoding is that the mapping gets re-derived from memory at each call
 * site — `again` is 0 in one file and 1 in another, and the corruption is
 * invisible because both are valid grades that produce plausible intervals.
 *
 * So the mapping is written down once, here, and the reverse is derived from
 * the forward map rather than typed out a second time. Two hand-written tables
 * can disagree; one cannot disagree with itself.
 *
 * The numbers are also *ordered by how well the card went*, which is what makes
 * `AVG(grade)` and `WHERE grade = 0` meaningful in the analytics Phase 6 adds.
 * Reordering them would silently rewrite the meaning of every stored row.
 */

export const GRADE_CODES = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
} as const satisfies Record<Grade, number>

export type GradeCode = (typeof GRADE_CODES)[Grade]

const BY_CODE = new Map<number, Grade>(
  Object.entries(GRADE_CODES).map(([grade, code]) => [code, grade as Grade]),
)

export function gradeToCode(grade: Grade): GradeCode {
  return GRADE_CODES[grade]
}

/**
 * Returns `null` for anything unrecognised rather than throwing or defaulting.
 *
 * Defaulting to `again` would be the dangerous choice: a row that failed to
 * decode would look like a genuine failure and drag the card's schedule down
 * with it. A `null` forces the caller to decide what a corrupt row means.
 */
export function codeToGrade(code: number): Grade | null {
  return BY_CODE.get(code) ?? null
}

/** Type guard for values arriving from the database or the wire. */
export function isGradeCode(value: number): value is GradeCode {
  return BY_CODE.has(value)
}

/**
 * Ordered worst-to-best. Used for the self-report buttons, which must appear in
 * this order for the same reason the codes are ordered: users read left-to-right
 * as "how badly did that go".
 */
export const GRADES: readonly Grade[] = ['again', 'hard', 'good', 'easy']

/** Short labels for the self-report control. */
export const GRADE_LABELS: Record<Grade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
}

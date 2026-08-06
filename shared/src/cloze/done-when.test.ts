/**
 * The Phase 1 acceptance criterion, executable.
 *
 * The plan states it as a manual check: "you can paste the CPU/RAM example into
 * a Node REPL and get two independently gradeable blanks." A criterion verified
 * by hand once is a criterion nobody re-runs, so it lives here instead — the
 * same walkthrough, asserted, wired into CI.
 *
 * This is the only test file that reaches across modules on purpose. Everything
 * else unit-tests one file; this traces the whole path a real card takes:
 * paragraph in → offsets → render → grade → schedule.
 */

import { describe, expect, it } from 'vitest'
import {
  assignOrdinals,
  checkAnswers,
  createAnswer,
  gradeCard,
  normalizeParagraph,
  renderClozeText,
  validateAnswers,
} from './index.js'
import { calculateNextReview } from '../scheduler/sm2.js'

// Verbatim from the objectives doc.
const RAW = 'The CPU is the brain of the computer, and RAM provides temporary storage.'

/** The card-creation path, exactly as the editor will call it. */
function buildCard(raw: string, ranges: readonly [number, number][]) {
  const paragraph = normalizeParagraph(raw)
  const answers = assignOrdinals(ranges.map(([from, to]) => createAnswer(paragraph, from, to)))
  const issues = validateAnswers(paragraph, answers)

  if (issues.length > 0) throw new Error(`unexpected issues: ${JSON.stringify(issues)}`)
  return { paragraph, answers }
}

describe('Phase 1 done-when: the CPU/RAM example', () => {
  const { paragraph, answers } = buildCard(RAW, [
    [4, 7], // CPU
    [42, 45], // RAM
  ])

  it('yields exactly two blanks, ordered as they appear', () => {
    expect(answers).toHaveLength(2)
    expect(answers.map((a) => a.answerText)).toEqual(['CPU', 'RAM'])
    expect(answers.map((a) => a.ordinal)).toEqual([0, 1])
  })

  it('renders both blanks at equal width, leaking no length hint', () => {
    expect(renderClozeText(paragraph, answers)).toBe(
      'The _____ is the brain of the computer, and _____ provides temporary storage.',
    )
  })

  it('keeps the original paragraph intact — the blanks are derived, not stored', () => {
    expect(paragraph).toBe(RAW)
  })

  describe('grades each blank independently', () => {
    it('both right → good', () => {
      const results = checkAnswers(['CPU', 'RAM'], answers)

      expect(results.map((r) => r.correct)).toEqual([true, true])
      expect(gradeCard(results)).toBe('good')
    })

    it('first right, second wrong → hard, and says which one missed', () => {
      const results = checkAnswers(['CPU', 'ROM'], answers)

      expect(results.map((r) => r.correct)).toEqual([true, false])
      expect(gradeCard(results)).toBe('hard')
    })

    it('second right, first wrong → the failure does not bleed across blanks', () => {
      const results = checkAnswers(['GPU', 'RAM'], answers)

      expect(results.map((r) => r.correct)).toEqual([false, true])
      expect(gradeCard(results)).toBe('hard')
    })

    it('both wrong → again', () => {
      expect(gradeCard(checkAnswers(['GPU', 'ROM'], answers))).toBe('again')
    })

    it('accepts case and whitespace variation, reporting how it matched', () => {
      const results = checkAnswers(['  cpu  ', 'ram'], answers)

      expect(results.map((r) => r.correct)).toEqual([true, true])
      expect(results.map((r) => r.matchType)).toEqual(['exact', 'exact'])
    })

    it('leaves a blank empty rather than crediting a skipped answer', () => {
      const results = checkAnswers(['CPU'], answers)

      expect(results).toHaveLength(2)
      expect(results[1]?.correct).toBe(false)
    })
  })

  it('feeds its grade into a schedule — the end of the Phase 1 path', () => {
    const grade = gradeCard(checkAnswers(['CPU', 'RAM'], answers))
    const outcome = calculateNextReview(grade, undefined, {
      now: new Date('2026-01-15T10:00:00.000Z'),
      fuzz: false,
    })

    expect(outcome.interval).toBe(1)
    expect(outcome.repetitions).toBe(1)
    expect(outcome.dueDate.toISOString()).toBe('2026-01-16T10:00:00.000Z')
  })

  it('sends a failed card back to tomorrow', () => {
    const grade = gradeCard(checkAnswers(['GPU', 'ROM'], answers))
    const outcome = calculateNextReview(grade, undefined, {
      now: new Date('2026-01-15T10:00:00.000Z'),
      fuzz: false,
    })

    expect(grade).toBe('again')
    expect(outcome.interval).toBe(1)
    expect(outcome.lapses).toBe(1)
  })
})

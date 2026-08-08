import { describe, expect, it } from 'vitest'
import type { Grade } from '../cloze/types.js'
import { createAnswer } from '../cloze/answers.js'
import { codeToGrade, GRADE_CODES, GRADES, gradeToCode, isGradeCode } from './grades.js'
import {
  compareDue,
  interleaveNew,
  NEW_CARD_INTERLEAVE,
  requeuePosition,
  type QueueEntry,
} from './queue.js'
import { countBlanks, fixedBlankWidth, MIN_BLANK_WIDTH, toSessionSegments } from './session-card.js'

describe('the grade codec', () => {
  it('round-trips every grade', () => {
    for (const grade of GRADES) {
      expect(codeToGrade(gradeToCode(grade))).toBe(grade)
    }
  })

  it('orders codes by how well the card went', () => {
    // `AVG(grade)` and `WHERE grade = 0` in Phase 6's analytics depend on this.
    // Reordering the constants would silently rewrite every stored row.
    expect(GRADE_CODES.again).toBeLessThan(GRADE_CODES.hard)
    expect(GRADE_CODES.hard).toBeLessThan(GRADE_CODES.good)
    expect(GRADE_CODES.good).toBeLessThan(GRADE_CODES.easy)
  })

  it('returns null for a code it does not recognise', () => {
    // Not `again`: a row that failed to decode would look like a real failure
    // and drag the card's schedule down with it.
    expect(codeToGrade(4)).toBeNull()
    expect(codeToGrade(-1)).toBeNull()
    expect(codeToGrade(1.5)).toBeNull()
    expect(isGradeCode(4)).toBe(false)
    expect(isGradeCode(0)).toBe(true)
  })

  it('covers every grade in the union', () => {
    // If a fifth grade is ever added, this fails rather than letting it fall
    // through the codec as `undefined`.
    const grades: Grade[] = ['again', 'hard', 'good', 'easy']
    expect([...GRADES].sort()).toEqual([...grades].sort())
  })
})

describe('rendering a card for a session', () => {
  const PARAGRAPH = 'The CPU runs the program and photosynthesis feeds the plant'
  const answers = [
    createAnswer(PARAGRAPH, 4, 7), // CPU
    createAnswer(PARAGRAPH, 26, 40), // photosynthesis
  ]

  it('gives every blank on a card the same width under fixed mode', () => {
    // The leak this exists to close: `_____` beside `______________` rules out
    // `photosynthesis` before the user has thought about it.
    const segments = toSessionSegments(PARAGRAPH, answers, 'fixed')
    const widths = segments.filter((s) => s.kind === 'blank').map((s) => s.answerLength)

    expect(widths).toEqual([14, 14])
  })

  it('reserves enough room that nothing reflows on reveal', () => {
    // The other half of §2.7: the slot must already fit the longest answer, or
    // the paragraph moves under the user mid-review.
    const segments = toSessionSegments(PARAGRAPH, answers, 'fixed')
    const width = fixedBlankWidth(segments)

    expect(width).toBeGreaterThanOrEqual('photosynthesis'.length)
  })

  it('never renders a blank narrower than the minimum', () => {
    const short = 'A cat sat'
    const segments = toSessionSegments(short, [createAnswer(short, 2, 5)], 'fixed')

    expect(segments.filter((s) => s.kind === 'blank')[0]?.answerLength).toBe(MIN_BLANK_WIDTH)
  })

  it('keeps true lengths when the user opted into proportional', () => {
    const segments = toSessionSegments(PARAGRAPH, answers, 'proportional')
    const widths = segments.filter((s) => s.kind === 'blank').map((s) => s.answerLength)

    expect(widths).toEqual([3, 14])
  })

  it('never puts answer text in a segment', () => {
    // The whole reason SessionCard is not StudyCard: grading is server-side, so
    // nothing here may let a reader in devtools recover the answers.
    const text = toSessionSegments(PARAGRAPH, answers)
      .filter((s) => s.kind === 'text')
      .map((s) => s.text)
      .join('')

    expect(text).not.toContain('CPU')
    expect(text).not.toContain('photosynthesis')
  })

  it('counts blanks', () => {
    expect(countBlanks(toSessionSegments(PARAGRAPH, answers))).toBe(2)
    expect(countBlanks(toSessionSegments(PARAGRAPH, []))).toBe(0)
  })
})

describe('ordering the due queue', () => {
  function entry(cardId: string, dueAt: string | null, lapses = 0): QueueEntry {
    return { cardId, dueAt: dueAt === null ? null : new Date(dueAt), lapses }
  }

  it('puts the most overdue card first', () => {
    const queue = [
      entry('c', '2026-08-08'),
      entry('a', '2026-08-01'),
      entry('b', '2026-08-05'),
    ].sort(compareDue)

    expect(queue.map((e) => e.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a same-day tie by lapses, worst first', () => {
    // Most due cards share a due_at, so without this the order is whatever
    // Postgres happens to return — and the cards the user keeps forgetting are
    // the ones that most need the attention left before the session is dropped.
    const queue = [
      entry('easy', '2026-08-08', 0),
      entry('leech', '2026-08-08', 9),
      entry('shaky', '2026-08-08', 3),
    ].sort(compareDue)

    expect(queue.map((e) => e.cardId)).toEqual(['leech', 'shaky', 'easy'])
  })

  it('is a total order, so resuming a session cannot reshuffle it', () => {
    const queue = [entry('b', '2026-08-08'), entry('a', '2026-08-08')].sort(compareDue)
    expect(queue.map((e) => e.cardId)).toEqual(['a', 'b'])
  })
})

describe('interleaving new cards', () => {
  const due = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8']
  const fresh = ['n1', 'n2']

  it('opens on a familiar card, then weaves new ones in', () => {
    // Opening on an unseen card makes the session feel like work before the
    // user has any momentum.
    expect(interleaveNew(due, fresh)).toEqual([
      'd1',
      'd2',
      'd3',
      'd4',
      'n1',
      'd5',
      'd6',
      'd7',
      'd8',
      'n2',
    ])
  })

  it('keeps roughly one new card per four reviews', () => {
    expect(NEW_CARD_INTERLEAVE).toBe(4)
  })

  it('is all new on a first-ever session', () => {
    expect(interleaveNew([], fresh)).toEqual(fresh)
  })

  it('is all reviews on a backlog day', () => {
    expect(interleaveNew(due, [])).toEqual(due)
  })

  it('loses nothing when new cards outnumber due ones', () => {
    const many = ['n1', 'n2', 'n3', 'n4', 'n5']
    const queue = interleaveNew(['d1'], many)

    expect(queue).toHaveLength(6)
    expect([...queue].sort()).toEqual([...['d1', ...many]].sort())
  })
})

describe('re-queueing a failed card', () => {
  it('puts it far enough back to have forgotten the reveal', () => {
    // Not the front: re-showing a card the user just failed tests short-term
    // memory, and the "correct" answer that follows is worth nothing.
    expect(requeuePosition(0, 20)).toBe(5)
    expect(requeuePosition(3, 20)).toBe(8)
  })

  it('lands at the end when the session is nearly over', () => {
    expect(requeuePosition(8, 10)).toBe(10)
    expect(requeuePosition(0, 2)).toBe(2)
  })
})

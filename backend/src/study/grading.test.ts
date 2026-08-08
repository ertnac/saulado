import { describe, expect, it } from 'vitest'
import { gradeSubmission } from './grading.js'

/**
 * The pure half of grading.
 *
 * `submitAnswer` needs a database; `gradeSubmission` is where the decisions that
 * would be wrong *silently* live — aligning submissions to blanks, and what a
 * reveal counts as. Those are worth pinning without a transaction around them.
 */

const answers = [
  { ordinal: 0, answerText: 'CPU', altAnswers: ['processor'] },
  { ordinal: 1, answerText: 'photosynthesis', altAnswers: [] },
]

const submit = (blanks: { ordinal: number; submitted: string }[], revealed = false) =>
  gradeSubmission(answers, { blanks, revealed }, true)

describe('gradeSubmission', () => {
  it('grades a fully correct card good', () => {
    const result = submit([
      { ordinal: 0, submitted: 'CPU' },
      { ordinal: 1, submitted: 'photosynthesis' },
    ])

    expect(result.grade).toBe('good')
    expect(result.correct).toBe(true)
  })

  it('grades a partially correct card hard, not correct', () => {
    const result = submit([
      { ordinal: 0, submitted: 'CPU' },
      { ordinal: 1, submitted: 'respiration' },
    ])

    expect(result.grade).toBe('hard')
    // "Correct" means the whole card. A half-right card that counted toward
    // accuracy would make the dashboard flattering rather than useful.
    expect(result.correct).toBe(false)
  })

  it('grades an all-wrong card again', () => {
    const result = submit([
      { ordinal: 0, submitted: 'GPU' },
      { ordinal: 1, submitted: 'respiration' },
    ])

    expect(result.grade).toBe('again')
  })

  it('matches submissions by ordinal, not array position', () => {
    /**
     * The bug this exists to catch. A client that sends blanks out of order
     * would otherwise have "CPU" checked against `photosynthesis` — the user
     * types both answers correctly and is told they got both wrong.
     */
    const result = submit([
      { ordinal: 1, submitted: 'photosynthesis' },
      { ordinal: 0, submitted: 'CPU' },
    ])

    expect(result.grade).toBe('good')
    expect(result.results[0]).toMatchObject({ ordinal: 0, submitted: 'CPU', correct: true })
    expect(result.results[1]).toMatchObject({ ordinal: 1, correct: true })
  })

  it('treats an omitted blank as unanswered', () => {
    const result = submit([{ ordinal: 0, submitted: 'CPU' }])

    expect(result.results[1]).toMatchObject({ submitted: '', correct: false, matchType: 'wrong' })
    expect(result.grade).toBe('hard')
  })

  it('reports the alternative that matched, not the primary answer', () => {
    const result = submit([
      { ordinal: 0, submitted: 'processor' },
      { ordinal: 1, submitted: 'photosynthesis' },
    ])

    expect(result.results[0]).toMatchObject({ matchType: 'alternative', canonical: 'processor' })
    expect(result.grade).toBe('good')
  })

  it('accepts a typo on a long answer and teaches the spelling', () => {
    const result = submit([
      { ordinal: 0, submitted: 'CPU' },
      { ordinal: 1, submitted: 'photosynthesus' },
    ])

    expect(result.results[1]).toMatchObject({ matchType: 'typo', canonical: 'photosynthesis' })
    expect(result.correct).toBe(true)
  })

  it('does not extend typo tolerance to a short answer', () => {
    // "GPU" is one edit from "CPU". Accepting it would make the card unlearnable.
    const result = submit([
      { ordinal: 0, submitted: 'GPU' },
      { ordinal: 1, submitted: 'photosynthesis' },
    ])

    expect(result.results[0]?.correct).toBe(false)
  })

  it('honours typoTolerance being off', () => {
    const result = gradeSubmission(
      answers,
      {
        blanks: [
          { ordinal: 0, submitted: 'CPU' },
          { ordinal: 1, submitted: 'photosynthesus' },
        ],
      },
      false,
    )

    expect(result.results[1]?.correct).toBe(false)
    expect(result.grade).toBe('hard')
  })

  it('grades a reveal again and discards whatever was typed', () => {
    /**
     * Plan §4.2. Without this, "reveal" is a free `good`: fill both blanks
     * correctly, hit reveal, and the schedule advances as though the card was
     * recalled from memory.
     */
    const result = submit(
      [
        { ordinal: 0, submitted: 'CPU' },
        { ordinal: 1, submitted: 'photosynthesis' },
      ],
      true,
    )

    expect(result.grade).toBe('again')
    expect(result.correct).toBe(false)
    expect(result.results.every((blank) => !blank.correct)).toBe(true)
    expect(result.results.map((blank) => blank.submitted)).toEqual(['', ''])
  })

  it('still reports the canonical answers on a reveal', () => {
    // The reveal has to be able to show what the answers were.
    const result = submit([], true)

    expect(result.results.map((blank) => blank.canonical)).toEqual(['CPU', 'photosynthesis'])
  })

  it('returns one result per blank whatever the client sent', () => {
    const result = submit([{ ordinal: 99, submitted: 'nonsense' }])

    expect(result.results).toHaveLength(2)
    expect(result.results.map((blank) => blank.ordinal)).toEqual([0, 1])
  })

  it('grades a card with no blanks again rather than good', () => {
    // An unhighlighted card is broken data. Grading it `good` would push it to a
    // long interval where the user would never see the problem.
    const result = gradeSubmission([], { blanks: [] }, true)

    expect(result.grade).toBe('again')
    expect(result.correct).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { createAnswer, validateAnswers } from './answers.js'
import { needsReanchoring, reanchorAnswers } from './reanchor.js'

const BASE = 'The CPU is the brain of the computer.'

describe('reanchorAnswers', () => {
  it('returns answers untouched when the paragraph did not change', () => {
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, BASE, answers)

    expect(result.orphaned).toEqual([])
    expect(result.matched[0]?.startOffset).toBe(4)
  })

  it('shifts offsets when text is inserted before the answer', () => {
    const edited = `Actually, ${BASE}`
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, edited, answers)

    expect(result.orphaned).toEqual([])
    expect(result.matched[0]?.startOffset).toBe(14)
    expect(result.matched[0]?.answerText).toBe('CPU')
    // The relocated answer must still validate against the new paragraph.
    expect(validateAnswers(edited, result.matched)).toEqual([])
  })

  it('shifts offsets when text is deleted before the answer', () => {
    const edited = BASE.replace('The ', '')
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, edited, answers)

    expect(result.matched[0]?.startOffset).toBe(0)
    expect(validateAnswers(edited, result.matched)).toEqual([])
  })

  it('leaves offsets alone when text is appended after the answer', () => {
    const edited = `${BASE} It executes instructions.`
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, edited, answers)

    expect(result.matched[0]?.startOffset).toBe(4)
  })

  it('orphans an answer whose text was deleted rather than dropping it', () => {
    const edited = BASE.replace('CPU', 'processor')
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, edited, answers)

    expect(result.matched).toEqual([])
    expect(result.orphaned).toHaveLength(1)
    expect(result.orphaned[0]?.answerText).toBe('CPU')
  })

  it('never loses an answer — matched plus orphaned always equals the input', () => {
    const edited = 'The GPU is the brain of the machine.'
    const answers = [createAnswer(BASE, 4, 7), createAnswer(BASE, 15, 20)]
    const result = reanchorAnswers(BASE, edited, answers)

    expect(result.matched.length + result.orphaned.length).toBe(answers.length)
  })

  it('picks the occurrence nearest the old offset when the text repeats', () => {
    const text = 'RAM is memory. Buy more RAM today.'
    const answers = [createAnswer(text, 24, 27)] // the second RAM
    const edited = `Note: ${text}`
    const result = reanchorAnswers(text, edited, answers)

    // Shifted by the 6-character prefix, not snapped back to the first "RAM".
    expect(result.matched[0]?.startOffset).toBe(30)
  })

  it('does not let two identical answers claim the same occurrence', () => {
    const text = 'RAM and RAM'
    const answers = [createAnswer(text, 0, 3), createAnswer(text, 8, 11)]
    const result = reanchorAnswers(text, `x ${text}`, answers)

    expect(result.matched).toHaveLength(2)
    expect(result.matched[0]?.startOffset).toBe(2)
    expect(result.matched[1]?.startOffset).toBe(10)
  })

  it('renumbers ordinals when an edit reorders the answers', () => {
    const text = 'alpha beta'
    const answers = [createAnswer(text, 0, 5), createAnswer(text, 6, 10)]
    const edited = 'beta alpha'
    const result = reanchorAnswers(text, edited, answers)

    const byText = Object.fromEntries(
      result.matched.map((a) => [a.answerText, (a as { ordinal?: number }).ordinal]),
    )
    expect(byText['beta']).toBe(0)
    expect(byText['alpha']).toBe(1)
  })

  it('orphans everything when the paragraph is replaced wholesale', () => {
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, 'Completely different content.', answers)

    expect(result.matched).toEqual([])
    expect(result.orphaned).toHaveLength(1)
  })

  it('handles emoji answers without splitting surrogate pairs', () => {
    const text = 'The 🧠 stores memories.'
    const answers = [createAnswer(text, 4, 5)]
    const edited = `Note: ${text}`
    const result = reanchorAnswers(text, edited, answers)

    expect(result.matched[0]?.answerText).toBe('🧠')
    expect(validateAnswers(edited, result.matched)).toEqual([])
  })
})

describe('reanchorAnswers: answers that cannot possibly fit', () => {
  it('orphans an answer longer than the whole new paragraph', () => {
    // Truncating the paragraph below the answer's own length short-circuits
    // before the search runs — there is nowhere for the text to be.
    const answers = [createAnswer(BASE, 4, 7)]
    const result = reanchorAnswers(BASE, 'ab', answers)

    expect(result.matched).toEqual([])
    expect(result.orphaned).toHaveLength(1)
    expect(result.orphaned[0]?.answerText).toBe('CPU')
  })

  it('orphans an answer whose text was emptied out', () => {
    // Not reachable through createAnswer, but a stale row loaded from the DB
    // can carry an empty answerText. It must be reported, never matched at
    // offset 0 where an empty needle trivially "occurs".
    const empty = { startOffset: 4, endOffset: 7, answerText: '', altAnswers: [] }
    const result = reanchorAnswers(BASE, `Actually, ${BASE}`, [empty])

    expect(result.matched).toEqual([])
    expect(result.orphaned).toEqual([empty])
  })
})

describe('needsReanchoring', () => {
  it('is false when nothing changed', () => {
    expect(needsReanchoring(BASE, BASE, [createAnswer(BASE, 4, 7)])).toBe(false)
  })

  it('is false when the edit is after every answer', () => {
    const edited = `${BASE} More text.`
    expect(needsReanchoring(BASE, edited, [createAnswer(BASE, 4, 7)])).toBe(false)
  })

  it('is true when the edit shifts an answer', () => {
    const edited = `Actually, ${BASE}`
    expect(needsReanchoring(BASE, edited, [createAnswer(BASE, 4, 7)])).toBe(true)
  })

  it('is true when the paragraph got shorter than an answer offset', () => {
    expect(needsReanchoring(BASE, 'Short.', [createAnswer(BASE, 4, 7)])).toBe(true)
  })
})

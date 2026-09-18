import { describe, expect, it } from 'vitest'
import {
  answerAtOffset,
  answerLength,
  assignOrdinals,
  createAnswer,
  isCardAnswer,
  normalizeParagraph,
  rangesOverlap,
  refreshAnswerText,
  snapToWordBoundaries,
  trimBoundaryPunctuation,
  validateAnswers,
} from './answers.js'
import { sliceCodePoints } from './codepoints.js'
import type { AnswerRange, CardAnswer } from './types.js'

// The CPU/RAM example from the objectives doc — two blanks that grade independently.
const CPU_EXAMPLE = 'The CPU is the brain of the computer, and RAM provides temporary storage.'

describe('normalizeParagraph', () => {
  it('converts CRLF to LF (Windows line endings)', () => {
    expect(normalizeParagraph('line 1\r\nline 2\r\nline 3')).toBe('line 1\nline 2\nline 3')
    expect(normalizeParagraph('line 1\rline 2')).toBe('line 1\nline 2')
  })

  it('strips trailing whitespace from each line', () => {
    expect(normalizeParagraph('  leading  \n  more  \n')).toBe('  leading\n  more')
  })

  it('strips trailing whitespace from the paragraph', () => {
    expect(normalizeParagraph('text\n\n  ')).toBe('text')
  })

  it('normalizes to NFC (composed form)', () => {
    const decomposed = 'café' // e + combining acute
    const composed = 'café' // composed é
    expect(normalizeParagraph(decomposed)).toBe(composed)
  })

  it('preserves leading whitespace (indentation)', () => {
    expect(normalizeParagraph('  indented\n    more')).toBe('  indented\n    more')
  })
})

describe('createAnswer', () => {
  it('derives answerText from the paragraph slice', () => {
    const answer = createAnswer(CPU_EXAMPLE, 4, 7)
    expect(answer.answerText).toBe('CPU')
    expect(answer.startOffset).toBe(4)
    expect(answer.endOffset).toBe(7)
  })

  it('rejects empty ranges', () => {
    expect(() => createAnswer(CPU_EXAMPLE, 5, 5)).toThrow('empty')
    expect(() => createAnswer(CPU_EXAMPLE, 5, 4)).toThrow('empty')
  })

  it('rejects out-of-bounds ranges', () => {
    expect(() => createAnswer(CPU_EXAMPLE, -1, 3)).toThrow('outside')
    expect(() => createAnswer(CPU_EXAMPLE, 0, 999)).toThrow('outside')
  })

  it('rejects whitespace-only ranges', () => {
    expect(() => createAnswer('a   b', 1, 4)).toThrow('whitespace')
  })

  it('filters out whitespace-only alternative answers', () => {
    const answer = createAnswer(CPU_EXAMPLE, 4, 7, ['central processing unit', '  ', 'processor'])
    expect(answer.altAnswers).toEqual(['central processing unit', 'processor'])
  })

  it('handles multi-word answers spanning punctuation', () => {
    const text = 'The "HyperText Markup Language" is HTML.'
    const answer = createAnswer(text, 5, 30)
    expect(answer.answerText).toBe('HyperText Markup Language')
  })
})

describe('validateAnswers', () => {
  it('accepts valid non-overlapping answers', () => {
    const answers = [
      createAnswer(CPU_EXAMPLE, 4, 7), // CPU
      createAnswer(CPU_EXAMPLE, 39, 42), // RAM
    ]
    expect(validateAnswers(CPU_EXAMPLE, answers)).toEqual([])
  })

  it('rejects overlapping answers', () => {
    const answers = [createAnswer(CPU_EXAMPLE, 4, 10), createAnswer(CPU_EXAMPLE, 8, 15)]
    const issues = validateAnswers(CPU_EXAMPLE, answers)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('OVERLAP')
  })

  it('accepts adjacent answers that touch but do not overlap', () => {
    const text = 'onetwothree'
    const answers = [
      createAnswer(text, 0, 3), // one
      createAnswer(text, 3, 6), // two
      createAnswer(text, 6, 11), // three
    ]
    expect(validateAnswers(text, answers)).toEqual([])
  })

  it('rejects answers out of order', () => {
    const answers = [
      createAnswer(CPU_EXAMPLE, 39, 42), // RAM (appears second)
      createAnswer(CPU_EXAMPLE, 4, 7), // CPU (appears first)
    ]
    const issues = validateAnswers(CPU_EXAMPLE, answers)
    expect(issues.some((issue) => issue.code === 'ORDINAL_MISMATCH')).toBe(true)
  })

  it('detects text mismatch (the corruption tripwire)', () => {
    const answer = createAnswer(CPU_EXAMPLE, 4, 7) // CPU
    // Simulate paragraph edit without re-anchoring: change CPU → GPU
    const editedParagraph = CPU_EXAMPLE.replace('CPU', 'GPU')
    const issues = validateAnswers(editedParagraph, [answer])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('TEXT_MISMATCH')
  })

  it('handles answers at index 0', () => {
    const text = 'Start of the paragraph.'
    const answer = createAnswer(text, 0, 5) // Start
    expect(validateAnswers(text, [answer])).toEqual([])
  })

  it('handles answers at the very end', () => {
    const text = 'End here.'
    const answer = createAnswer(text, 4, 8) // here
    expect(validateAnswers(text, [answer])).toEqual([])
    expect(answer.endOffset).toBe(8)
  })

  it('handles emoji and CJK with code-point-correct offsets', () => {
    const text = '🧠 記憶 memory'
    const brainAnswer = createAnswer(text, 0, 1) // 🧠
    const memoryAnswer = createAnswer(text, 2, 4) // 記憶
    expect(validateAnswers(text, [brainAnswer, memoryAnswer])).toEqual([])
    expect(brainAnswer.answerText).toBe('🧠')
    expect(memoryAnswer.answerText).toBe('記憶')
  })
})

describe('validateAnswers: ranges createAnswer would never build', () => {
  // createAnswer throws on all of these, so they cannot arrive through the
  // editor. They can still arrive from a DB row written by an older version,
  // a hand-edited import, or an API client. validateAnswers is the layer that
  // has to catch them, which means it needs its own tests rather than
  // inheriting createAnswer's.
  const raw = (startOffset: number, endOffset: number, answerText: string) => ({
    startOffset,
    endOffset,
    answerText,
    altAnswers: [],
  })

  it('rejects non-integer offsets', () => {
    const issues = validateAnswers(CPU_EXAMPLE, [raw(4.5, 7, 'CPU')])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('OUT_OF_BOUNDS')
    expect(issues[0]?.message).toContain('integers')
  })

  it('rejects NaN offsets', () => {
    expect(validateAnswers(CPU_EXAMPLE, [raw(Number.NaN, 7, 'CPU')])[0]?.code).toBe('OUT_OF_BOUNDS')
  })

  it('rejects non-integer offsets passed to createAnswer directly', () => {
    // validateAnswers tests this through its own code path. This hits the same
    // guard at createAnswer's boundary, covering lines 67-68.
    expect(() => createAnswer(CPU_EXAMPLE, 4.5, 7)).toThrow('integers')
    expect(() => createAnswer(CPU_EXAMPLE, 4, Number.NaN)).toThrow('integers')
  })

  it('rejects a negative start offset', () => {
    const issues = validateAnswers(CPU_EXAMPLE, [raw(-1, 3, 'The')])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('OUT_OF_BOUNDS')
  })

  it('rejects an end offset past the paragraph', () => {
    const issues = validateAnswers(CPU_EXAMPLE, [raw(4, 999, 'CPU')])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('OUT_OF_BOUNDS')
    expect(issues[0]?.message).toContain('outside')
  })

  it('rejects an empty range', () => {
    const issues = validateAnswers(CPU_EXAMPLE, [raw(5, 5, '')])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('EMPTY_RANGE')
  })

  it('rejects an inverted range', () => {
    expect(validateAnswers(CPU_EXAMPLE, [raw(7, 4, 'CPU')])[0]?.code).toBe('EMPTY_RANGE')
  })

  it('rejects a range covering only whitespace', () => {
    const text = 'a   b'
    const issues = validateAnswers(text, [raw(1, 4, '   ')])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('WHITESPACE_ONLY')
  })

  it('reports the offending index so the UI can point at the right blank', () => {
    const issues = validateAnswers(CPU_EXAMPLE, [
      createAnswer(CPU_EXAMPLE, 4, 7),
      raw(999, 1000, 'nope'),
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.index).toBe(1)
  })

  it('reports every problem at once rather than stopping at the first', () => {
    const issues = validateAnswers(CPU_EXAMPLE, [raw(-1, 3, 'The'), raw(5, 5, '')])

    expect(issues).toHaveLength(2)
    expect(issues.map((i) => i.code)).toEqual(['OUT_OF_BOUNDS', 'EMPTY_RANGE'])
  })
})

describe('snapToWordBoundaries', () => {
  it('expands a mid-word selection to the whole word', () => {
    const text = 'The HyperText Protocol'
    const result = snapToWordBoundaries(text, 6, 10) // "perT" → "HyperText"
    expect(result).toEqual({ startOffset: 4, endOffset: 13 })
    expect(sliceCodePoints(text, result.startOffset, result.endOffset)).toBe('HyperText')
  })

  it('leaves a whitespace-only selection unchanged', () => {
    const text = 'a   b'
    const result = snapToWordBoundaries(text, 1, 4)
    expect(result).toEqual({ startOffset: 1, endOffset: 4 })
  })

  it('does not pull in neighboring words for whitespace', () => {
    const text = 'word1 word2'
    const result = snapToWordBoundaries(text, 5, 6) // the space
    expect(result).toEqual({ startOffset: 5, endOffset: 6 })
  })

  it('excludes punctuation directly attached to the word without space', () => {
    const text = 'Autonomous Navigation: AI assists robots, sensors.'
    // Click inside "Navigation:"
    const res1 = snapToWordBoundaries(text, 12, 15)
    expect(sliceCodePoints(text, res1.startOffset, res1.endOffset)).toBe('Navigation')

    // Click inside "robots,"
    const res2 = snapToWordBoundaries(text, 35, 38)
    expect(sliceCodePoints(text, res2.startOffset, res2.endOffset)).toBe('robots')
  })
})

describe('trimBoundaryPunctuation', () => {
  it('trims trailing punctuation attached to words without space', () => {
    const text = 'Autonomous Navigation: AI assists robots, sensors, and cameras.'
    // "Autonomous Navigation:" from 0 to 22
    const trimmed = trimBoundaryPunctuation(text, 0, 22)
    expect(sliceCodePoints(text, trimmed.startOffset, trimmed.endOffset)).toBe(
      'Autonomous Navigation',
    )
    expect(trimmed).toEqual({ startOffset: 0, endOffset: 21 })
  })

  it('trims trailing commas, periods, quotes, and parens', () => {
    const text = 'robots, "sensors", and (cameras).'
    // "robots," -> "robots"
    const r1 = trimBoundaryPunctuation(text, 0, 7)
    expect(sliceCodePoints(text, r1.startOffset, r1.endOffset)).toBe('robots')

    // '"sensors",' -> 'sensors'
    const r2 = trimBoundaryPunctuation(text, 8, 17)
    expect(sliceCodePoints(text, r2.startOffset, r2.endOffset)).toBe('sensors')

    // '(cameras).' -> 'cameras'
    const r3 = trimBoundaryPunctuation(text, 23, 33)
    expect(sliceCodePoints(text, r3.startOffset, r3.endOffset)).toBe('cameras')
  })

  it('preserves internal punctuation', () => {
    const text = "state-of-the-art don't 3.14"
    const r1 = trimBoundaryPunctuation(text, 0, 16)
    expect(sliceCodePoints(text, r1.startOffset, r1.endOffset)).toBe('state-of-the-art')

    const r2 = trimBoundaryPunctuation(text, 17, 22)
    expect(sliceCodePoints(text, r2.startOffset, r2.endOffset)).toBe("don't")

    const r3 = trimBoundaryPunctuation(text, 23, 27)
    expect(sliceCodePoints(text, r3.startOffset, r3.endOffset)).toBe('3.14')
  })
})

describe('answerLength', () => {
  it('returns the code point span', () => {
    const answer = createAnswer('🧠 memory', 0, 1)
    expect(answerLength(answer)).toBe(1)
  })
})

describe('rangesOverlap', () => {
  it('detects overlap', () => {
    const a = createAnswer('abcdefgh', 0, 3)
    const b = createAnswer('abcdefgh', 2, 5)
    expect(rangesOverlap(a, b)).toBe(true)
  })

  it('reports adjacent ranges as non-overlapping', () => {
    const a = createAnswer('abcdefgh', 0, 3)
    const b = createAnswer('abcdefgh', 3, 6)
    expect(rangesOverlap(a, b)).toBe(false)
  })
})

describe('answerAtOffset', () => {
  it('finds the answer containing an offset', () => {
    const p = 'Short CPU test and RAM check.'
    const answers = [
      createAnswer(p, 6, 9), // CPU
      createAnswer(p, 19, 22), // RAM
    ]
    expect(answerAtOffset(answers, 7)?.answerText).toBe('CPU')
    expect(answerAtOffset(answers, 20)?.answerText).toBe('RAM')
    expect(answerAtOffset(answers, 15)).toBeUndefined()
  })
})

describe('edge cases: answer text containing underscores', () => {
  it('handles answer text that looks like a blank placeholder', () => {
    const text = 'The _____ is a placeholder.'
    const answer = createAnswer(text, 4, 9) // _____
    expect(answer.answerText).toBe('_____')
    expect(validateAnswers(text, [answer])).toEqual([])
  })
})

describe('isCardAnswer', () => {
  it('separates a persisted answer from a draft', () => {
    const draft = createAnswer(CPU_EXAMPLE, 4, 7)
    const persisted: CardAnswer = { ...draft, id: 'a1', ordinal: 0 }

    expect(isCardAnswer(draft)).toBe(false)
    expect(isCardAnswer(persisted)).toBe(true)
  })

  it('rejects a partial shape carrying only one of the two fields', () => {
    const draft = createAnswer(CPU_EXAMPLE, 4, 7)

    expect(isCardAnswer({ ...draft, id: 'a1' } as AnswerRange)).toBe(false)
    expect(isCardAnswer({ ...draft, ordinal: 0 } as AnswerRange)).toBe(false)
  })
})

describe('refreshAnswerText', () => {
  it('re-derives answerText from the range when the denormalized copy drifted', () => {
    const drifted = { startOffset: 4, endOffset: 7, answerText: 'STALE', altAnswers: [] }

    expect(refreshAnswerText(CPU_EXAMPLE, [drifted])[0]?.answerText).toBe('CPU')
  })

  it('preserves every other field, including altAnswers', () => {
    const answer = createAnswer(CPU_EXAMPLE, 4, 7, ['processor'])
    const refreshed = refreshAnswerText(CPU_EXAMPLE, [{ ...answer, answerText: 'x' }])

    expect(refreshed[0]?.altAnswers).toEqual(['processor'])
    expect(refreshed[0]?.startOffset).toBe(4)
  })
})

describe('assignOrdinals', () => {
  it('sorts by position and numbers from zero', () => {
    const unsorted = [createAnswer(CPU_EXAMPLE, 42, 45), createAnswer(CPU_EXAMPLE, 4, 7)]
    const ordered = assignOrdinals(unsorted)

    expect(ordered.map((a) => a.answerText)).toEqual(['CPU', 'RAM'])
    expect(ordered.map((a) => a.ordinal)).toEqual([0, 1])
  })

  it('does not mutate the input array', () => {
    const input = [createAnswer(CPU_EXAMPLE, 42, 45), createAnswer(CPU_EXAMPLE, 4, 7)]
    assignOrdinals(input)

    expect(input[0]?.answerText).toBe('RAM')
  })

  it('renumbers ordinals that disagree with position', () => {
    const stale = [
      { ...createAnswer(CPU_EXAMPLE, 4, 7), ordinal: 5 },
      { ...createAnswer(CPU_EXAMPLE, 42, 45), ordinal: 9 },
    ]

    expect(assignOrdinals(stale).map((a) => a.ordinal)).toEqual([0, 1])
  })

  it('returns an empty array unchanged', () => {
    expect(assignOrdinals([])).toEqual([])
  })
})

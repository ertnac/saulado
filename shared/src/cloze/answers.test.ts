import { describe, expect, it } from 'vitest'
import {
  answerAtOffset,
  answerLength,
  createAnswer,
  normalizeParagraph,
  rangesOverlap,
  snapToWordBoundaries,
  validateAnswers,
} from './answers.js'
import { sliceCodePoints } from './codepoints.js'

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

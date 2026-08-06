import { describe, expect, it } from 'vitest'
import {
  codePointLength,
  codePointToCodeUnit,
  codeUnitToCodePoint,
  sliceCodePoints,
  toCodePoints,
} from './codepoints.js'

// The string a naive UTF-16 implementation gets wrong: the brain emoji is a
// surrogate pair, so every code unit offset after it is one too high.
const EMOJI = '🧠 memory'

describe('toCodePoints', () => {
  it('counts a surrogate pair as one character', () => {
    expect(EMOJI.length).toBe(9) // UTF-16 code units — what String.length reports
    expect(toCodePoints(EMOJI)).toHaveLength(8) // what a human counts
    expect(toCodePoints(EMOJI)[0]).toBe('🧠')
  })

  it('handles an empty string', () => {
    expect(toCodePoints('')).toEqual([])
    expect(codePointLength('')).toBe(0)
  })
})

describe('sliceCodePoints', () => {
  it('never splits a surrogate pair', () => {
    expect(sliceCodePoints(EMOJI, 0, 1)).toBe('🧠')
    expect(sliceCodePoints(EMOJI, 2, 8)).toBe('memory')
    // The naive equivalent produces a lone surrogate. This is the bug the
    // module exists to prevent.
    expect(EMOJI.slice(0, 1)).not.toBe('🧠')
  })

  it('slices to the end when end is omitted', () => {
    expect(sliceCodePoints(EMOJI, 2)).toBe('memory')
  })

  it('clamps out-of-range indices instead of throwing', () => {
    expect(sliceCodePoints('abc', 0, 99)).toBe('abc')
    expect(sliceCodePoints('abc', -5, 2)).toBe('ab')
    expect(sliceCodePoints('abc', 5, 9)).toBe('')
  })

  it('returns empty for an inverted range', () => {
    expect(sliceCodePoints('abc', 2, 1)).toBe('')
  })
})

describe('code unit / code point conversion', () => {
  it('round-trips across a surrogate pair', () => {
    // "memory" starts at code point 2, but code unit 3.
    expect(codePointToCodeUnit(EMOJI, 2)).toBe(3)
    expect(codeUnitToCodePoint(EMOJI, 3)).toBe(2)
  })

  it('round-trips at every offset of a mixed string', () => {
    const s = 'a🧠b€c'
    for (let cp = 0; cp <= codePointLength(s); cp += 1) {
      expect(codeUnitToCodePoint(s, codePointToCodeUnit(s, cp))).toBe(cp)
    }
  })

  it('resolves an index landing inside a surrogate pair to its character', () => {
    // Code unit 1 is the high surrogate of the emoji — not a valid boundary.
    expect(codeUnitToCodePoint(EMOJI, 1)).toBe(1)
  })

  it('clamps negatives to zero', () => {
    expect(codeUnitToCodePoint(EMOJI, -3)).toBe(0)
    expect(codePointToCodeUnit(EMOJI, -3)).toBe(0)
  })
})

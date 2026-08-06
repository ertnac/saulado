import { describe, expect, it } from 'vitest'
import { levenshtein } from './levenshtein.js'

describe('levenshtein', () => {
  it('returns 0 when strings are identical', () => {
    expect(levenshtein('hello', 'hello')).toBe(0)
  })

  it('returns the shorter length when one string is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })

  it('calculates the classic kitten → sitting example', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })

  it('exits early when the distance exceeds maxDistance', () => {
    expect(levenshtein('kitten', 'sitting', 2)).toBe(3)
    expect(levenshtein('completely', 'different', 3)).toBe(4)
  })

  it('handles single-character edits', () => {
    expect(levenshtein('cat', 'bat')).toBe(1) // substitution
    expect(levenshtein('cat', 'cats')).toBe(1) // insertion
    expect(levenshtein('cats', 'cat')).toBe(1) // deletion
  })

  it('counts emoji as single characters (code point mode)', () => {
    expect(levenshtein('a🧠b', 'ab')).toBe(1)
    expect(levenshtein('🧠', '🤖')).toBe(1)
  })

  it('bails out when the length difference alone exceeds maxDistance', () => {
    expect(levenshtein('a', 'abcdefgh', 3)).toBe(4)
  })

  it('handles multi-byte characters without splitting them', () => {
    expect(levenshtein('café', 'cafe')).toBe(1)
    expect(levenshtein('日本', '日')).toBe(1)
  })

  it('is case-sensitive', () => {
    expect(levenshtein('Hello', 'hello')).toBe(1)
  })
})

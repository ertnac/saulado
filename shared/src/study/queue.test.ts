import { describe, expect, it } from 'vitest'
import { shuffle } from './queue.js'

/**
 * The shuffle is tested with a pinned `rng` rather than by asserting "the output
 * differs from the input" — that assertion passes by luck one run in n! and is
 * exactly the kind of flake nobody debugs.
 */
describe('shuffle', () => {
  it('returns a permutation of the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = shuffle(input, () => 0.5)

    expect([...result].sort()).toEqual([...input].sort())
    expect(result).toHaveLength(input.length)
  })

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    shuffle(input, () => 0.99)

    expect(input).toEqual(['a', 'b', 'c'])
  })

  it('produces a pinned order for a pinned rng', () => {
    // rng always 0 sends every swap to index 0, which rotates the array.
    expect(shuffle(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([], () => 0.5)).toEqual([])
    expect(shuffle(['only'], () => 0.5)).toEqual(['only'])
  })
})

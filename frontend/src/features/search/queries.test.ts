import type { SearchFilters } from '@saulado/shared'
import { describe, expect, it } from 'vitest'
import { isSearchable, searchKeys } from './queries'

/**
 * The two pieces of search caching that are pure logic, and both of which fail
 * silently when wrong: whether a filter set is worth a request, and whether two
 * equivalent filter sets share a cache entry.
 */

describe('isSearchable', () => {
  it('rejects a single character, which the server would 400', () => {
    expect(isSearchable({ q: 'c' })).toBe(false)
  })

  it('accepts two characters', () => {
    expect(isSearchable({ q: 'cp' })).toBe(true)
  })

  it('measures the trimmed length, not the typed length', () => {
    expect(isSearchable({ q: ' c ' })).toBe(false)
    expect(isSearchable({ q: ' cp ' })).toBe(true)
  })

  it('is not searchable when nothing is set at all', () => {
    expect(isSearchable({})).toBe(false)
    expect(isSearchable({ q: '' })).toBe(false)
  })

  /**
   * Browse mode. Filters with no text are a legitimate request — "cards in this
   * set, tagged exam, due now" — and treating them as "not searchable" would
   * strand a user who picks a filter before typing.
   */
  it('is searchable on any filter alone', () => {
    expect(isSearchable({ setId: 'set-1' })).toBe(true)
    expect(isSearchable({ tags: ['exam'] })).toBe(true)
    expect(isSearchable({ due: 'due' })).toBe(true)
    expect(isSearchable({ createdFrom: '2026-01-01' })).toBe(true)
    expect(isSearchable({ createdTo: '2026-12-31' })).toBe(true)
  })

  it('is not searchable on an empty tag list', () => {
    expect(isSearchable({ tags: [] })).toBe(false)
  })

  /**
   * A sort is not a filter. On its own it describes the ordering of everything,
   * which is not a search — and the server would reject the unbounded scan.
   */
  it('is not searchable on a sort alone', () => {
    expect(isSearchable({ sort: 'recent' })).toBe(false)
  })

  it('rejects one character even when a filter is set', () => {
    expect(isSearchable({ q: 'c', setId: 'set-1' })).toBe(false)
  })
})

describe('searchKeys.query', () => {
  it('gives two tag orderings the same key', () => {
    const a = searchKeys.query({ q: 'cpu', tags: ['exam', 'biology'] })
    const b = searchKeys.query({ q: 'cpu', tags: ['biology', 'exam'] })

    expect(a).toEqual(b)
  })

  it('does not mutate the caller’s tag array', () => {
    // The array is React state driving the chip row; sorting it in place would
    // reorder the chips under the user's cursor.
    const tags = ['exam', 'biology']
    searchKeys.query({ tags })

    expect(tags).toEqual(['exam', 'biology'])
  })

  it('separates genuinely different filters', () => {
    const one = searchKeys.query({ q: 'cpu', offset: 0 })
    const two = searchKeys.query({ q: 'cpu', offset: 20 })

    expect(one).not.toEqual(two)
  })

  it('is namespaced so search can be invalidated on its own', () => {
    const filters: SearchFilters = { q: 'cpu' }

    expect(searchKeys.query(filters)[0]).toBe('search')
    expect(searchKeys.all).toEqual(['search'])
  })
})

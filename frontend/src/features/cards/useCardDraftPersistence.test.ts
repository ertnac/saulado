import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDraft,
  readDraft,
  useCardDraftPersistence,
  type CardDraftSnapshot,
} from './useCardDraftPersistence'

/**
 * Draft recovery for the card editor.
 *
 * The case this protects: someone pastes two pages of notes, spends ten minutes
 * highlighting, then the tab closes. Card creation is the one flow where losing
 * state costs more than a re-fetch, so the failure modes worth testing are the
 * ones that lose or corrupt work — not the happy path alone.
 */

const SCOPE = 'set-1'
const KEY = `saulado-card-draft:${SCOPE}`

function snapshot(overrides: Partial<Omit<CardDraftSnapshot, 'savedAt'>> = {}) {
  return {
    paragraph: 'The CPU is the brain of the computer',
    answers: [{ startOffset: 4, endOffset: 7, answerText: 'CPU', altAnswers: [] }],
    title: 'Hardware',
    tags: ['computing'],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('readDraft', () => {
  it('returns nothing when no draft was saved', () => {
    expect(readDraft(SCOPE)).toBeNull()
  })

  it('round-trips a saved draft', () => {
    const saved = { ...snapshot(), savedAt: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(saved))

    expect(readDraft(SCOPE)).toEqual(saved)
  })

  it('rejects a draft missing its answers rather than restoring a partial one', () => {
    // Restoring the paragraph without the highlights is worse than restoring
    // nothing: the user sees their text return and assumes the rest came too.
    localStorage.setItem(KEY, JSON.stringify({ paragraph: 'text', savedAt: Date.now() }))

    expect(readDraft(SCOPE)).toBeNull()
  })

  it('survives a hand-edited value', () => {
    // `localStorage` is user-writable and outlives deploys, so a parse failure is
    // an expected input, not an exceptional one.
    localStorage.setItem(KEY, '{not json')

    expect(readDraft(SCOPE)).toBeNull()
  })

  it('discards a draft older than the retention window', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    localStorage.setItem(KEY, JSON.stringify({ ...snapshot(), savedAt: eightDaysAgo }))

    expect(readDraft(SCOPE)).toBeNull()
    // Aged-out drafts are removed, not left to accumulate against the quota.
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps drafts scoped per set', () => {
    localStorage.setItem(KEY, JSON.stringify({ ...snapshot(), savedAt: Date.now() }))

    expect(readDraft('set-2')).toBeNull()
    expect(readDraft(SCOPE)).not.toBeNull()
  })
})

describe('clearDraft', () => {
  it('removes the draft for one scope only', () => {
    const saved = JSON.stringify({ ...snapshot(), savedAt: Date.now() })
    localStorage.setItem(KEY, saved)
    localStorage.setItem('saulado-card-draft:set-2', saved)

    clearDraft(SCOPE)

    expect(readDraft(SCOPE)).toBeNull()
    expect(readDraft('set-2')).not.toBeNull()
  })
})

describe('useCardDraftPersistence', () => {
  it('writes after the debounce elapses, not on every keystroke', () => {
    vi.useFakeTimers()
    const { rerender } = renderHook(
      (props: Omit<CardDraftSnapshot, 'savedAt'>) => {
        useCardDraftPersistence(SCOPE, props)
      },
      { initialProps: snapshot({ paragraph: 'T' }) },
    )

    rerender(snapshot({ paragraph: 'Th' }))
    rerender(snapshot({ paragraph: 'The' }))
    expect(localStorage.getItem(KEY)).toBeNull()

    vi.advanceTimersByTime(500)

    expect(readDraft(SCOPE)?.paragraph).toBe('The')
  })

  it('persists the answers alongside the paragraph', () => {
    vi.useFakeTimers()
    renderHook(() => {
      useCardDraftPersistence(SCOPE, snapshot())
    })

    vi.advanceTimersByTime(500)

    expect(readDraft(SCOPE)?.answers).toEqual([
      { startOffset: 4, endOffset: 7, answerText: 'CPU', altAnswers: [] },
    ])
  })

  it('writes nothing while the editor is still empty', () => {
    // An empty write would mask a real draft saved earlier in this scope.
    vi.useFakeTimers()
    renderHook(() => {
      useCardDraftPersistence(SCOPE, snapshot({ paragraph: '   ', title: '', answers: [] }))
    })

    vi.advanceTimersByTime(500)

    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('saves a title typed before any paragraph', () => {
    vi.useFakeTimers()
    renderHook(() => {
      useCardDraftPersistence(SCOPE, snapshot({ paragraph: '', title: 'Hardware' }))
    })

    vi.advanceTimersByTime(500)

    expect(readDraft(SCOPE)?.title).toBe('Hardware')
  })

  it('does not resurrect a draft the caller just cleared', () => {
    // The pending timer from the last keystroke would otherwise fire after
    // submit and write the draft straight back.
    vi.useFakeTimers()
    const { rerender } = renderHook(
      (props: { enabled: boolean }) => {
        useCardDraftPersistence(SCOPE, snapshot(), props.enabled)
      },
      { initialProps: { enabled: true } },
    )

    rerender({ enabled: false })
    clearDraft(SCOPE)
    vi.advanceTimersByTime(500)

    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useStudySession } from './useStudySession'
import type { StudySession, SessionCard } from '@saulado/shared'

const mockCard: SessionCard = {
  cardId: 'card-1',
  studySetId: 'set-1',
  segments: [
    { kind: 'text', text: 'The ' },
    { kind: 'blank', ordinal: 0, answerLength: 3 },
    { kind: 'text', text: ' is cool.' },
  ],
  blankCount: 1,
  tags: [],
  isNew: false,
  isLeech: false,
  cardAnswers: [{ answerText: 'CPU', altAnswers: ['Central Processing Unit'] }],
}

const mockSession: StudySession = {
  id: 'sess-1',
  studySetId: 'set-1',
  mode: 'spaced',
  startedAt: '2026-09-19T00:00:00.000Z',
  completedAt: null,
  queue: [mockCard],
  progress: { answered: 0, total: 1, correct: 0 },
}

describe('useStudySession - evaluateLocally & safe accept', () => {
  it('evaluates answers locally and returns instant verdict', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const verdict = result.current.evaluateLocally({ 0: 'CPU' }, false, 'spaced')
    expect(verdict).not.toBeNull()
    expect(verdict?.correct).toBe(true)
    expect(verdict?.grade).toBe('good')
    expect(verdict?.results[0]?.correct).toBe(true)
  })

  it('accepts local verdict and ignores stale background sync for advanced card', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const localVerdict = result.current.evaluateLocally({ 0: 'CPU' }, false, 'spaced')!
    act(() => {
      result.current.accept(localVerdict, 'card-1')
    })
    expect(result.current.answer).toEqual(localVerdict)

    // Advance to next card
    act(() => {
      result.current.advance()
    })

    // Stale server response arriving for card-1 should NOT overwrite answer
    act(() => {
      result.current.accept({ ...localVerdict, dueAt: '2026-10-01' }, 'card-1')
    })
    expect(result.current.answer).toBeNull()
  })

  it('syncs progress correctly via syncProgress', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const newProgress = { answered: 1, total: 1, correct: 1 }
    act(() => {
      result.current.syncProgress(newProgress)
    })
    expect(result.current.progress).toEqual(newProgress)
  })

  it('evaluates revealed card as again grade and requeues appropriately', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const verdict = result.current.evaluateLocally({ 0: 'CPU' }, true, 'spaced')
    expect(verdict).not.toBeNull()
    expect(verdict?.correct).toBe(false)
    expect(verdict?.grade).toBe('again')
    expect(verdict?.requeued).toBe(true)
    // Answered count is unchanged when requeued
    expect(verdict?.progress.answered).toBe(0)
  })

  it('does not decrease progress when accept is called with a lower answered count', () => {
    const { result } = renderHook(() => useStudySession())
    act(() => {
      result.current.load(mockSession)
    })

    const initialVerdict = result.current.evaluateLocally({ 0: 'CPU' }, false, 'spaced')!
    act(() => {
      result.current.accept({
        ...initialVerdict,
        progress: { answered: 2, total: 3, correct: 2 },
      })
    })
    expect(result.current.progress.answered).toBe(2)

    // Delayed response arriving from an earlier card with lower answered count
    act(() => {
      result.current.accept({
        ...initialVerdict,
        progress: { answered: 1, total: 3, correct: 1 },
      })
    })
    expect(result.current.progress.answered).toBe(2)
  })
})

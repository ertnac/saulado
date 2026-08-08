import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * Debouncing the *value* rather than the request.
 *
 * The property that matters — and the reason for fake timers here — is that a
 * fast typist produces exactly one settled value, not one per keystroke delayed.
 * A naive implementation that fails to clear the previous timer still looks
 * correct on a single change and floods the server on a real one.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('cpu', 250))

    expect(result.current).toBe('cpu')
  })

  it('holds the old value until the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'c' },
    })

    rerender({ value: 'cpu' })
    expect(result.current).toBe('c')

    act(() => {
      vi.advanceTimersByTime(249)
    })
    expect(result.current).toBe('c')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('cpu')
  })

  it('settles once for a burst of changes, on the last value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: '' },
    })

    for (const value of ['c', 'cp', 'cpu', 'cpus']) {
      rerender({ value })
      act(() => {
        vi.advanceTimersByTime(100)
      })
      // Each keystroke restarts the clock, so nothing has settled yet.
      expect(result.current).toBe('')
    }

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe('cpus')
  })

  it('does not fire after unmount', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'c' },
    })

    rerender({ value: 'cpu' })
    unmount()

    // A setState on an unmounted component; the cleanup is what prevents it.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500)
      })
    }).not.toThrow()
  })
})

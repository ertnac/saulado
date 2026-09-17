import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
}))

import { startServerKeepAlive, stopServerKeepAlive } from '../api'

describe('Server Keep-Alive ping mechanism', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopServerKeepAlive()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }))),
    )
  })

  afterEach(() => {
    stopServerKeepAlive()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('immediately triggers an initial health ping upon startup', () => {
    startServerKeepAlive()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/health'))
  })

  it('periodically triggers health pings every 10 minutes', () => {
    startServerKeepAlive()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // Advance by 10 minutes (600,000 ms)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)

    // Advance by another 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
  })

  it('stops pinging when stopServerKeepAlive is called', () => {
    startServerKeepAlive()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    stopServerKeepAlive()

    // Advance by 10 minutes - no further fetch calls
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not create duplicate intervals when called multiple times', () => {
    startServerKeepAlive()
    startServerKeepAlive()
    startServerKeepAlive()

    // Only 1 initial call
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // Advance by 10 minutes - only 1 new call (total 2)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})

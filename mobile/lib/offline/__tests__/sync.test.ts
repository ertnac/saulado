/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SyncEngine } from '../sync'
import { onlineManager } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth'
import { useSyncStore } from '../../../stores/sync'
import { loadOfflineState, updateOfflineState } from '../state'
import { submitAnswer } from '../../../services/study'
import { ApiError } from '../../../services/api'
import type { OfflineState, OfflineMutation } from '../types'
import type { AnswerResponse } from '@saulado/shared'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
}))

vi.mock('@tanstack/react-query', () => ({
  onlineManager: {
    subscribe: vi.fn(),
    isOnline: vi.fn(),
  },
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('../../../stores/auth', () => ({
  useAuthStore: {
    subscribe: vi.fn(),
    getState: vi.fn(() => ({ status: 'authenticated' })),
  },
}))

vi.mock('../../../stores/sync', () => {
  const state = {
    status: 'idle',
    pendingCount: 0,
    lastSyncedAt: null as string | null,
    lastError: null as string | null,
  }
  return {
    useSyncStore: {
      getState: () => ({
        ...state,
        setStatus: (s: string) => {
          state.status = s
        },
        setPendingCount: (c: number) => {
          state.pendingCount = c
        },
        setSuccess: () => {
          state.status = 'success'
          state.lastSyncedAt = new Date().toISOString()
          state.lastError = null
        },
        setError: (e: string) => {
          state.lastError = e
          state.status = 'error'
        },
      }),
    },
  }
})

vi.mock('../../../services/study', () => ({
  submitAnswer: vi.fn(),
}))

vi.mock('../state', () => ({
  loadOfflineState: vi.fn(),
  updateOfflineState: vi.fn(),
}))

vi.mock('../../../lib/query-client', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

describe('SyncEngine Production-Readiness Suite', () => {
  let engine: SyncEngine

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    engine = new SyncEngine()

    vi.mocked(onlineManager.isOnline).mockReturnValue(true)
    vi.mocked(useAuthStore.getState).mockReturnValue({
      status: 'authenticated',
    } as unknown as ReturnType<typeof useAuthStore.getState>)

    const store = useSyncStore.getState()
    store.setStatus('idle')
    store.setPendingCount(0)
    store.lastError = null
  })

  afterEach(() => {
    engine.stop()
  })

  it('processes pending mutations and removes them from queue (Scenario D)', async () => {
    const mutation: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: { 0: 'test' },
      revealed: false,
      durationMs: 1000,
      idempotencyKey: 'idemp1',
      queuedAt: new Date().toISOString(),
    }

    let mockState: OfflineState = {
      queue: [mutation],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(updateOfflineState).mockImplementation((updater: unknown) => {
      const fn = updater as (prev: OfflineState) => OfflineState
      mockState = fn(mockState)
      return Promise.resolve(mockState)
    })

    vi.mocked(submitAnswer).mockResolvedValue({} as unknown as AnswerResponse)

    await engine.triggerSync()

    expect(vi.mocked(submitAnswer)).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        cardId: 'c1',
        idempotencyKey: 'idemp1',
        blanks: [{ ordinal: 0, submitted: 'test' }],
      }),
    )

    expect(mockState.queue).toHaveLength(0)
    expect(useSyncStore.getState().status).toBe('success')
  })

  it('preserves idempotencyKey on retry after lost server response (Backend Idempotency)', async () => {
    const mutation: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: { 0: 'test' },
      revealed: false,
      durationMs: 500,
      idempotencyKey: 'stable-idempotency-key-12345',
      queuedAt: new Date().toISOString(),
    }

    const mockState: OfflineState = {
      queue: [mutation],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    // First attempt fails due to timeout
    vi.mocked(submitAnswer).mockRejectedValueOnce(new Error('Network timeout'))
    // Second attempt succeeds
    vi.mocked(submitAnswer).mockResolvedValueOnce({} as unknown as AnswerResponse)

    await engine.triggerSync()
    expect(useSyncStore.getState().status).toBe('error')

    // Advance backoff timer for retry
    await vi.advanceTimersByTimeAsync(2000)

    expect(vi.mocked(submitAnswer)).toHaveBeenCalledTimes(2)
    // Both calls must use the EXACT SAME idempotency key
    expect(vi.mocked(submitAnswer).mock.calls[0]?.[1].idempotencyKey).toBe(
      'stable-idempotency-key-12345',
    )
    expect(vi.mocked(submitAnswer).mock.calls[1]?.[1].idempotencyKey).toBe(
      'stable-idempotency-key-12345',
    )
  })

  it('preserves mutations in queue if app crashes before queue removal (Scenario C)', async () => {
    const mutation: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: { 0: 'answer' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'crash-key-1',
      queuedAt: new Date().toISOString(),
    }

    const mockState: OfflineState = {
      queue: [mutation],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(submitAnswer).mockResolvedValue({} as unknown as AnswerResponse)
    // Simulate crash or storage failure during queue removal
    vi.mocked(updateOfflineState).mockImplementation(() =>
      Promise.reject(new Error('App crash before AsyncStorage commit')),
    )

    await expect(engine.triggerSync()).resolves.not.toThrow()

    // Mutation is still present in mockState
    expect(mockState.queue).toHaveLength(1)
    expect(mockState.queue[0]?.idempotencyKey).toBe('crash-key-1')
  })

  it('marks permanent validation errors (400, 422) as failed and keeps them in the queue', async () => {
    const mutation: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      idempotencyKey: 'idemp-validation-error',
      queuedAt: new Date().toISOString(),
    }

    let mockState: OfflineState = {
      queue: [mutation],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(updateOfflineState).mockImplementation((updater: unknown) => {
      const fn = updater as (prev: OfflineState) => OfflineState
      mockState = fn(mockState)
      return Promise.resolve(mockState)
    })

    vi.mocked(submitAnswer).mockRejectedValue(new ApiError('Bad Request', 400, 'VALIDATION_ERROR'))

    await engine.triggerSync()

    expect(mockState.queue).toHaveLength(1)
    expect(mockState.queue[0]?.status).toBe('failed')
    expect(mockState.queue[0]?.error).toBe('Bad Request')

    expect(useSyncStore.getState().status).toBe('idle')
    expect(useSyncStore.getState().lastError).toContain('Validation error')
  })

  it('maintains strict FIFO order: A -> B -> C -> D across success, permanent error, and network error', async () => {
    const mutA: OfflineMutation = {
      sessionId: 's1',
      cardId: 'cA',
      submittedValues: { 0: 'A' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'keyA',
      queuedAt: '2026-08-31T01:00:00.000Z',
    }
    const mutB: OfflineMutation = {
      sessionId: 's1',
      cardId: 'cB',
      submittedValues: { 0: 'B' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'keyB',
      queuedAt: '2026-08-31T01:01:00.000Z',
    }
    const mutC: OfflineMutation = {
      sessionId: 's1',
      cardId: 'cC',
      submittedValues: { 0: 'C' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'keyC',
      queuedAt: '2026-08-31T01:02:00.000Z',
    }
    const mutD: OfflineMutation = {
      sessionId: 's1',
      cardId: 'cD',
      submittedValues: { 0: 'D' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'keyD',
      queuedAt: '2026-08-31T01:03:00.000Z',
    }

    let mockState: OfflineState = {
      queue: [mutA, mutB, mutC, mutD],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(updateOfflineState).mockImplementation((updater: unknown) => {
      const fn = updater as (prev: OfflineState) => OfflineState
      mockState = fn(mockState)
      return Promise.resolve(mockState)
    })

    const callOrder: string[] = []
    vi.mocked(submitAnswer).mockImplementation((_sessionId, body) => {
      callOrder.push(body.cardId)
      if (body.cardId === 'cA') return Promise.resolve({} as unknown as AnswerResponse)
      if (body.cardId === 'cB')
        return Promise.reject(new ApiError('Card not in session', 404, 'NOT_FOUND'))
      if (body.cardId === 'cC') return Promise.resolve({} as unknown as AnswerResponse)
      if (body.cardId === 'cD') return Promise.reject(new Error('Network disconnected'))
      return Promise.resolve({} as unknown as AnswerResponse)
    })

    await engine.triggerSync()

    // Verified order of processing
    expect(callOrder).toEqual(['cA', 'cB', 'cC', 'cD'])

    // Expected final state:
    // A -> removed
    // B -> failed + retained
    // C -> removed
    // D -> pending
    expect(mockState.queue).toHaveLength(2)
    expect(mockState.queue[0]?.cardId).toBe('cB')
    expect(mockState.queue[0]?.status).toBe('failed')
    expect(mockState.queue[1]?.cardId).toBe('cD')
    expect(mockState.queue[1]?.status).toBeUndefined()
  })

  it('correctly handles multiple sessions without cross-talk', async () => {
    const mutSession1: OfflineMutation = {
      sessionId: 'session-alpha',
      cardId: 'card-1',
      submittedValues: { 0: 'val1' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'key-s1',
      queuedAt: new Date().toISOString(),
    }
    const mutSession2: OfflineMutation = {
      sessionId: 'session-beta',
      cardId: 'card-2',
      submittedValues: { 0: 'val2' },
      revealed: false,
      durationMs: null,
      idempotencyKey: 'key-s2',
      queuedAt: new Date().toISOString(),
    }

    let mockState: OfflineState = {
      queue: [mutSession1, mutSession2],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(updateOfflineState).mockImplementation((updater: unknown) => {
      const fn = updater as (prev: OfflineState) => OfflineState
      mockState = fn(mockState)
      return Promise.resolve(mockState)
    })

    vi.mocked(submitAnswer).mockResolvedValue({} as unknown as AnswerResponse)

    await engine.triggerSync()

    expect(vi.mocked(submitAnswer)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(submitAnswer).mock.calls[0]?.[0]).toBe('session-alpha')
    expect(vi.mocked(submitAnswer).mock.calls[1]?.[0]).toBe('session-beta')
    expect(mockState.queue).toHaveLength(0)
  })

  it('retries temporary errors with bounded exponential backoff', async () => {
    const mutation: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      idempotencyKey: 'idemp1',
      queuedAt: new Date().toISOString(),
    }

    const mockState: OfflineState = {
      queue: [mutation],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }
    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(submitAnswer).mockRejectedValue(new Error('Network request failed'))

    const triggerSpy = vi.spyOn(engine, 'triggerSync')

    await engine.triggerSync()

    expect(useSyncStore.getState().status).toBe('error')
    expect(engine.getRetryCount()).toBe(1)

    // Fast forward 2 seconds (1st backoff)
    await vi.advanceTimersByTimeAsync(2000)
    expect(triggerSpy).toHaveBeenCalledTimes(2)
    expect(engine.getRetryCount()).toBe(2)

    // Fast forward 4 seconds (2nd backoff)
    await vi.advanceTimersByTimeAsync(4000)
    expect(triggerSpy).toHaveBeenCalledTimes(3)
    expect(engine.getRetryCount()).toBe(3)
  })

  it('prevents concurrent sync runs (Single-Flight Lock)', async () => {
    vi.mocked(loadOfflineState).mockImplementation(() => {
      return new Promise((r) =>
        setTimeout(() => {
          r({ queue: [], activeSession: null, metadata: { schemaVersion: 1, updatedAt: '' } })
        }, 100),
      )
    })

    const p1 = engine.triggerSync()
    const p2 = engine.triggerSync()
    const p3 = engine.triggerSync()

    expect(engine.getIsSyncing()).toBe(true)

    vi.runAllTimers()

    await Promise.all([p1, p2, p3])

    expect(vi.mocked(loadOfflineState)).toHaveBeenCalledTimes(1)
  })

  it('halts sync immediately when going offline mid-queue', async () => {
    const mut1: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      idempotencyKey: 'k1',
      queuedAt: new Date().toISOString(),
    }
    const mut2: OfflineMutation = {
      sessionId: 's1',
      cardId: 'c2',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      idempotencyKey: 'k2',
      queuedAt: new Date().toISOString(),
    }

    let mockState: OfflineState = {
      queue: [mut1, mut2],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(() => Promise.resolve(mockState))
    vi.mocked(updateOfflineState).mockImplementation((updater: unknown) => {
      const fn = updater as (prev: OfflineState) => OfflineState
      mockState = fn(mockState)
      return Promise.resolve(mockState)
    })

    // mut1 succeeds, but connection drops right after
    vi.mocked(submitAnswer).mockImplementationOnce(() => {
      vi.mocked(onlineManager.isOnline).mockReturnValue(false)
      return Promise.resolve({} as unknown as AnswerResponse)
    })

    await engine.triggerSync()

    // mut1 was sent, mut2 was not sent because onlineManager became false
    expect(vi.mocked(submitAnswer)).toHaveBeenCalledTimes(1)
    expect(mockState.queue).toHaveLength(1)
    expect(mockState.queue[0]?.cardId).toBe('c2')
    expect(useSyncStore.getState().status).toBe('offline')
  })

  it('does not sync if offline', async () => {
    vi.mocked(onlineManager.isOnline).mockImplementation(() => false)

    await engine.triggerSync()

    expect(vi.mocked(loadOfflineState)).not.toHaveBeenCalled()
  })

  it('does not sync if user is anonymous', async () => {
    vi.mocked(useAuthStore.getState).mockReturnValue({
      status: 'anonymous',
    } as unknown as ReturnType<typeof useAuthStore.getState>)

    await engine.triggerSync()

    expect(vi.mocked(loadOfflineState)).not.toHaveBeenCalled()
  })

  it('cleans up lifecycle listeners on stop() and avoids duplicate subscriptions on start()', () => {
    const unsubOnlineMock = vi.fn()
    const unsubAuthMock = vi.fn()

    vi.mocked(onlineManager.subscribe).mockReturnValue(unsubOnlineMock)
    vi.mocked(useAuthStore.subscribe).mockReturnValue(unsubAuthMock)

    engine.start()
    expect(vi.mocked(onlineManager.subscribe)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useAuthStore.subscribe)).toHaveBeenCalledTimes(1)

    // Calling start again should clean up previous listeners
    engine.start()
    expect(unsubOnlineMock).toHaveBeenCalledTimes(1)
    expect(unsubAuthMock).toHaveBeenCalledTimes(1)
    expect(vi.mocked(onlineManager.subscribe)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(useAuthStore.subscribe)).toHaveBeenCalledTimes(2)

    engine.stop()
    expect(unsubOnlineMock).toHaveBeenCalledTimes(2)
    expect(unsubAuthMock).toHaveBeenCalledTimes(2)
  })
})

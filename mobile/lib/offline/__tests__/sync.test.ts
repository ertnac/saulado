/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SyncEngine } from '../sync'
import { onlineManager } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth'
import { useSyncStore } from '../../../stores/sync'
import { loadOfflineState, updateOfflineState } from '../state'
import { submitAnswer } from '../../../services/study'
import { ApiError } from '../../../services/api'
import type { OfflineState, OfflineMutation, OfflineAnswerMutation } from '../types'
import type { AnswerResponse } from '@saulado/shared'
import { mockDbInstance } from './mock-db'

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => mockDbInstance),
}))

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
}))

vi.mock('../../query-client', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    getQueryData: vi.fn(),
    removeQueries: vi.fn(),
  },
}))

vi.mock('../../../stores/auth', () => ({
  useAuthStore: {
    subscribe: vi.fn(),
    getState: vi.fn(() => ({ status: 'authenticated', user: { id: 'test-user' } })),
  },
  onAuthLogout: vi.fn(),
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

describe('SyncEngine Production-Readiness Suite', () => {
  let engine: SyncEngine
  let mockState: OfflineState

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockDbInstance.reset()
    engine = new SyncEngine()

    mockState = {
      queue: [],
      activeSession: null,
      metadata: { schemaVersion: 1, updatedAt: '' },
    }

    vi.mocked(loadOfflineState).mockImplementation(async () => mockState)
    vi.mocked(updateOfflineState).mockImplementation(async (updater: any) => {
      mockState = typeof updater === 'function' ? updater(mockState) : updater
      return mockState
    })

    vi.mocked(onlineManager.isOnline).mockReturnValue(true)
    vi.mocked(useAuthStore.getState).mockReturnValue({
      status: 'authenticated',
      user: { id: 'test-user' },
    } as any)

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
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: { 0: 'test' },
      revealed: false,
      durationMs: 1000,
      userId: 'test-user',
      idempotencyKey: 'idemp1',
      queuedAt: new Date().toISOString(),
    }

    mockState.queue = [mutation]
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
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: { 0: 'test' },
      revealed: false,
      durationMs: 500,
      userId: 'test-user',
      idempotencyKey: 'stable-idempotency-key-12345',
      queuedAt: new Date().toISOString(),
    }

    mockState.queue = [mutation]

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

  it('marks permanent validation errors (400, 422) as failed and keeps them in the queue', async () => {
    const mutation: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'idemp-validation-error',
      queuedAt: new Date().toISOString(),
    }

    mockState.queue = [mutation]
    vi.mocked(submitAnswer).mockRejectedValue(new ApiError('Bad Request', 400, 'VALIDATION_ERROR'))

    await engine.triggerSync()

    expect(mockState.queue).toHaveLength(1)
    expect(mockState.queue[0]?.status).toBe('failed')
    expect(mockState.queue[0]?.error).toBe('Bad Request')

    expect(useSyncStore.getState().status).toBe('idle')
    expect(useSyncStore.getState().lastError).toContain('Validation error')
  })

  it('maintains strict topological FIFO order across mutations', async () => {
    const mutA: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'cA',
      submittedValues: { 0: 'A' },
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'keyA',
      queuedAt: '2026-08-31T01:00:00.000Z',
    }
    const mutB: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'cB',
      submittedValues: { 0: 'B' },
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'keyB',
      queuedAt: '2026-08-31T01:01:00.000Z',
    }
    const mutC: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'cC',
      submittedValues: { 0: 'C' },
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'keyC',
      queuedAt: '2026-08-31T01:02:00.000Z',
    }
    const mutD: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'cD',
      submittedValues: { 0: 'D' },
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'keyD',
      queuedAt: '2026-08-31T01:03:00.000Z',
    }

    mockState.queue = [mutA, mutB, mutC, mutD]

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

    expect(callOrder).toEqual(['cA', 'cB', 'cC', 'cD'])
    expect(mockState.queue).toHaveLength(2)
    expect((mockState.queue[0] as OfflineAnswerMutation)?.cardId).toBe('cB')
    expect(mockState.queue[0]?.status).toBe('failed')
    expect((mockState.queue[1] as OfflineAnswerMutation)?.cardId).toBe('cD')
  })

  it('retries temporary errors with bounded exponential backoff', async () => {
    const mutation: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'idemp1',
      queuedAt: new Date().toISOString(),
    }

    mockState.queue = [mutation]
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
    vi.mocked(updateOfflineState).mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            r({ queue: [], activeSession: null, metadata: { schemaVersion: 1, updatedAt: '' } })
          }, 100),
        ),
    )

    const p1 = engine.triggerSync()
    const p2 = engine.triggerSync()
    const p3 = engine.triggerSync()

    expect(engine.getIsSyncing()).toBe(true)

    vi.runAllTimers()

    await Promise.all([p1, p2, p3])

    expect(vi.mocked(updateOfflineState)).toHaveBeenCalledTimes(1)
  })

  it('halts sync immediately when going offline mid-queue', async () => {
    const mut1: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'c1',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'k1',
      queuedAt: new Date().toISOString(),
    }
    const mut2: OfflineMutation = {
      type: 'submit_answer',
      sessionId: 's1',
      cardId: 'c2',
      submittedValues: {},
      revealed: false,
      durationMs: null,
      userId: 'test-user',
      idempotencyKey: 'k2',
      queuedAt: new Date().toISOString(),
    }

    mockState.queue = [mut1, mut2]

    vi.mocked(submitAnswer).mockImplementationOnce(() => {
      vi.mocked(onlineManager.isOnline).mockReturnValue(false)
      return Promise.resolve({} as unknown as AnswerResponse)
    })

    await engine.triggerSync()

    expect(vi.mocked(submitAnswer)).toHaveBeenCalledTimes(1)
    expect(mockState.queue).toHaveLength(1)
    expect((mockState.queue[0] as OfflineAnswerMutation)?.cardId).toBe('c2')
    expect(useSyncStore.getState().status).toBe('offline')
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getOfflineSetIndex, updateOfflineSetIndex, getSetPayloadKey, getOfflineSet } from '../sets'
import { loadOfflineState, updateOfflineState } from '../state'
import { useAuthStore } from '../../../stores/auth'
import type { OfflineSetPayload } from '../types'
import type { SetResponse } from '@saulado/shared'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('../../../stores/auth', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

describe('Offline Data Isolation (P0)', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage = {}

    vi.mocked(AsyncStorage.getItem).mockImplementation((key) =>
      Promise.resolve(mockStorage[key] || null),
    )
    vi.mocked(AsyncStorage.setItem).mockImplementation((key, val) => {
      mockStorage[key] = val
      return Promise.resolve()
    })
    vi.mocked(AsyncStorage.removeItem).mockImplementation((key) => {
      delete mockStorage[key]
      return Promise.resolve()
    })
    vi.mocked(AsyncStorage.clear).mockImplementation(() => {
      mockStorage = {}
      return Promise.resolve()
    })
  })

  it('prevents User B from accessing User A offline sets and state', async () => {
    // 1. User A logs in
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'user-a' } } as ReturnType<
      typeof useAuthStore.getState
    >)

    // User A downloads a set
    await updateOfflineSetIndex((idx) => {
      idx.sets['set-1'] = { setId: 'set-1', status: 'available', updatedAt: '2024-01-01' }
    })

    const payloadA: OfflineSetPayload = {
      userId: 'user-a',
      setId: 'set-1',
      version: 1,
      downloadedAt: '2024-01-01',
      updatedAt: '2024-01-01',
      metadata: {} as SetResponse,
      cards: [],
    }
    await AsyncStorage.setItem(getSetPayloadKey('user-a', 'set-1'), JSON.stringify(payloadA))

    // User A queue mutation
    await updateOfflineState((state) => ({
      ...state,
      queue: [
        {
          sessionId: 's1',
          cardId: 'c1',
          submittedValues: {},
          revealed: true,
          durationMs: 0,
          idempotencyKey: 'i1',
          queuedAt: '2024-01-01',
        },
      ],
    }))

    // Verify User A can read it
    const indexA = await getOfflineSetIndex()
    expect(indexA.sets['set-1'].status).toBe('available')

    const setA = await getOfflineSet('set-1')
    expect(setA?.userId).toBe('user-a')

    const stateA = await loadOfflineState()
    expect(stateA.queue).toHaveLength(1)
    expect(stateA.metadata.userId).toBe('user-a')

    // 2. User A logs out, User B logs in
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'user-b' } } as ReturnType<
      typeof useAuthStore.getState
    >)

    // 3. Verify User B sees empty data
    const indexB = await getOfflineSetIndex()
    expect(indexB.sets).toEqual({}) // User B index is empty

    // Even if User B index was somehow hacked/polluted, reading the payload must fail or return null
    await updateOfflineSetIndex((idx) => {
      idx.sets['set-1'] = { setId: 'set-1', status: 'available', updatedAt: '2024-01-01' }
    })

    const setB = await getOfflineSet('set-1')
    expect(setB).toBeNull() // Payload key is scoped to userId!

    const stateB = await loadOfflineState()
    expect(stateB.queue).toHaveLength(0)
    expect(stateB.metadata.userId).toBe('user-b')

    // 4. Verify cross-account payload parsing rejects data even if keys align (defense in depth)
    await AsyncStorage.setItem(getSetPayloadKey('user-b', 'set-1'), JSON.stringify(payloadA)) // Simulate leakage/injection
    const injectedSetB = await getOfflineSet('set-1')
    expect(injectedSetB).toBeNull() // parsed.userId ('user-a') !== currentUserId ('user-b')
  })
})

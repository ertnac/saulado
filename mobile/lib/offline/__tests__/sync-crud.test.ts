/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCard, createSet, getCard, getSet } from '../data-source'
import { SyncEngine } from '../sync'
import { mockDbInstance } from './mock-db'
import { loadOfflineState } from '../state'
import { onlineManager } from '@tanstack/react-query'
import * as api from '../../../services/cards'
import { useAuthStore } from '../../../stores/auth'

let mockStorage: Record<string, string> = {}

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
}))

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => () => {}),
  },
}))

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => mockDbInstance),
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

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage[key] || null),
    setItem: vi.fn(async (key: string, val: string) => {
      mockStorage[key] = val
    }),
    removeItem: vi.fn(async (key: string) => {
      delete mockStorage[key]
    }),
  },
}))

vi.mock('../../../services/cards', () => ({
  createSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
}))

vi.mock('../../../stores/auth', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ status: 'authenticated', user: { id: 'user-1' } })),
    subscribe: vi.fn(() => () => {}),
  },
  onAuthLogout: vi.fn(),
}))

describe('SyncEngine CRUD & Temp ID Remapping Integration', () => {
  let engine: SyncEngine

  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
    mockStorage = {}
    engine = new SyncEngine()
    vi.spyOn(onlineManager, 'isOnline').mockReturnValue(true)
    vi.mocked(useAuthStore.getState).mockReturnValue({
      status: 'authenticated',
      user: { id: 'user-1' },
    } as any)
  })

  it('synchronizes offline-created set and child card with temp ID remapping', async () => {
    // 1. Create set and card offline
    const offlineSet = await createSet('user-1', { title: 'Physics 101' })
    const offlineCard = await createCard('user-1', offlineSet.id, {
      paragraph: 'Inertia is Newton first law',
      answers: [{ startOffset: 0, endOffset: 7 }],
    })
    expect(offlineCard.id).toMatch(/^temp-card-/)

    const stateBefore = await loadOfflineState()
    expect(stateBefore.queue).toHaveLength(2)

    // 2. Mock API responses returning real server IDs
    vi.mocked(api.createSet).mockResolvedValueOnce({
      set: {
        id: 'real-set-999',
        title: 'Physics 101',
        parentId: null,
        color: 'amber',
        archivedAt: null,
        cardCount: 0,
        subtreeCardCount: 0,
        childCount: 0,
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
      },
    })

    vi.mocked(api.createCard).mockResolvedValueOnce({
      card: {
        id: 'real-card-888',
        studySetId: 'real-set-999',
        paragraph: 'Inertia is Newton first law',
        answers: [
          {
            id: 'a1',
            ordinal: 0,
            startOffset: 0,
            endOffset: 7,
            answerText: 'Inertia',
            altAnswers: [],
          },
        ],
        tags: [],
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
      },
    })

    // 3. Trigger Sync
    await engine.triggerSync()

    // 4. Verify API calls
    expect(api.createSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Physics 101' }))
    expect(api.createCard).toHaveBeenCalledWith(
      'real-set-999', // Remapped from temp-set-xxx!
      expect.objectContaining({ paragraph: 'Inertia is Newton first law' }),
    )

    // 5. Verify SQLite records updated to server IDs and marked synced
    const setInDb = await getSet('user-1', 'real-set-999')
    expect(setInDb).not.toBeNull()

    const cardInDb = await getCard('user-1', 'real-card-888')
    expect(cardInDb).not.toBeNull()
    expect(cardInDb?.studySetId).toBe('real-set-999')

    // 6. Verify queue is now empty
    const stateAfter = await loadOfflineState()
    expect(stateAfter.queue).toHaveLength(0)
  })

  it('quarantines cross-account mutations before sync', async () => {
    // Mutation belonging to user-b
    await createSet('user-b', { title: 'User B Set' })

    // Active user is user-1
    vi.mocked(useAuthStore.getState).mockReturnValue({
      status: 'authenticated',
      user: { id: 'user-1' },
    } as any)

    await engine.triggerSync()

    // API should never be called for cross-account mutation
    expect(api.createSet).not.toHaveBeenCalled()
  })
})

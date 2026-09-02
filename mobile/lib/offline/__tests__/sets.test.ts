/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { downloadSet, getOfflineSet, getOfflineSetIndex, removeOfflineSet } from '../sets'
import * as api from '../../../services/cards'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../../../stores/auth'
import { mockDbInstance } from './mock-db'

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => mockDbInstance),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('../../../services/cards', () => ({
  getSet: vi.fn(),
  listCards: vi.fn(),
  getCard: vi.fn(),
}))

vi.mock('../../../stores/offline-sets', () => ({
  useOfflineSetsStore: {
    getState: () => ({
      load: vi.fn(),
    }),
  },
}))

vi.mock('../../../stores/auth', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}))

describe('Offline Sets SQLite Engine', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
    mockStorage = {}

    vi.mocked(useAuthStore.getState).mockReturnValue({ user: { id: 'test-user' } } as any)

    vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => mockStorage[key] || null)
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, val) => {
      mockStorage[key] = val
    })
    vi.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      delete mockStorage[key]
    })
  })

  it('safely commits download into SQLite database and provides offline set', async () => {
    vi.mocked(api.getSet).mockResolvedValue({
      set: {
        id: 's1',
        title: 'Test Set',
        cardCount: 1,
        subtreeCardCount: 1,
        tags: [],
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    } as any)
    vi.mocked(api.listCards).mockResolvedValue({
      items: [
        {
          id: 'c1',
          paragraph: 'Question about biology',
          answerCount: 1,
          studySetId: 's1',
          tags: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
      nextCursor: null,
    })
    vi.mocked(api.getCard).mockResolvedValue({
      card: {
        id: 'c1',
        studySetId: 's1',
        prompt: 'Q',
        body: 'Question about biology',
        blanks: [{ ordinal: 0, text: 'biology' }],
        tags: [],
        cardType: 'cloze',
        orderIndex: 0,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    } as any)

    await downloadSet('s1')

    // Expect set to be in SQLite
    const setPayload = await getOfflineSet('s1')
    expect(setPayload).not.toBeNull()
    expect(setPayload?.metadata.title).toBe('Test Set')
    expect(setPayload?.cards).toHaveLength(1)
    expect(setPayload?.cards[0]!.id).toBe('c1')

    // Expect index to include s1 as available with syncStatus synced
    const index = await getOfflineSetIndex()
    expect(index.sets['s1']?.status).toBe('available')
    expect(index.sets['s1']?.syncStatus).toBe('synced')
  })

  it('removes offline set from SQLite', async () => {
    vi.mocked(api.getSet).mockResolvedValue({
      set: { id: 's1', title: 'Test Set', cardCount: 0, subtreeCardCount: 0, tags: [] },
    } as any)
    vi.mocked(api.listCards).mockResolvedValue({ items: [], nextCursor: null })

    await downloadSet('s1')
    expect(await getOfflineSet('s1')).not.toBeNull()

    await removeOfflineSet('s1')
    expect(await getOfflineSet('s1')).toBeNull()
  })

  it('cancels duplicate concurrent downloads using single-flight lock', async () => {
    let apiCallCount = 0
    vi.mocked(api.getSet).mockImplementation(async () => {
      apiCallCount++
      await new Promise((r) => setTimeout(r, 10))
      return {
        set: { id: 's1', title: 'Test Set', cardCount: 0, subtreeCardCount: 0, tags: [] },
      } as any
    })
    vi.mocked(api.listCards).mockResolvedValue({ items: [], nextCursor: null })

    // Fire two concurrently
    const p1 = downloadSet('s1')
    const p2 = downloadSet('s1')

    expect(p1).toBe(p2) // Same promise reference returned
    await Promise.all([p1, p2])

    // Ensure API was only called once despite two requests
    expect(apiCallCount).toBe(1)
  })

  it('gracefully returns empty index when user is unauthenticated', async () => {
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: null } as any)

    const index = await getOfflineSetIndex()
    expect(index).toEqual({ sets: {} })

    const set = await getOfflineSet('s1')
    expect(set).toBeNull()
  })
})

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { downloadSet, getOfflineSet, getOfflineSetIndex, getSetsIndexKey } from '../sets'
import * as api from '../../../services/cards'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../../../stores/auth'

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

describe('Offline Sets Engine Phase 5.5', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('safely commits download (payload first, then index)', async () => {
    vi.mocked(api.getSet).mockResolvedValue({ set: { id: 's1', title: 'Test Set' } } as any)
    vi.mocked(api.listCards).mockResolvedValue({
      items: [
        {
          id: 'c1',
          paragraph: 'Q',
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
      card: { id: 'c1', paragraph: 'Q', answers: [] },
    } as any)

    await downloadSet('s1')

    // Expect payload to exist
    const payloadRaw = mockStorage[`saulado-offline-set:test-user:s1`]!
    expect(payloadRaw).toBeDefined()
    const payload = JSON.parse(payloadRaw)
    expect(payload.cards).toHaveLength(1)

    // Expect index to be updated
    const indexRaw = mockStorage[getSetsIndexKey('test-user')]!
    const index = JSON.parse(indexRaw)
    expect(index.sets['s1']!.status).toBe('available')
  })

  it('quarantines and removes corrupted set payload', async () => {
    // 1. Manually insert bad payload and valid index
    mockStorage[getSetsIndexKey('test-user')] = JSON.stringify({
      sets: { bad1: { setId: 'bad1', status: 'available', updatedAt: '2026' } },
    })
    mockStorage['saulado-offline-set:test-user:bad1'] = JSON.stringify({
      userId: 'test-user',
      setId: 'bad1',
      metadata: null, // corrupted
      cards: [],
    })

    // 2. Fetching it should return null and auto-remove
    const set = await getOfflineSet('bad1')
    expect(set).toBeNull()

    // 3. Ensure it was removed
    expect(mockStorage['saulado-offline-set:test-user:bad1']).toBeUndefined()
    const indexRaw = mockStorage[getSetsIndexKey('test-user')]
    const index = indexRaw ? JSON.parse(indexRaw) : { sets: {} }
    expect(index.sets['bad1']).toBeUndefined()
  })

  it('cancels duplicate concurrent downloads using single-flight lock', async () => {
    let apiCallCount = 0
    vi.mocked(api.getSet).mockImplementation(async () => {
      apiCallCount++
      await new Promise((r) => setTimeout(r, 10))
      return { set: { id: 's1', title: 'Test Set' } } as any
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

  it('handles bounded concurrency automatically', async () => {
    vi.mocked(api.getSet).mockResolvedValue({ set: { id: 's1', title: 'Test Set' } } as any)

    // Return 25 cards to test batching of 10
    const summaries = Array.from({ length: 25 }, (_, i) => ({ id: `c${i}` }) as any)
    vi.mocked(api.listCards).mockResolvedValue({ items: summaries, nextCursor: null })
    vi.mocked(api.getCard).mockImplementation(
      async (id: any) => ({ card: { id, paragraph: 'Q' } }) as any,
    )

    await downloadSet('s1')

    const payloadRaw = mockStorage[`saulado-offline-set:test-user:s1`]!
    const payload = JSON.parse(payloadRaw)
    expect(payload.cards).toHaveLength(25)
    // api.getCard should have been called 25 times
    expect(vi.mocked(api.getCard)).toHaveBeenCalledTimes(25)
  })

  it('gracefully returns empty index when user is unauthenticated or restoring', async () => {
    vi.mocked(useAuthStore.getState).mockReturnValue({ user: null } as any)

    const index = await getOfflineSetIndex()
    expect(index).toEqual({ sets: {} })

    const set = await getOfflineSet('s1')
    expect(set).toBeNull()
  })
})

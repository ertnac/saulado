/* eslint-disable @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCard,
  createSet,
  deleteCard,
  deleteSet,
  getCard,
  getCards,
  getSet,
  getSets,
  updateCard,
  updateSet,
} from '../data-source'
import { mockDbInstance } from './mock-db'
import { loadOfflineState } from '../state'

let mockStorage: Record<string, string> = {}

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => mockDbInstance),
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

vi.mock('../../../stores/auth', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'user-1' } })),
  },
}))

describe('Offline Data Source SQLite Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
    mockStorage = {}
  })

  it('creates a set offline, persists to SQLite, and enqueues create_set', async () => {
    const set = await createSet('user-1', {
      title: 'Chemistry 101',
      color: 'amber',
    })

    expect(set.id).toMatch(/^temp-set-/)
    expect(set.title).toBe('Chemistry 101')
    expect(set.color).toBe('amber')
    expect(set.cardCount).toBe(0)

    // Verify SQLite
    const inDb = await getSet('user-1', set.id)
    expect(inDb).not.toBeNull()
    expect(inDb?.title).toBe('Chemistry 101')
    expect(inDb?.color).toBe('amber')

    // Verify queue
    const state = await loadOfflineState()
    expect(state.queue).toHaveLength(1)
    expect(state.queue[0]).toMatchObject({
      type: 'create_set',
      tempSetId: set.id,
      title: 'Chemistry 101',
    })
  })

  it('enforces user isolation: User A sets are invisible to User B', async () => {
    const setA = await createSet('user-a', { title: 'Secret Deck A' })
    await createSet('user-b', { title: 'Secret Deck B' })

    const setsA = await getSets('user-a')
    expect(setsA).toHaveLength(1)
    expect(setsA[0]!.title).toBe('Secret Deck A')

    const fromB = await getSet('user-b', setA.id)
    expect(fromB).toBeNull()
  })

  it('updates a set offline and enqueues update_set', async () => {
    const set = await createSet('user-1', { title: 'Old Title' })
    const updated = await updateSet('user-1', set.id, { title: 'New Renamed Title' })

    expect(updated.title).toBe('New Renamed Title')

    const inDb = await getSet('user-1', set.id)
    expect(inDb?.title).toBe('New Renamed Title')
  })

  it('creates cards and increments parent set card count atomically', async () => {
    const set = await createSet('user-1', { title: 'Biology' })
    expect(set.cardCount).toBe(0)

    const card1 = await createCard('user-1', set.id, {
      paragraph: 'Mitochondria is the powerhouse of the cell',
      answers: [{ startOffset: 0, endOffset: 12 }],
      tags: ['bio'],
    })

    expect(card1.id).toMatch(/^temp-card-/)
    expect(card1.paragraph).toBe('Mitochondria is the powerhouse of the cell')
    expect(card1.answers).toHaveLength(1)
    expect(card1.answers[0]!.answerText).toBe('Mitochondria')

    // Verify parent set card_count incremented
    const updatedSet = await getSet('user-1', set.id)
    expect(updatedSet?.cardCount).toBe(1)

    const cards = await getCards('user-1', set.id)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.id).toBe(card1.id)

    // Verify queue
    const state = await loadOfflineState()
    expect(state.queue.some((m) => m.type === 'create_card')).toBe(true)
  })

  it('updates a card offline', async () => {
    const set = await createSet('user-1', { title: 'Math' })
    const card = await createCard('user-1', set.id, {
      paragraph: '2 + 2 = 4',
      answers: [{ startOffset: 8, endOffset: 9 }],
    })

    const updated = await updateCard('user-1', set.id, card.id, {
      paragraph: 'Two plus two equals four',
      answers: [{ startOffset: 20, endOffset: 24 }],
    })

    expect(updated.paragraph).toBe('Two plus two equals four')
    expect(updated.answers[0]!.answerText).toBe('four')

    const inDb = await getCard('user-1', card.id)
    expect(inDb?.paragraph).toBe('Two plus two equals four')
  })

  it('deletes a card and decrements set card count', async () => {
    const set = await createSet('user-1', { title: 'History' })
    const card = await createCard('user-1', set.id, {
      paragraph: '1776 Declaration of Independence',
      answers: [],
    })

    expect((await getSet('user-1', set.id))?.cardCount).toBe(1)

    await deleteCard('user-1', set.id, card.id)

    expect((await getSet('user-1', set.id))?.cardCount).toBe(0)
    expect(await getCard('user-1', card.id)).toBeNull()
  })

  it('deleting a temporary set deletes all its local cards and compacts queue to NO-OP', async () => {
    const set = await createSet('user-1', { title: 'Temporary Subject' })
    const card = await createCard('user-1', set.id, {
      paragraph: 'Temp card body',
      answers: [],
    })

    expect(await getSet('user-1', set.id)).not.toBeNull()
    expect(await getCard('user-1', card.id)).not.toBeNull()

    // Delete temporary set
    await deleteSet('user-1', set.id)

    // SQLite should be clean
    expect(await getSet('user-1', set.id)).toBeNull()
    expect(await getCard('user-1', card.id)).toBeNull()

    // Queue should be compacted to 0
    const state = await loadOfflineState()
    expect(state.queue).toHaveLength(0)
  })
})

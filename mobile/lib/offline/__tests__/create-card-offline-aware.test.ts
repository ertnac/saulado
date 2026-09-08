/* eslint-disable @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCardOfflineAware } from '../../../hooks/cards'
import { mockDbInstance } from './mock-db'
import { onlineManager } from '@tanstack/react-query'

let mockStorage: Record<string, string> = {}

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}))

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
    subscribe: vi.fn(() => () => {}),
  },
  onAuthLogout: vi.fn(),
}))

describe('createCardOfflineAware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
    mockStorage = {}
  })

  it('creates card into SQLite when offlineManager reports offline', async () => {
    vi.spyOn(onlineManager, 'isOnline').mockReturnValue(false)

    // Pre-insert a set into mock SQLite so foreign key is satisfied
    await mockDbInstance.runAsync(
      `INSERT INTO study_sets (id, user_id, title, color, card_count, is_downloaded, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['set-123', 'user-1', 'Biology', 'forest', 0, 1, 'synced'],
    )

    const response = await createCardOfflineAware('set-123', {
      paragraph: 'Mitosis is a type of cell division.',
      answers: [{ startOffset: 0, endOffset: 7 }],
    })

    expect(response.card).toBeDefined()
    expect(response.card.id).toMatch(/^temp-card-/)
    expect(response.card.paragraph).toBe('Mitosis is a type of cell division.')
    expect(response.card.studySetId).toBe('set-123')

    // Verify it was persisted in study_cards SQLite table
    const stored = await mockDbInstance.getFirstAsync<{ id: string; paragraph: string }>(
      'SELECT id, paragraph FROM study_cards WHERE id = ?',
      [response.card.id],
    )
    expect(stored?.id).toBe(response.card.id)
    expect(stored?.paragraph).toBe('Mitosis is a type of cell division.')
  })
})

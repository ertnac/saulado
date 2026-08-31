import AsyncStorage from '@react-native-async-storage/async-storage'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { clearAuthCache, loadAuthCache, saveAuthCache } from '../auth-cache'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

describe('auth-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves auth state', async () => {
    const user = { id: '1', email: 'test@example.com', createdAt: '', emailVerifiedAt: null }
    const settings = {
      darkMode: false,
      dailyGoal: 20,
      newCardsPerDay: 10,
      notificationsEnabled: true,
      typoTolerance: true,
      blankWidthMode: 'fixed' as const,
      timezone: 'UTC',
      nickname: 'Test',
      profileImage: null,
    }

    await saveAuthCache(user, settings)

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'saulado-auth-cache',
      JSON.stringify({ user, settings }),
    )
  })

  it('loads auth state', async () => {
    const mockData = { user: { id: '1' }, settings: { darkMode: true } }
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(mockData))

    const loaded = await loadAuthCache()

    expect(loaded).toEqual(mockData)
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('saulado-auth-cache')
  })

  it('returns null when no cache exists', async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null)

    const loaded = await loadAuthCache()

    expect(loaded).toBeNull()
  })

  it('clears auth cache', async () => {
    await clearAuthCache()

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('saulado-auth-cache')
  })
})

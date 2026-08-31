import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PublicUser, UserSettings } from '@saulado/shared'

const CACHE_KEY = 'saulado-auth-cache'

export interface CachedAuth {
  user: PublicUser
  settings: UserSettings
}

export async function saveAuthCache(user: PublicUser, settings: UserSettings): Promise<void> {
  try {
    const data: CachedAuth = { user, settings }
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('[auth-cache] failed to save auth cache', error)
  }
}

export async function loadAuthCache(): Promise<CachedAuth | null> {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY)
    if (!data) return null
    return JSON.parse(data) as CachedAuth
  } catch (error) {
    console.warn('[auth-cache] failed to load auth cache', error)
    return null
  }
}

export async function clearAuthCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY)
  } catch (error) {
    console.warn('[auth-cache] failed to clear auth cache', error)
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../../stores/auth'
import type { OfflineState } from './types'

// Legacy keys for migration
const LEGACY_STATE_KEY = 'saulado-offline-state'
const LEGACY_QUEUE_KEY = 'saulado-offline-queue'
const LEGACY_SESSION_KEY = 'saulado-offline-session'

export const getStateKey = (userId: string) => `saulado-offline-state:${userId}`

function getActiveUserId(): string {
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Cannot access offline state without an active user')
  return userId
}

function getDefaultState(userId: string): OfflineState {
  return {
    queue: [],
    activeSession: null,
    metadata: {
      userId,
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    },
  }
}

export async function loadOfflineState(): Promise<OfflineState> {
  const userId = getActiveUserId()
  const key = getStateKey(userId)
  const DEFAULT_STATE = getDefaultState(userId)

  try {
    // Silent migration: aggressively clear legacy keys to prevent data leakage
    await AsyncStorage.removeItem(LEGACY_STATE_KEY)
    await AsyncStorage.removeItem(LEGACY_QUEUE_KEY)
    await AsyncStorage.removeItem(LEGACY_SESSION_KEY)

    const raw = await AsyncStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as OfflineState
      if (parsed.metadata?.userId && parsed.metadata.userId !== userId) {
        console.warn(
          `[offline-state] cross-account state detected for user ${parsed.metadata.userId}`,
        )
        await AsyncStorage.removeItem(key)
        return DEFAULT_STATE
      }
      return validateOfflineState(parsed, userId)
    }

    return DEFAULT_STATE
  } catch (error) {
    console.warn('[offline-state] failed to load state, returning default', error)
    return DEFAULT_STATE
  }
}

export async function updateOfflineState(
  updater: (state: OfflineState) => OfflineState | Promise<OfflineState>,
): Promise<OfflineState> {
  // Read-modify-write within a single function to ensure atomic update of the single key
  const currentState = await loadOfflineState()
  const nextState = await updater(currentState)

  const userId = getActiveUserId()
  const key = getStateKey(userId)

  nextState.metadata.userId = userId
  nextState.metadata.updatedAt = new Date().toISOString()

  try {
    await AsyncStorage.setItem(key, JSON.stringify(nextState))
  } catch (error) {
    console.warn('[offline-state] failed to save state', error)
    // Avoid crashing the app on storage failure
  }

  return nextState
}

export async function clearOfflineState(): Promise<void> {
  try {
    const userId = getActiveUserId()
    const key = getStateKey(userId)
    await AsyncStorage.removeItem(key)
  } catch (error) {
    console.warn('[offline-state] failed to clear state', error)
  }
}

export function validateOfflineState(state: OfflineState, activeUserId: string): OfflineState {
  let repaired = false
  const safeState = { ...state }

  if (safeState.activeSession) {
    if (!Array.isArray(safeState.activeSession.queue)) {
      console.warn(
        '[offline-state] Corruption detected: activeSession.queue is not an array. Repairing...',
      )
      safeState.activeSession.queue = []
      repaired = true
    }
    if (!safeState.activeSession.progress) {
      console.warn(
        '[offline-state] Corruption detected: activeSession.progress is missing. Repairing...',
      )
      safeState.activeSession.progress = { answered: 0, total: 0, correct: 0 }
      repaired = true
    }
  }

  if (!Array.isArray(safeState.queue)) {
    console.warn('[offline-state] Corruption detected: queue is not an array. Repairing...')
    safeState.queue = []
    repaired = true
  }

  // Ensure we inject the userId into the metadata if it's missing or from a legacy version
  if (!safeState.metadata || safeState.metadata.userId !== activeUserId) {
    safeState.metadata = {
      ...safeState.metadata,
      userId: activeUserId,
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    }
    repaired = true
  }

  if (repaired) {
    safeState.metadata.updatedAt = new Date().toISOString()
  }

  return safeState
}

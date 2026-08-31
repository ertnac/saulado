import AsyncStorage from '@react-native-async-storage/async-storage'
import * as api from '../../services/cards'
import { useAuthStore } from '../../stores/auth'
import type { OfflineSetIndex, OfflineSetPayload } from './types'

// Legacy keys for migration
const LEGACY_SETS_INDEX_KEY = 'saulado-offline-sets-index'

export const getSetsIndexKey = (userId: string) => `saulado-offline-sets-index:${userId}`
export const getSetPayloadKey = (userId: string, setId: string) =>
  `saulado-offline-set:${userId}:${setId}`

function getActiveUserId(): string {
  const userId = useAuthStore.getState().user?.id
  if (!userId) throw new Error('Cannot access offline sets without an active user')
  return userId
}

// In-memory locks for duplicate protection
const activeDownloads = new Map<string, Promise<void>>()

const indexListeners = new Set<() => void>()
export function onOfflineIndexUpdated(listener: () => void): () => void {
  indexListeners.add(listener)
  return () => indexListeners.delete(listener)
}

export async function getOfflineSetIndex(): Promise<OfflineSetIndex> {
  const userId = getActiveUserId()
  const key = getSetsIndexKey(userId)

  try {
    // Silent migration: delete legacy global keys to prevent data leakage
    await AsyncStorage.removeItem(LEGACY_SETS_INDEX_KEY)

    const raw = await AsyncStorage.getItem(key)
    if (raw) return JSON.parse(raw) as OfflineSetIndex
  } catch (e) {
    console.warn('[offline-sets] failed to read index', e)
  }
  return { sets: {} }
}

export async function updateOfflineSetIndex(
  updater: (index: OfflineSetIndex) => void,
): Promise<OfflineSetIndex> {
  const userId = getActiveUserId()
  const key = getSetsIndexKey(userId)

  const index = await getOfflineSetIndex()
  updater(index)
  try {
    await AsyncStorage.setItem(key, JSON.stringify(index))
    indexListeners.forEach((l) => l())
  } catch (e) {
    console.warn('[offline-sets] failed to write index', e)
  }
  return index
}

// Bounded concurrency helper
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

export function downloadSet(setId: string): Promise<void> {
  const existing = activeDownloads.get(setId)
  if (existing) return existing

  const promise = (async () => {
    try {
      // 1. Mark downloading
      await updateOfflineSetIndex((idx) => {
        idx.sets[setId] = { setId, status: 'downloading', updatedAt: new Date().toISOString() }
      })

      // 2. Fetch metadata
      const setRes = await api.getSet(setId)

      // 3. Fetch all card summaries (pagination)
      const cardSummaries = []
      let cursor: string | null = null
      do {
        const page = await api.listCards(setId, { limit: 50, cursor: cursor || undefined })
        cardSummaries.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)

      // 4. Fetch full cards with bounded concurrency (10 at a time)
      const fullCards = await mapLimit(cardSummaries, 10, async (summary) => {
        const detail = await api.getCard(summary.id)
        return detail.card
      })

      // 5. Construct payload
      const payload: OfflineSetPayload = {
        userId: getActiveUserId(),
        setId,
        version: 1, // future use
        downloadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: setRes.set,
        cards: fullCards,
      }

      // 6. Persist complete payload
      const payloadKey = getSetPayloadKey(getActiveUserId(), setId)
      await AsyncStorage.setItem(payloadKey, JSON.stringify(payload))

      // 7. Mark available in index (atomic swap over state)
      await updateOfflineSetIndex((idx) => {
        idx.sets[setId] = { setId, status: 'available', updatedAt: new Date().toISOString() }
      })
    } catch (error) {
      console.warn(`[offline-sets] failed to download set ${setId}`, error)
      await updateOfflineSetIndex((idx) => {
        idx.sets[setId] = { setId, status: 'failed', updatedAt: new Date().toISOString() }
      })
      throw error
    } finally {
      activeDownloads.delete(setId)
    }
  })()

  activeDownloads.set(setId, promise)
  return promise
}

export async function getOfflineSet(setId: string): Promise<OfflineSetPayload | null> {
  const index = await getOfflineSetIndex()
  const entry = index.sets[setId]
  if (!entry || entry.status !== 'available') return null

  try {
    const userId = getActiveUserId()
    const payloadKey = getSetPayloadKey(userId, setId)

    // Check for unscoped legacy payload to discard
    await AsyncStorage.removeItem(`saulado-offline-set:${setId}`)

    const raw = await AsyncStorage.getItem(payloadKey)
    if (!raw) {
      // Missing payload for available set -> corrupted
      return null
    }

    // Attempt to parse and validate
    const parsed = JSON.parse(raw) as OfflineSetPayload
    if (
      parsed.setId !== setId ||
      parsed.userId !== userId ||
      !parsed.metadata ||
      !Array.isArray(parsed.cards)
    ) {
      console.warn(`[offline-sets] corrupted or cross-account payload for set ${setId}`)
      // Auto-remove corrupted
      await removeOfflineSet(setId)
      return null
    }

    return parsed
  } catch (e) {
    console.warn(`[offline-sets] error reading set ${setId}`, e)
    return null
  }
}

export async function removeOfflineSet(setId: string): Promise<void> {
  // Delete payload first
  const userId = getActiveUserId()
  const payloadKey = getSetPayloadKey(userId, setId)
  try {
    await AsyncStorage.removeItem(payloadKey)
  } catch (e) {
    console.warn(`[offline-sets] error removing payload for set ${setId}`, e)
  }

  // Then remove from index
  await updateOfflineSetIndex((idx) => {
    delete idx.sets[setId]
  })
}

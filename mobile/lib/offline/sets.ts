import * as api from '../../services/cards'
import { useAuthStore } from '../../stores/auth'
import { loadAuthCache } from '../../services/auth-cache'
import { getDatabase, migrateAsyncStoragePayloads } from './db'
import { buildUserFilter, getCards, mapSQLiteRowToStudySet } from './data-source'
import type { OfflineSetIndex, OfflineSetPayload, SQLiteStudySet } from './types'

export { onOfflineIndexUpdated, notifyOfflineIndexUpdated } from './events'
import { notifyOfflineIndexUpdated } from './events'

async function getActiveUserId(): Promise<string | null> {
  const storeUser = useAuthStore.getState().user
  if (storeUser?.id) return storeUser.id
  const cached = await loadAuthCache()
  if (cached?.user?.id) return cached.user.id
  try {
    const db = await getDatabase()
    const row = await db.getFirstAsync<{ user_id: string }>(
      'SELECT user_id FROM study_sets WHERE user_id IS NOT NULL LIMIT 1',
    )
    if (row?.user_id) return row.user_id
  } catch {
    // Database may not be initialized yet
  }
  return null
}

const activeDownloads = new Map<string, Promise<void>>()

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

export async function getOfflineSetIndex(): Promise<OfflineSetIndex> {
  const userId = await getActiveUserId()
  if (!userId) return { sets: {} }

  // Perform migration if needed
  await migrateAsyncStoragePayloads(userId)

  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const rows = await db.getAllAsync<SQLiteStudySet>(
    `SELECT * FROM study_sets WHERE ${sql} AND is_deleted = 0 AND (is_downloaded = 1 OR sync_status LIKE 'pending_%' OR id LIKE 'temp-set-%') ORDER BY updated_at DESC`,
    params,
  )
  const result: OfflineSetIndex = { sets: {} }

  for (const set of rows) {
    const studySet = mapSQLiteRowToStudySet(set)
    result.sets[set.id] = {
      setId: set.id,
      status: 'available',
      syncStatus: set.sync_status,
      updatedAt: set.updated_at,
      metadata: studySet,
      isDownloaded: set.is_downloaded === 1,
    }
  }

  return result
}

export async function getOfflineSet(setId: string): Promise<OfflineSetPayload | null> {
  const userId = await getActiveUserId()
  if (!userId || !setId) return null

  await migrateAsyncStoragePayloads(userId)

  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const row = await db.getFirstAsync<SQLiteStudySet>(
    `SELECT * FROM study_sets WHERE ${sql} AND id = ? AND is_deleted = 0 AND (is_downloaded = 1 OR sync_status LIKE 'pending_%' OR id LIKE 'temp-set-%')`,
    [...params, setId],
  )
  if (!row) return null

  const set = mapSQLiteRowToStudySet(row)
  const cards = await getCards(userId, setId)

  return {
    userId,
    setId,
    version: 1,
    downloadedAt: set.updatedAt,
    updatedAt: set.updatedAt,
    metadata: set,
    cards,
  }
}

export function downloadSet(setId: string): Promise<void> {
  const existing = activeDownloads.get(setId)
  if (existing) return existing

  const promise = (async () => {
    try {
      const userId = await getActiveUserId()
      if (!userId) throw new Error('Cannot download set without an active user')

      const db = await getDatabase()

      // 1. Fetch metadata from API
      const setRes = await api.getSet(setId)

      // 2. Fetch all card summaries
      const cardSummaries = []
      let cursor: string | null = null
      do {
        const page = await api.listCards(setId, { limit: 50, cursor: cursor || undefined })
        cardSummaries.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)

      // 3. Fetch full card details in parallel with bounded concurrency
      const fullCards = await mapLimit(cardSummaries, 10, async (summary) => {
        const detail = await api.getCard(summary.id)
        return detail.card
      })

      const now = new Date().toISOString()

      // 4. Save set and cards to SQLite in a single transaction
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO study_sets (
            id, user_id, title, parent_id, color, archived_at, card_count, subtree_card_count, child_count, is_deleted, sync_status, is_downloaded, created_at, updated_at, last_synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'synced', 1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            parent_id = excluded.parent_id,
            color = excluded.color,
            archived_at = excluded.archived_at,
            card_count = excluded.card_count,
            subtree_card_count = excluded.subtree_card_count,
            child_count = excluded.child_count,
            is_deleted = 0,
            sync_status = 'synced',
            is_downloaded = 1,
            updated_at = excluded.updated_at,
            last_synced_at = excluded.last_synced_at`,
          [
            setId,
            userId,
            setRes.set.title,
            setRes.set.parentId ?? null,
            setRes.set.color ?? 'amber',
            setRes.set.archivedAt ?? null,
            setRes.set.cardCount,
            setRes.set.subtreeCardCount ?? setRes.set.cardCount,
            setRes.set.childCount ?? 0,
            setRes.set.createdAt ?? now,
            setRes.set.updatedAt ?? now,
            now,
          ],
        )

        for (const card of fullCards) {
          const answersJson = JSON.stringify(card.answers ?? [])
          const tagsJson = JSON.stringify(card.tags ?? [])

          await db.runAsync(
            `INSERT INTO study_cards (
              id, set_id, user_id, paragraph, answers, tags, is_deleted, sync_status, created_at, updated_at, last_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 'synced', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              set_id = excluded.set_id,
              paragraph = excluded.paragraph,
              answers = excluded.answers,
              tags = excluded.tags,
              is_deleted = 0,
              sync_status = 'synced',
              updated_at = excluded.updated_at,
              last_synced_at = excluded.last_synced_at`,
            [
              card.id,
              setId,
              userId,
              card.paragraph ?? '',
              answersJson,
              tagsJson,
              card.createdAt ?? now,
              card.updatedAt ?? now,
              now,
            ],
          )
        }
      })

      notifyOfflineIndexUpdated()
    } catch (error) {
      console.warn(`[offline-sets] failed to download set ${setId}`, error)
      throw error
    } finally {
      activeDownloads.delete(setId)
    }
  })()

  activeDownloads.set(setId, promise)
  return promise
}

export async function removeOfflineSet(setId: string): Promise<void> {
  const userId = await getActiveUserId()
  if (!userId || !setId) return

  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM study_cards WHERE ${sql} AND set_id = ? AND sync_status NOT LIKE 'pending_%'`,
      [...params, setId],
    )
    if (setId.startsWith('temp-set-')) {
      await db.runAsync(`DELETE FROM study_sets WHERE ${sql} AND id = ?`, [...params, setId])
    } else {
      await db.runAsync(`UPDATE study_sets SET is_downloaded = 0 WHERE ${sql} AND id = ?`, [
        ...params,
        setId,
      ])
    }
  })

  notifyOfflineIndexUpdated()
}

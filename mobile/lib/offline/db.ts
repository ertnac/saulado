import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SQLite from 'expo-sqlite'
import type { OfflineSetPayload } from './types'

let dbInstance: SQLite.SQLiteDatabase | null = null

/**
 * Returns a shared, initialized SQLite database instance.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance

  const db = await SQLite.openDatabaseAsync('saulado-offline.db')
  await initDatabase(db)
  dbInstance = db
  return dbInstance
}

/**
 * Creates required tables, sets WAL journal mode, enables foreign keys,
 * and builds multi-column indexes for fast user-scoped queries.
 */
export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS study_sets (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      parent_id TEXT,
      color TEXT NOT NULL DEFAULT 'amber',
      archived_at TEXT,
      card_count INTEGER NOT NULL DEFAULT 0,
      subtree_card_count INTEGER NOT NULL DEFAULT 0,
      child_count INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      is_downloaded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS study_cards (
      id TEXT PRIMARY KEY NOT NULL,
      set_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      paragraph TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS id_mappings (
      temp_id TEXT PRIMARY KEY NOT NULL,
      server_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repository_files (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      cloud_file_id TEXT,
      name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      page_count INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_viewed_at TEXT
    );
  `)

  // Step 2: Run column migrations first before indexes
  try {
    await db.execAsync(
      `ALTER TABLE study_sets ADD COLUMN is_downloaded INTEGER NOT NULL DEFAULT 0;`,
    )
  } catch {
    // Column already exists
  }

  try {
    await db.execAsync(`ALTER TABLE repository_files ADD COLUMN cloud_file_id TEXT;`)
  } catch {
    // Column already exists
  }

  // Step 3: Create indexes after columns are guaranteed to exist
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sets_user ON study_sets (user_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_sets_parent ON study_sets (parent_id, user_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_sets_sync ON study_sets (sync_status);
    CREATE INDEX IF NOT EXISTS idx_sets_downloaded ON study_sets (is_downloaded);

    CREATE INDEX IF NOT EXISTS idx_cards_set_user ON study_cards (set_id, user_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_cards_sync ON study_cards (sync_status);

    CREATE INDEX IF NOT EXISTS idx_mappings_server ON id_mappings (server_id);

    CREATE INDEX IF NOT EXISTS idx_repo_files_user ON repository_files (user_id, file_type);
    CREATE INDEX IF NOT EXISTS idx_repo_files_updated ON repository_files (user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_repo_files_cloud ON repository_files (cloud_file_id);
  `)
}

/**
 * One-time silent migration from legacy AsyncStorage payloads to SQLite
 */
export async function migrateAsyncStoragePayloads(userId: string): Promise<void> {
  if (!userId) return
  if (typeof AsyncStorage.getAllKeys !== 'function') return
  const migrationKey = `saulado-sqlite-migrated:${userId}`

  try {
    const migrated = await AsyncStorage.getItem(migrationKey)
    if (migrated === 'v1') return

    const db = await getDatabase()
    const allKeys = await AsyncStorage.getAllKeys()
    const payloadPrefix = `saulado-offline-set:${userId}:`
    const payloadKeys = allKeys.filter((k) => k.startsWith(payloadPrefix))

    for (const key of payloadKeys) {
      const raw = await AsyncStorage.getItem(key)
      if (!raw) continue

      try {
        const payload = JSON.parse(raw) as OfflineSetPayload
        if (payload.userId !== userId || !payload.metadata) continue

        await db.withTransactionAsync(async () => {
          // Upsert set
          await db.runAsync(
            `INSERT OR REPLACE INTO study_sets (
              id, user_id, title, parent_id, color, archived_at, card_count, subtree_card_count, child_count, is_deleted, sync_status, created_at, updated_at, last_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'synced', ?, ?, ?)`,
            [
              payload.setId,
              userId,
              payload.metadata.title,
              payload.metadata.parentId ?? null,
              payload.metadata.color ?? 'amber',
              payload.metadata.archivedAt ?? null,
              payload.metadata.cardCount,
              payload.metadata.subtreeCardCount ?? payload.metadata.cardCount,
              payload.metadata.childCount ?? 0,
              payload.metadata.createdAt ?? payload.downloadedAt,
              payload.metadata.updatedAt ?? payload.downloadedAt,
              payload.downloadedAt,
            ],
          )

          // Upsert cards
          for (const card of payload.cards) {
            await db.runAsync(
              `INSERT OR REPLACE INTO study_cards (
                id, set_id, user_id, paragraph, answers, tags, is_deleted, sync_status, created_at, updated_at, last_synced_at
              ) VALUES (?, ?, ?, ?, ?, ?, 0, 'synced', ?, ?, ?)`,
              [
                card.id,
                payload.setId,
                userId,
                card.paragraph ?? '',
                JSON.stringify(card.answers ?? []),
                JSON.stringify(card.tags ?? []),
                card.createdAt ?? payload.downloadedAt,
                card.updatedAt ?? payload.downloadedAt,
                payload.downloadedAt,
              ],
            )
          }
        })

        // Clean up legacy key
        await AsyncStorage.removeItem(key)
      } catch (err) {
        console.warn(`[offline-db] Failed migrating key ${key}`, err)
      }
    }

    await AsyncStorage.setItem(migrationKey, 'v1')
  } catch (e) {
    console.warn('[offline-db] Error during AsyncStorage to SQLite migration', e)
  }
}

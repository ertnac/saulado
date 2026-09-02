/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import type { SQLiteStudyCard, SQLiteStudySet } from '../types'

export class InMemorySQLiteDatabase {
  sets = new Map<string, SQLiteStudySet>()
  cards = new Map<string, SQLiteStudyCard>()
  idMappings = new Map<string, { temp_id: string; server_id: string; entity_type: string }>()

  reset() {
    this.sets.clear()
    this.cards.clear()
    this.idMappings.clear()
  }

  async execAsync(_sql: string): Promise<void> {}

  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    return await fn()
  }

  async runAsync(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const s = sql.trim()

    if (
      s.startsWith('INSERT INTO study_sets') ||
      s.startsWith('INSERT OR REPLACE INTO study_sets')
    ) {
      const isDownloaded = s.includes('is_downloaded') && s.includes(', 1,') ? 1 : 0
      if (params.length === 7) {
        // From data-source.ts createSet
        const [id, user_id, title, parent_id, color, created_at, updated_at] = params
        this.sets.set(id, {
          id,
          user_id,
          title,
          parent_id,
          color: color ?? 'amber',
          archived_at: null,
          card_count: 0,
          subtree_card_count: 0,
          child_count: 0,
          is_deleted: 0,
          sync_status: 'pending_create',
          is_downloaded: 0,
          created_at,
          updated_at,
          last_synced_at: null,
        })
      } else {
        // From sets.ts downloadSet or mirrorSetToSQLite
        const [
          id,
          user_id,
          title,
          parent_id,
          color,
          archived_at,
          card_count,
          subtree_card_count,
          child_count,
          created_at,
          updated_at,
          last_synced_at,
        ] = params
        const existing = this.sets.get(id)
        this.sets.set(id, {
          id,
          user_id,
          title,
          parent_id,
          color: color ?? 'amber',
          archived_at: archived_at ?? null,
          card_count: Number(card_count ?? 0),
          subtree_card_count: Number(subtree_card_count ?? card_count ?? 0),
          child_count: Number(child_count ?? 0),
          is_deleted: 0,
          sync_status: 'synced',
          is_downloaded: isDownloaded ? 1 : (existing?.is_downloaded ?? 0),
          created_at,
          updated_at,
          last_synced_at: last_synced_at ?? null,
        })
      }
      return { changes: 1 }
    }

    if (
      s.startsWith('INSERT INTO study_cards') ||
      s.startsWith('INSERT OR REPLACE INTO study_cards')
    ) {
      const [
        id,
        set_id,
        user_id,
        paragraph,
        answers,
        tags,
        created_at,
        updated_at,
        last_synced_at,
      ] = params
      const isPending = s.includes("'pending_create'")
      this.cards.set(id, {
        id,
        set_id,
        user_id,
        paragraph,
        answers: typeof answers === 'string' ? answers : JSON.stringify(answers ?? []),
        tags: typeof tags === 'string' ? tags : JSON.stringify(tags ?? []),
        is_deleted: 0,
        sync_status: isPending ? 'pending_create' : 'synced',
        created_at,
        updated_at,
        last_synced_at: last_synced_at ?? null,
      })
      return { changes: 1 }
    }

    if (
      s.startsWith('INSERT INTO id_mappings') ||
      s.startsWith('INSERT OR REPLACE INTO id_mappings')
    ) {
      const [temp_id, server_id, entity_type] = params
      this.idMappings.set(temp_id, { temp_id, server_id, entity_type })
      return { changes: 1 }
    }

    if (s.includes('UPDATE study_sets') && s.includes('SET card_count = card_count + 1')) {
      const setId = params[params.length - 1]
      const set = this.sets.get(setId)
      if (set) {
        set.card_count = (set.card_count || 0) + 1
        set.subtree_card_count = (set.subtree_card_count || 0) + 1
        set.updated_at = params[0]
      }
      return { changes: 1 }
    }

    if (s.includes('UPDATE study_sets') && s.includes('card_count - 1')) {
      const setId = params[params.length - 1]
      const set = this.sets.get(setId)
      if (set) {
        set.card_count = Math.max(0, (set.card_count || 0) - 1)
        set.subtree_card_count = Math.max(0, (set.subtree_card_count || 0) - 1)
        set.updated_at = params[0]
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_sets') && s.includes('SET title = ?')) {
      const [title, parent_id, color, archived_at, sync_status, updated_at, _userId, setId] = params
      const set = this.sets.get(setId)
      if (set) {
        set.title = title
        set.parent_id = parent_id
        set.color = color
        set.archived_at = archived_at
        set.sync_status = sync_status
        set.updated_at = updated_at
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_sets') && s.includes('SET id = ?')) {
      const [newId, updatedAt, lastSyncedAt, oldId] = params
      const set = this.sets.get(oldId)
      if (set) {
        this.sets.delete(oldId)
        set.id = newId
        set.sync_status = 'synced'
        set.updated_at = updatedAt
        set.last_synced_at = lastSyncedAt
        this.sets.set(newId, set)
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_sets') && s.includes('SET sync_status = ?')) {
      const [sync_status, updated_at, last_synced_at, setId] = params
      const set = this.sets.get(setId)
      if (set) {
        set.sync_status = sync_status
        set.updated_at = updated_at
        set.last_synced_at = last_synced_at
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_cards') && s.includes('SET paragraph = ?')) {
      const [paragraph, answers, tags, sync_status, updated_at, _userId, cardId] = params
      const card = this.cards.get(cardId)
      if (card) {
        card.paragraph = paragraph
        card.answers = typeof answers === 'string' ? answers : JSON.stringify(answers ?? [])
        card.tags = typeof tags === 'string' ? tags : JSON.stringify(tags ?? [])
        card.sync_status = sync_status
        card.updated_at = updated_at
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_cards') && s.includes('SET id = ?, set_id = ?')) {
      const [newId, newSetId, updatedAt, lastSyncedAt, oldId] = params
      const card = this.cards.get(oldId)
      if (card) {
        this.cards.delete(oldId)
        card.id = newId
        card.set_id = newSetId
        card.sync_status = 'synced'
        card.updated_at = updatedAt
        card.last_synced_at = lastSyncedAt
        this.cards.set(newId, card)
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_cards') && s.includes('SET set_id = ? WHERE set_id = ?')) {
      const [newSetId, oldSetId] = params
      for (const card of this.cards.values()) {
        if (card.set_id === oldSetId) {
          card.set_id = newSetId
        }
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_cards') && s.includes('SET is_deleted = 1')) {
      const cardId = params[params.length - 1]
      const card = this.cards.get(cardId)
      if (card) {
        card.is_deleted = 1
        card.sync_status = 'pending_delete'
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_sets') && s.includes('SET is_deleted = 1')) {
      const setId = params[params.length - 1]
      const set = this.sets.get(setId)
      if (set) {
        set.is_deleted = 1
        set.sync_status = 'pending_delete'
      }
      return { changes: 1 }
    }

    if (s.startsWith('UPDATE study_sets') && s.includes('SET is_downloaded = 0')) {
      const setId = params[params.length - 1]
      const set = this.sets.get(setId)
      if (set) {
        set.is_downloaded = 0
      }
      return { changes: 1 }
    }

    if (
      s.startsWith('DELETE FROM study_cards WHERE user_id = ? AND id = ?') ||
      s.startsWith('DELETE FROM study_cards WHERE id = ?')
    ) {
      const cardId = params[params.length - 1]
      this.cards.delete(cardId)
      return { changes: 1 }
    }

    if (
      s.startsWith('DELETE FROM study_cards WHERE user_id = ? AND set_id = ?') ||
      s.startsWith('DELETE FROM study_cards WHERE set_id = ?')
    ) {
      const setId = params[params.length - 1]
      for (const [id, c] of this.cards.entries()) {
        if (c.set_id === setId) this.cards.delete(id)
      }
      return { changes: 1 }
    }

    if (
      s.startsWith('DELETE FROM study_sets WHERE user_id = ? AND id = ?') ||
      s.startsWith('DELETE FROM study_sets WHERE id = ?')
    ) {
      const setId = params[params.length - 1]
      this.sets.delete(setId)
      return { changes: 1 }
    }

    return { changes: 0 }
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    if (sql.includes('FROM study_sets')) {
      const [userId, setId] = params
      const set = this.sets.get(setId)
      if (set && set.user_id === userId && set.is_deleted === 0) {
        if (
          sql.includes('is_downloaded = 1') &&
          set.is_downloaded !== 1 &&
          set.sync_status === 'synced' &&
          !set.id.startsWith('temp-set-')
        ) {
          return null
        }
        return { ...set } as any
      }
      return null
    }

    if (sql.includes('FROM study_cards')) {
      const [userId, cardId] = params
      const card = this.cards.get(cardId)
      if (card && card.user_id === userId && card.is_deleted === 0) {
        return { ...card } as any
      }
      return null
    }

    return null
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    if (sql.includes('FROM study_sets')) {
      const userId = params[0]
      const parentId = params.length > 1 ? params[1] : undefined
      const isFilteredByDownload = sql.includes('is_downloaded = 1')

      const results: SQLiteStudySet[] = []
      for (const set of this.sets.values()) {
        if (set.user_id !== userId || set.is_deleted !== 0) continue
        if (
          isFilteredByDownload &&
          set.is_downloaded !== 1 &&
          set.sync_status === 'synced' &&
          !set.id.startsWith('temp-set-')
        )
          continue
        if (parentId === null && set.parent_id !== null) continue
        if (parentId !== undefined && parentId !== null && set.parent_id !== parentId) continue
        results.push({ ...set })
      }
      return results as any
    }

    if (sql.includes('FROM study_cards')) {
      const [userId, setId] = params
      const results: SQLiteStudyCard[] = []
      for (const card of this.cards.values()) {
        if (card.user_id === userId && card.set_id === setId && card.is_deleted === 0) {
          results.push({ ...card })
        }
      }
      return results as any
    }

    return []
  }
}

export const mockDbInstance = new InMemorySQLiteDatabase()

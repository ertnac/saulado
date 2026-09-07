import type {
  CardAnswer,
  CreateCardRequest,
  CreateSetRequest,
  SetColor,
  StudyCard,
  StudySet,
  UpdateCardRequest,
  UpdateSetRequest,
} from '@saulado/shared'
import { getDatabase } from './db'
export { getDatabase } from './db'
import { compactQueue } from './compaction'
import { updateOfflineState } from './state'
import { notifyOfflineIndexUpdated } from './events'
import type {
  OfflineCreateCardMutation,
  OfflineCreateSetMutation,
  OfflineDeleteCardMutation,
  OfflineDeleteSetMutation,
  OfflineUpdateCardMutation,
  OfflineUpdateSetMutation,
  SQLiteStudyCard,
  SQLiteStudySet,
  SyncStatus,
} from './types'

function generateUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function generateTempSetId(): string {
  return `temp-set-${generateUUID()}`
}

export function generateTempCardId(): string {
  return `temp-card-${generateUUID()}`
}

export function mapSQLiteRowToStudySet(row: SQLiteStudySet): StudySet {
  return {
    id: row.id,
    title: row.title,
    parentId: row.parent_id,
    color: (row.color as SetColor) || 'amber',
    archivedAt: row.archived_at,
    cardCount: row.card_count,
    subtreeCardCount: row.subtree_card_count,
    childCount: row.child_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSQLiteRowToStudyCard(row: SQLiteStudyCard): StudyCard {
  let answers: CardAnswer[] = []
  try {
    const parsed = (
      typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
    ) as unknown
    answers = Array.isArray(parsed) ? (parsed as CardAnswer[]) : []
  } catch {
    answers = []
  }

  let tags: string[] = []
  try {
    const parsed = (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) as unknown
    tags = Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    tags = []
  }

  return {
    id: row.id,
    studySetId: row.set_id,
    paragraph: row.paragraph,
    answers,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildUserFilter(userId: string): { sql: string; params: string[] } {
  if (!userId || userId === 'local-user') {
    return { sql: '1=1', params: [] }
  }
  return { sql: "(user_id = ? OR user_id = 'local-user')", params: [userId] }
}

// ── Sets CRUD ────────────────────────────────────────────────────────────────

export async function createSet(userId: string, input: CreateSetRequest): Promise<StudySet> {
  if (!userId) throw new Error('Cannot create set without an active userId')
  const db = await getDatabase()
  const tempSetId = generateTempSetId()
  const now = new Date().toISOString()
  const color = input.color ?? 'amber'

  await db.runAsync(
    `INSERT INTO study_sets (
      id, user_id, title, parent_id, color, archived_at, card_count, subtree_card_count, child_count, is_deleted, sync_status, is_downloaded, created_at, updated_at, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, 'pending_create', 0, ?, ?, NULL)`,
    [tempSetId, userId, input.title, input.parentId ?? null, color, now, now],
  )

  const mutation: OfflineCreateSetMutation = {
    type: 'create_set',
    tempSetId,
    title: input.title,
    parentId: input.parentId,
    color: input.color,
    userId,
    idempotencyKey: generateUUID(),
    queuedAt: now,
    status: 'pending',
  }

  await updateOfflineState((prev) => ({
    ...prev,
    queue: compactQueue([...prev.queue, mutation]),
  }))

  notifyOfflineIndexUpdated()

  return {
    id: tempSetId,
    title: input.title,
    parentId: input.parentId ?? null,
    color,
    archivedAt: null,
    cardCount: 0,
    subtreeCardCount: 0,
    childCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export async function getSet(userId: string, setId: string): Promise<StudySet | null> {
  if (!setId) return null
  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const row = await db.getFirstAsync<SQLiteStudySet>(
    `SELECT * FROM study_sets WHERE ${sql} AND id = ? AND is_deleted = 0`,
    [...params, setId],
  )
  if (!row) return null
  return mapSQLiteRowToStudySet(row)
}

export async function getSets(userId: string, parentId?: string | null): Promise<StudySet[]> {
  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  let rows: SQLiteStudySet[]

  if (parentId === undefined) {
    rows = await db.getAllAsync<SQLiteStudySet>(
      `SELECT * FROM study_sets WHERE ${sql} AND is_deleted = 0 ORDER BY updated_at DESC`,
      params,
    )
  } else if (parentId === null) {
    rows = await db.getAllAsync<SQLiteStudySet>(
      `SELECT * FROM study_sets WHERE ${sql} AND parent_id IS NULL AND is_deleted = 0 ORDER BY updated_at DESC`,
      params,
    )
  } else {
    rows = await db.getAllAsync<SQLiteStudySet>(
      `SELECT * FROM study_sets WHERE ${sql} AND parent_id = ? AND is_deleted = 0 ORDER BY updated_at DESC`,
      [...params, parentId],
    )
  }

  return rows.map(mapSQLiteRowToStudySet)
}

export async function updateSet(
  userId: string,
  setId: string,
  patch: UpdateSetRequest,
): Promise<StudySet> {
  if (!setId) throw new Error('Cannot update set without setId')
  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const existing = await db.getFirstAsync<SQLiteStudySet>(
    `SELECT * FROM study_sets WHERE ${sql} AND id = ? AND is_deleted = 0`,
    [...params, setId],
  )
  if (!existing) throw new Error(`Set ${setId} not found`)

  const now = new Date().toISOString()
  const title = patch.title ?? existing.title
  const parentId = patch.parentId !== undefined ? patch.parentId : existing.parent_id
  const color = patch.color ?? existing.color
  const archivedAt =
    patch.archived === true ? now : patch.archived === false ? null : existing.archived_at
  const nextSyncStatus: SyncStatus =
    existing.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'

  await db.runAsync(
    `UPDATE study_sets 
     SET title = ?, parent_id = ?, color = ?, archived_at = ?, sync_status = ?, updated_at = ?
     WHERE ${sql} AND id = ?`,
    [title, parentId, color, archivedAt, nextSyncStatus, now, ...params, setId],
  )

  const mutation: OfflineUpdateSetMutation = {
    type: 'update_set',
    setId,
    title: patch.title,
    parentId: patch.parentId,
    color: patch.color,
    archived: patch.archived,
    clientUpdatedAt: now,
    userId: existing.user_id || userId,
    idempotencyKey: generateUUID(),
    queuedAt: now,
    status: 'pending',
  }

  await updateOfflineState((prev) => ({
    ...prev,
    queue: compactQueue([...prev.queue, mutation]),
  }))

  notifyOfflineIndexUpdated()

  return {
    ...mapSQLiteRowToStudySet(existing),
    title,
    parentId,
    color: color as SetColor,
    archivedAt,
    updatedAt: now,
  }
}

export async function deleteSet(userId: string, setId: string): Promise<void> {
  if (!setId) return
  const db = await getDatabase()
  const isTemp = setId.startsWith('temp-set-')
  const now = new Date().toISOString()
  const { sql, params } = buildUserFilter(userId)

  await db.withTransactionAsync(async () => {
    if (isTemp) {
      await db.runAsync(`DELETE FROM study_cards WHERE ${sql} AND set_id = ?`, [...params, setId])
      await db.runAsync(`DELETE FROM study_sets WHERE ${sql} AND id = ?`, [...params, setId])
    } else {
      await db.runAsync(
        `UPDATE study_cards SET is_deleted = 1, sync_status = 'pending_delete', updated_at = ? WHERE ${sql} AND set_id = ?`,
        [now, ...params, setId],
      )
      await db.runAsync(
        `UPDATE study_sets SET is_deleted = 1, sync_status = 'pending_delete', updated_at = ? WHERE ${sql} AND id = ?`,
        [now, ...params, setId],
      )
    }
  })

  const mutation: OfflineDeleteSetMutation = {
    type: 'delete_set',
    setId,
    userId,
    idempotencyKey: generateUUID(),
    queuedAt: now,
    status: 'pending',
  }

  await updateOfflineState((prev) => ({
    ...prev,
    queue: compactQueue([...prev.queue, mutation]),
  }))

  notifyOfflineIndexUpdated()
}

// ── Cards CRUD ────────────────────────────────────────────────────────────────

export async function createCard(
  userId: string,
  setId: string,
  input: CreateCardRequest,
): Promise<StudyCard> {
  if (!userId || !setId) throw new Error('Cannot create card without userId and setId')
  const db = await getDatabase()
  const tempCardId = generateTempCardId()
  const now = new Date().toISOString()
  const tags = input.tags ?? []

  const answers: CardAnswer[] = (input.answers ?? []).map((ans, idx) => ({
    id: generateUUID(),
    ordinal: idx,
    startOffset: ans.startOffset,
    endOffset: ans.endOffset,
    answerText: input.paragraph.slice(ans.startOffset, ans.endOffset),
    altAnswers: ans.altAnswers ?? [],
  }))

  const { sql: setFilterSql, params: setFilterParams } = buildUserFilter(userId)
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO study_cards (
        id, set_id, user_id, paragraph, answers, tags, is_deleted, sync_status, created_at, updated_at, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending_create', ?, ?, NULL)`,
      [
        tempCardId,
        setId,
        userId,
        input.paragraph,
        JSON.stringify(answers),
        JSON.stringify(tags),
        now,
        now,
      ],
    )

    await db.runAsync(
      `UPDATE study_sets 
       SET card_count = card_count + 1, subtree_card_count = subtree_card_count + 1, updated_at = ?
       WHERE ${setFilterSql} AND id = ?`,
      [now, ...setFilterParams, setId],
    )
  })

  const mutation: OfflineCreateCardMutation = {
    type: 'create_card',
    tempCardId,
    setId,
    paragraph: input.paragraph,
    answers: input.answers ?? [],
    tags,
    userId,
    idempotencyKey: generateUUID(),
    queuedAt: now,
    status: 'pending',
  }

  await updateOfflineState((prev) => ({
    ...prev,
    queue: compactQueue([...prev.queue, mutation]),
  }))

  notifyOfflineIndexUpdated()

  return {
    id: tempCardId,
    studySetId: setId,
    paragraph: input.paragraph,
    answers,
    tags,
    createdAt: now,
    updatedAt: now,
  }
}

export async function getCard(userId: string, cardId: string): Promise<StudyCard | null> {
  if (!cardId) return null
  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const row = await db.getFirstAsync<SQLiteStudyCard>(
    `SELECT * FROM study_cards WHERE ${sql} AND id = ? AND is_deleted = 0`,
    [...params, cardId],
  )
  if (!row) return null
  return mapSQLiteRowToStudyCard(row)
}

export async function getCards(userId: string, setId: string): Promise<StudyCard[]> {
  if (!setId) return []
  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const rows = await db.getAllAsync<SQLiteStudyCard>(
    `SELECT * FROM study_cards WHERE ${sql} AND set_id = ? AND is_deleted = 0 ORDER BY created_at ASC`,
    [...params, setId],
  )
  return rows.map(mapSQLiteRowToStudyCard)
}

export async function updateCard(
  userId: string,
  _setId: string,
  cardId: string,
  patch: UpdateCardRequest,
): Promise<StudyCard> {
  if (!cardId) throw new Error('Cannot update card without cardId')
  const db = await getDatabase()
  const { sql, params } = buildUserFilter(userId)
  const existing = await db.getFirstAsync<SQLiteStudyCard>(
    `SELECT * FROM study_cards WHERE ${sql} AND id = ? AND is_deleted = 0`,
    [...params, cardId],
  )
  if (!existing) throw new Error(`Card ${cardId} not found`)

  const now = new Date().toISOString()
  const paragraph = patch.paragraph !== undefined ? patch.paragraph : existing.paragraph

  let answers: CardAnswer[] = []
  if (patch.answers !== undefined) {
    answers = patch.answers.map((ans, idx) => ({
      id: generateUUID(),
      ordinal: idx,
      startOffset: ans.startOffset,
      endOffset: ans.endOffset,
      answerText: paragraph.slice(ans.startOffset, ans.endOffset),
      altAnswers: ans.altAnswers ?? [],
    }))
  } else {
    try {
      const parsed = (
        typeof existing.answers === 'string' ? JSON.parse(existing.answers) : existing.answers
      ) as unknown
      answers = Array.isArray(parsed) ? (parsed as CardAnswer[]) : []
    } catch {
      answers = []
    }
  }

  let tags: string[] = []
  if (patch.tags !== undefined) {
    tags = patch.tags
  } else {
    try {
      const parsed = (
        typeof existing.tags === 'string' ? JSON.parse(existing.tags) : existing.tags
      ) as unknown
      tags = Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      tags = []
    }
  }

  const nextSyncStatus: SyncStatus =
    existing.sync_status === 'pending_create' ? 'pending_create' : 'pending_update'

  const targetSetId =
    patch.studySetId && patch.studySetId !== existing.set_id ? patch.studySetId : existing.set_id
  const isMovingSet = targetSetId !== existing.set_id

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE study_cards
       SET paragraph = ?, answers = ?, tags = ?, set_id = ?, sync_status = ?, updated_at = ?
       WHERE ${sql} AND id = ?`,
      [
        paragraph,
        JSON.stringify(answers),
        JSON.stringify(tags),
        targetSetId,
        nextSyncStatus,
        now,
        ...params,
        cardId,
      ],
    )

    if (isMovingSet) {
      await db.runAsync(
        `UPDATE study_sets 
         SET card_count = MAX(0, card_count - 1), subtree_card_count = MAX(0, subtree_card_count - 1), updated_at = ?
         WHERE ${sql} AND id = ?`,
        [now, ...params, existing.set_id],
      )
      await db.runAsync(
        `UPDATE study_sets 
         SET card_count = card_count + 1, subtree_card_count = subtree_card_count + 1, updated_at = ?
         WHERE ${sql} AND id = ?`,
        [now, ...params, targetSetId],
      )
    }
  })

  const mutation: OfflineUpdateCardMutation = {
    type: 'update_card',
    cardId,
    setId: existing.set_id,
    studySetId: isMovingSet ? targetSetId : undefined,
    paragraph: patch.paragraph,
    answers: patch.answers,
    tags: patch.tags,
    clientUpdatedAt: now,
    userId: existing.user_id || userId,
    idempotencyKey: generateUUID(),
    queuedAt: now,
    status: 'pending',
  }

  await updateOfflineState((prev) => ({
    ...prev,
    queue: compactQueue([...prev.queue, mutation]),
  }))

  notifyOfflineIndexUpdated()

  return {
    ...mapSQLiteRowToStudyCard(existing),
    studySetId: targetSetId,
    paragraph,
    answers,
    tags,
    updatedAt: now,
  }
}

export async function deleteCard(userId: string, setId: string, cardId: string): Promise<void> {
  if (!cardId) return
  const db = await getDatabase()
  const isTemp = cardId.startsWith('temp-card-')
  const now = new Date().toISOString()
  const { sql, params } = buildUserFilter(userId)

  await db.withTransactionAsync(async () => {
    if (isTemp) {
      await db.runAsync(`DELETE FROM study_cards WHERE ${sql} AND id = ?`, [...params, cardId])
    } else {
      await db.runAsync(
        `UPDATE study_cards SET is_deleted = 1, sync_status = 'pending_delete', updated_at = ? WHERE ${sql} AND id = ?`,
        [now, ...params, cardId],
      )
    }

    if (setId) {
      await db.runAsync(
        `UPDATE study_sets 
         SET card_count = MAX(0, card_count - 1), subtree_card_count = MAX(0, subtree_card_count - 1), updated_at = ?
         WHERE ${sql} AND id = ?`,
        [now, ...params, setId],
      )
    }
  })

  const mutation: OfflineDeleteCardMutation = {
    type: 'delete_card',
    cardId,
    setId,
    userId,
    idempotencyKey: generateUUID(),
    queuedAt: now,
    status: 'pending',
  }

  await updateOfflineState((prev) => ({
    ...prev,
    queue: compactQueue([...prev.queue, mutation]),
  }))

  notifyOfflineIndexUpdated()
}

// ── Cache Mirroring from Online API Fetch ─────────────────────────────────────

export async function mirrorSetToSQLite(userId: string, set: StudySet): Promise<void> {
  if (!userId || !set?.id) return
  const db = await getDatabase()
  const now = new Date().toISOString()

  await db.runAsync(
    `INSERT INTO study_sets (
      id, user_id, title, parent_id, color, archived_at, card_count, subtree_card_count, child_count, is_deleted, sync_status, is_downloaded, created_at, updated_at, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'synced', 0, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      parent_id = excluded.parent_id,
      color = excluded.color,
      archived_at = excluded.archived_at,
      card_count = excluded.card_count,
      subtree_card_count = excluded.subtree_card_count,
      child_count = excluded.child_count,
      is_deleted = 0,
      sync_status = CASE WHEN study_sets.sync_status LIKE 'pending_%' THEN study_sets.sync_status ELSE 'synced' END,
      is_downloaded = study_sets.is_downloaded,
      updated_at = excluded.updated_at,
      last_synced_at = excluded.last_synced_at`,
    [
      set.id,
      userId,
      set.title,
      set.parentId ?? null,
      set.color ?? 'amber',
      set.archivedAt ?? null,
      set.cardCount ?? 0,
      set.subtreeCardCount ?? set.cardCount ?? 0,
      set.childCount ?? 0,
      set.createdAt ?? now,
      set.updatedAt ?? now,
      now,
    ],
  )
}

export async function mirrorCardToSQLite(
  userId: string,
  setId: string,
  card: StudyCard,
): Promise<void> {
  if (!userId || !card?.id || !setId) return
  const db = await getDatabase()
  const now = new Date().toISOString()
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
      sync_status = CASE WHEN study_cards.sync_status LIKE 'pending_%' THEN study_cards.sync_status ELSE 'synced' END,
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

import type { AnswerInput, SetColor, StudyCard, StudySet } from '@saulado/shared'

export type SyncStatus =
  'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflict'

export interface SQLiteStudySet {
  id: string
  user_id: string
  title: string
  parent_id: string | null
  color: string
  archived_at: string | null
  card_count: number
  subtree_card_count: number
  child_count: number
  is_deleted: number
  sync_status: SyncStatus
  is_downloaded: number
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

export interface SQLiteStudyCard {
  id: string
  set_id: string
  user_id: string
  paragraph: string
  answers: string // JSON of CardAnswer[]
  tags: string // JSON of string[]
  is_deleted: number
  sync_status: SyncStatus
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

export interface SQLiteIdMapping {
  temp_id: string
  server_id: string
  entity_type: 'set' | 'card'
  created_at: string
}

export interface OfflineAnswerMutation {
  type?: 'submit_answer'
  sessionId: string
  cardId: string
  submittedValues: Record<string | number, string>
  revealed: boolean
  durationMs: number | null
  userId?: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineCreateSetMutation {
  type: 'create_set'
  tempSetId: string
  title: string
  parentId?: string | null
  color?: SetColor
  userId: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineUpdateSetMutation {
  type: 'update_set'
  setId: string
  title?: string
  parentId?: string | null
  color?: SetColor
  archived?: boolean
  clientUpdatedAt?: string
  userId: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineDeleteSetMutation {
  type: 'delete_set'
  setId: string
  userId: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineCreateCardMutation {
  type: 'create_card'
  tempCardId: string
  setId: string
  paragraph: string
  answers: AnswerInput[]
  tags?: string[]
  userId: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineUpdateCardMutation {
  type: 'update_card'
  cardId: string
  setId: string
  paragraph?: string
  answers?: AnswerInput[]
  tags?: string[]
  clientUpdatedAt?: string
  userId: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineDeleteCardMutation {
  type: 'delete_card'
  cardId: string
  setId: string
  userId: string
  idempotencyKey: string
  queuedAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export type OfflineMutation =
  | OfflineAnswerMutation
  | OfflineCreateSetMutation
  | OfflineUpdateSetMutation
  | OfflineDeleteSetMutation
  | OfflineCreateCardMutation
  | OfflineUpdateCardMutation
  | OfflineDeleteCardMutation

export interface OfflineStateMetadata {
  userId?: string
  schemaVersion: number
  updatedAt: string
}

export interface OfflineActiveSession {
  sessionId?: string
  session?: unknown
  queue?: unknown[]
  progress?: {
    answered: number
    total: number
    correct: number
  }
  persistedAt?: string
}

export interface OfflineState {
  queue: OfflineMutation[]
  activeSession: OfflineActiveSession | null
  metadata: OfflineStateMetadata
}

export type OfflineSetStatus = 'downloading' | 'available' | 'failed'

export interface OfflineSetIndexEntry {
  setId: string
  status: OfflineSetStatus
  syncStatus?: SyncStatus
  updatedAt: string
  metadata?: StudySet
}

export interface OfflineSetIndex {
  sets: Record<string, OfflineSetIndexEntry>
}

export interface OfflineSetPayload {
  userId: string
  setId: string
  version: number
  downloadedAt: string
  updatedAt: string
  metadata: StudySet
  cards: StudyCard[]
}

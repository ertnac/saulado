import type { AnswerResponse, SessionCard, SessionProgress } from '@saulado/shared'

export interface OfflineMutation {
  userId?: string // Made optional for backward compatibility during parse
  sessionId: string
  cardId: string
  submittedValues: Record<number, string>
  revealed: boolean
  durationMs: number | null
  idempotencyKey: string
  queuedAt: string // ISO date string
  status?: 'pending' | 'failed'
  error?: string
}

export interface OfflineSessionSnapshot {
  id: string
  queue: SessionCard[]
  progress: SessionProgress
  values: Record<number, string>
  answer: AnswerResponse | null
  idempotencyKey: string
  lastSyncAt: string
}

export interface OfflineState {
  queue: OfflineMutation[]
  activeSession: OfflineSessionSnapshot | null
  metadata: {
    userId?: string
    updatedAt: string
    schemaVersion: number
  }
}

export interface OfflineSetIndexEntry {
  setId: string
  updatedAt: string
  status: 'downloading' | 'available' | 'failed'
}

export interface OfflineSetIndex {
  sets: Record<string, OfflineSetIndexEntry>
}

import type { StudySet, StudyCard } from '@saulado/shared'

export interface OfflineSetPayload {
  userId?: string // Optional for backwards compatibility during parse, but required in practice
  setId: string
  version: number
  downloadedAt: string
  updatedAt: string
  metadata: StudySet
  cards: StudyCard[]
}

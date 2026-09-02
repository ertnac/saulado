import { onlineManager } from '@tanstack/react-query'
import * as api from '../../services/cards'
import { submitAnswer } from '../../services/study'
import { queryClient } from '../query-client'
import { useAuthStore } from '../../stores/auth'
import { useSyncStore } from '../../stores/sync'
import { useOfflineSetsStore } from '../../stores/offline-sets'
import { getDatabase } from './db'
import { compactQueue } from './compaction'
import { recordIdMapping, resolveEntityId } from './id-remap'
import { loadOfflineState, updateOfflineState } from './state'
import type { BlankSubmission, SubmitAnswerRequest } from '@saulado/shared'
import type {
  OfflineAnswerMutation,
  OfflineCreateCardMutation,
  OfflineCreateSetMutation,
  OfflineDeleteCardMutation,
  OfflineDeleteSetMutation,
  OfflineMutation,
  OfflineUpdateCardMutation,
  OfflineUpdateSetMutation,
} from './types'

function getMutationDependencyLevel(m: OfflineMutation): number {
  const type = m.type ?? 'submit_answer'
  switch (type) {
    case 'create_set':
      return 1
    case 'create_card':
      return 2
    case 'update_set':
    case 'update_card':
      return 3
    case 'submit_answer':
      return 4
    case 'delete_card':
      return 5
    case 'delete_set':
      return 6
    default:
      return 4
  }
}

export class SyncEngine {
  private isSyncing = false
  private retryTimeout: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private unsubOnline: (() => void) | null = null
  private unsubAuth: (() => void) | null = null

  start() {
    this.stop()

    this.unsubOnline = onlineManager.subscribe((isOnline) => {
      if (isOnline) {
        void this.triggerSync()
      } else {
        if (this.retryTimeout) {
          clearTimeout(this.retryTimeout)
          this.retryTimeout = null
        }
        useSyncStore.getState().setStatus('offline')
      }
    })

    this.unsubAuth = useAuthStore.subscribe((state) => {
      if (
        (state.status === 'authenticated' || state.status === 'offline-authenticated') &&
        onlineManager.isOnline()
      ) {
        void this.triggerSync()
      }
    })

    if (onlineManager.isOnline()) {
      void this.triggerSync()
    } else {
      useSyncStore.getState().setStatus('offline')
    }
  }

  stop() {
    this.unsubOnline?.()
    this.unsubOnline = null
    this.unsubAuth?.()
    this.unsubAuth = null
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }
    this.isSyncing = false
  }

  async triggerSync() {
    if (this.isSyncing) return
    if (!onlineManager.isOnline()) return
    if (useAuthStore.getState().status === 'anonymous') return

    this.isSyncing = true
    useSyncStore.getState().setStatus('syncing')

    try {
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout)
        this.retryTimeout = null
      }

      await this.processQueue()

      // Success! Reset retry count.
      this.retryCount = 0
    } catch (error) {
      console.warn('[sync-engine] Sync failed temporarily', error)
      useSyncStore.getState().setStatus('error')

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s (max 60s)
      this.retryCount++
      const maxRetries = 10

      if (this.retryCount <= maxRetries && onlineManager.isOnline()) {
        const delay = Math.min(60000, Math.pow(2, this.retryCount) * 1000)
        this.retryTimeout = setTimeout(() => {
          void this.triggerSync()
        }, delay)
      } else {
        if (this.retryCount > maxRetries) {
          useSyncStore
            .getState()
            .setError('Sync failed after maximum retries. Will retry when connection changes.')
          this.retryCount = 0
        }
      }
    } finally {
      this.isSyncing = false
      if (useSyncStore.getState().status === 'syncing') {
        useSyncStore.getState().setStatus('idle')
      }
    }
  }

  private async processQueue() {
    // 1. Initial compaction of queue
    let state = await updateOfflineState((prev) => ({
      ...prev,
      queue: compactQueue(prev.queue),
    }))

    // 2. Sort queue by topological dependency levels
    const pendingMutations = state.queue.filter((m) => m.status !== 'failed')
    pendingMutations.sort((a, b) => getMutationDependencyLevel(a) - getMutationDependencyLevel(b))

    useSyncStore.getState().setPendingCount(pendingMutations.length)

    while (pendingMutations.length > 0) {
      if (!onlineManager.isOnline()) {
        useSyncStore.getState().setStatus('offline')
        return
      }

      const mutation = pendingMutations[0]!
      const activeUserId = useAuthStore.getState().user?.id

      if (mutation.userId && mutation.userId !== activeUserId) {
        console.warn(
          `[sync-engine] Quarantine cross-account mutation: mutation.userId=${mutation.userId} active=${activeUserId}`,
        )
        state = await updateOfflineState((prev) => {
          const newQueue = prev.queue.map((m) =>
            m.idempotencyKey === mutation.idempotencyKey
              ? { ...m, status: 'failed' as const, error: 'Quarantined: Cross-account mutation' }
              : m,
          )
          return { ...prev, queue: newQueue }
        })
        pendingMutations.shift()
        continue
      }

      try {
        await this.processMutation(mutation)

        // Success -> remove from persistent queue atomically
        state = await updateOfflineState((prev) => {
          return {
            ...prev,
            queue: prev.queue.filter((m) => m.idempotencyKey !== mutation.idempotencyKey),
          }
        })

        pendingMutations.shift()
        useSyncStore.getState().setPendingCount(pendingMutations.length)
      } catch (error) {
        const isObj = typeof error === 'object' && error !== null
        const errStatus =
          isObj && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : undefined
        const errCode =
          isObj && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
            ? (error as { code: string }).code
            : undefined
        const isPermanent =
          errStatus === 400 ||
          errStatus === 403 ||
          errStatus === 404 ||
          errStatus === 422 ||
          errCode === 'VALIDATION_ERROR'

        if (isPermanent) {
          const errMsg =
            isObj &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
              ? (error as { message: string }).message
              : 'Validation error'
          // Mark as failed permanently and retain in queue for inspection
          state = await updateOfflineState((prev) => {
            const newQueue = prev.queue.map((m) =>
              m.idempotencyKey === mutation.idempotencyKey
                ? { ...m, status: 'failed' as const, error: errMsg }
                : m,
            )
            return { ...prev, queue: newQueue }
          })
          pendingMutations.shift()
          useSyncStore.getState().setPendingCount(pendingMutations.length)
          useSyncStore.getState().setError(`Validation error during sync: ${errMsg}`)
          continue
        } else {
          throw error
        }
      }
    }

    const currentState = await loadOfflineState()
    const hasFailed = currentState.queue.some((m) => m.status === 'failed')
    if (!hasFailed) {
      useSyncStore.getState().setSuccess()
    } else {
      useSyncStore.getState().setStatus('idle')
    }

    await queryClient.invalidateQueries({ queryKey: ['sets'] })
    await queryClient.invalidateQueries({ queryKey: ['cards'] })
    await queryClient.invalidateQueries({ queryKey: ['dueCounts'] })
  }

  private async processMutation(mutation: OfflineMutation) {
    const db = await getDatabase()
    const now = new Date().toISOString()
    const mutationType = mutation.type ?? 'submit_answer'

    switch (mutationType) {
      case 'create_set': {
        const m = mutation as OfflineCreateSetMutation
        const parentId = m.parentId ? resolveEntityId(m.parentId) : undefined
        const res = await api.createSet({
          title: m.title,
          parentId,
          color: m.color,
        })

        recordIdMapping(m.tempSetId, res.set.id)

        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `INSERT OR REPLACE INTO id_mappings (temp_id, server_id, entity_type, created_at) VALUES (?, ?, 'set', ?)`,
            [m.tempSetId, res.set.id, now],
          )
          await db.runAsync(
            `UPDATE study_sets SET id = ?, sync_status = 'synced', updated_at = ?, last_synced_at = ? WHERE id = ?`,
            [res.set.id, res.set.updatedAt ?? now, now, m.tempSetId],
          )
          await db.runAsync(`UPDATE study_cards SET set_id = ? WHERE set_id = ?`, [
            res.set.id,
            m.tempSetId,
          ])
        })

        queryClient.setQueriesData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
          { queryKey: ['sets', 'list'] },
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items
                  .map((s) => (s.id === m.tempSetId ? res.set : s))
                  .filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx),
              })),
            }
          },
        )
        queryClient.setQueryData(['sets', 'detail', res.set.id], res)
        queryClient.removeQueries({ queryKey: ['sets', 'detail', m.tempSetId] })
        useOfflineSetsStore.getState().removeEntry(m.tempSetId)
        break
      }

      case 'update_set': {
        const m = mutation as OfflineUpdateSetMutation
        const targetSetId = resolveEntityId(m.setId)
        const parentId = m.parentId ? resolveEntityId(m.parentId) : undefined

        const res = await api.updateSet(targetSetId, {
          title: m.title,
          parentId,
          color: m.color,
          archived: m.archived,
        })

        await db.runAsync(
          `UPDATE study_sets SET sync_status = 'synced', updated_at = ?, last_synced_at = ? WHERE id = ?`,
          [res.set.updatedAt ?? now, now, targetSetId],
        )
        break
      }

      case 'delete_set': {
        const m = mutation as OfflineDeleteSetMutation
        const targetSetId = resolveEntityId(m.setId)
        if (!targetSetId.startsWith('temp-set-')) {
          await api.deleteSet(targetSetId)
        }

        await db.withTransactionAsync(async () => {
          await db.runAsync(`DELETE FROM study_cards WHERE set_id = ?`, [targetSetId])
          await db.runAsync(`DELETE FROM study_sets WHERE id = ?`, [targetSetId])
        })
        break
      }

      case 'create_card': {
        const m = mutation as OfflineCreateCardMutation
        const targetSetId = resolveEntityId(m.setId)
        const res = await api.createCard(targetSetId, {
          paragraph: m.paragraph,
          answers: m.answers,
          tags: m.tags,
        })

        recordIdMapping(m.tempCardId, res.card.id)

        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `INSERT OR REPLACE INTO id_mappings (temp_id, server_id, entity_type, created_at) VALUES (?, ?, 'card', ?)`,
            [m.tempCardId, res.card.id, now],
          )
          await db.runAsync(
            `UPDATE study_cards SET id = ?, set_id = ?, sync_status = 'synced', updated_at = ?, last_synced_at = ? WHERE id = ?`,
            [res.card.id, targetSetId, res.card.updatedAt ?? now, now, m.tempCardId],
          )
        })

        const summary = {
          id: res.card.id,
          studySetId: targetSetId,
          paragraph: res.card.paragraph,
          tags: res.card.tags,
          createdAt: res.card.createdAt,
          updatedAt: res.card.updatedAt,
          answerCount: res.card.answers?.length ?? 0,
        }

        queryClient.setQueriesData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
          { queryKey: ['cards', 'list'] },
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items
                  .map((c) => (c.id === m.tempCardId ? summary : c))
                  .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx),
              })),
            }
          },
        )
        queryClient.setQueryData(['cards', 'detail', res.card.id], res)
        queryClient.removeQueries({ queryKey: ['cards', 'detail', m.tempCardId] })
        break
      }

      case 'update_card': {
        const m = mutation as OfflineUpdateCardMutation
        const targetCardId = resolveEntityId(m.cardId)
        const res = await api.updateCard(targetCardId, {
          paragraph: m.paragraph,
          answers: m.answers,
          tags: m.tags,
        })

        await db.runAsync(
          `UPDATE study_cards SET sync_status = 'synced', updated_at = ?, last_synced_at = ? WHERE id = ?`,
          [res.card.updatedAt ?? now, now, targetCardId],
        )
        break
      }

      case 'delete_card': {
        const m = mutation as OfflineDeleteCardMutation
        const targetCardId = resolveEntityId(m.cardId)
        if (!targetCardId.startsWith('temp-card-')) {
          await api.deleteCard(targetCardId)
        }

        await db.runAsync(`DELETE FROM study_cards WHERE id = ?`, [targetCardId])
        break
      }

      case 'submit_answer': {
        const m = mutation as OfflineAnswerMutation
        const targetCardId = resolveEntityId(m.cardId)
        const blanks: BlankSubmission[] = Object.entries(m.submittedValues).map(
          ([ordinalStr, submitted]) => ({
            ordinal: parseInt(ordinalStr, 10),
            submitted: String(submitted),
          }),
        )

        const request: SubmitAnswerRequest = {
          cardId: targetCardId,
          blanks,
          revealed: m.revealed,
          durationMs: m.durationMs,
          idempotencyKey: m.idempotencyKey,
        }

        await submitAnswer(m.sessionId, request)
        break
      }
    }
  }

  // Exposed for testing and inspection
  forceReset() {
    this.stop()
    this.retryCount = 0
  }

  getIsSyncing() {
    return this.isSyncing
  }

  getRetryCount() {
    return this.retryCount
  }
}

export const syncEngine = new SyncEngine()

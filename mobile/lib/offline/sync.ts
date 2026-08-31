import { onlineManager } from '@tanstack/react-query'
import { submitAnswer } from '../../services/study'
import { ApiError } from '../../services/api'
import { queryClient } from '../query-client'
import { useAuthStore } from '../../stores/auth'
import { useSyncStore } from '../../stores/sync'
import { loadOfflineState, updateOfflineState } from './state'
import type { BlankSubmission, SubmitAnswerRequest } from '@saulado/shared'
import type { OfflineMutation } from './types'

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
    let state = await loadOfflineState()
    let queue = state.queue.filter((m) => m.status !== 'failed')

    useSyncStore.getState().setPendingCount(queue.length)

    while (queue.length > 0) {
      if (!onlineManager.isOnline()) {
        useSyncStore.getState().setStatus('offline')
        return
      }

      const mutation = queue[0]!
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
        queue = state.queue.filter((m) => m.status !== 'failed')
        continue
      }

      try {
        await this.processMutation(mutation)

        // Success -> remove from queue atomically
        state = await updateOfflineState((prev) => {
          return {
            ...prev,
            queue: prev.queue.filter((m) => m.idempotencyKey !== mutation.idempotencyKey),
          }
        })

        queue = state.queue.filter((m) => m.status !== 'failed')
        useSyncStore.getState().setPendingCount(queue.length)
      } catch (error) {
        if (error instanceof ApiError) {
          const isPermanent =
            error.status === 400 ||
            error.status === 403 ||
            error.status === 404 ||
            error.status === 422 ||
            error.code === 'VALIDATION_ERROR'

          if (isPermanent) {
            // Mark as failed permanently and retain in queue
            state = await updateOfflineState((prev) => {
              const newQueue = prev.queue.map((m) =>
                m.idempotencyKey === mutation.idempotencyKey
                  ? { ...m, status: 'failed' as const, error: error.message }
                  : m,
              )
              return { ...prev, queue: newQueue }
            })
            queue = state.queue.filter((m) => m.status !== 'failed')
            useSyncStore.getState().setPendingCount(queue.length)

            useSyncStore.getState().setError(`Validation error syncing card: ${error.message}`)
            continue
          } else {
            throw error
          }
        }

        throw error
      }
    }

    if (queue.length === 0) {
      const hasFailed = state.queue.some((m) => m.status === 'failed')
      if (!hasFailed) {
        useSyncStore.getState().setSuccess()
      } else {
        useSyncStore.getState().setStatus('idle')
      }
      await queryClient.invalidateQueries({ queryKey: ['dueCounts'] })
    }
  }

  private async processMutation(mutation: OfflineMutation) {
    const blanks: BlankSubmission[] = Object.entries(mutation.submittedValues).map(
      ([ordinalStr, submitted]) => ({
        ordinal: parseInt(ordinalStr, 10),
        submitted,
      }),
    )

    const request: SubmitAnswerRequest = {
      cardId: mutation.cardId,
      blanks,
      revealed: mutation.revealed,
      durationMs: mutation.durationMs,
      idempotencyKey: mutation.idempotencyKey,
    }

    await submitAnswer(mutation.sessionId, request)
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

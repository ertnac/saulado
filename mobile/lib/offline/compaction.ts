import type {
  OfflineCreateCardMutation,
  OfflineCreateSetMutation,
  OfflineMutation,
  OfflineUpdateCardMutation,
  OfflineUpdateSetMutation,
} from './types'

/**
 * Compacts the offline mutation queue into minimal equivalent operations.
 * - Collapses redundant creates + updates into single creates with final state.
 * - Collapses creates + deletes of temporary entities into NO-OP.
 * - Purges answer submissions and child mutations on deleted temporary entities.
 * - Collapses multiple updates on the same entity into a single merged update.
 */
export function compactQueue(queue: OfflineMutation[]): OfflineMutation[] {
  if (!queue || queue.length === 0) return []

  const deletedTempSetIds = new Set<string>()
  const deletedTempCardIds = new Set<string>()

  // 1. Identify all temporary entities being deleted
  for (const m of queue) {
    if (m.type === 'delete_set' && m.setId.startsWith('temp-set-')) {
      deletedTempSetIds.add(m.setId)
    }
    if (m.type === 'delete_card' && m.cardId.startsWith('temp-card-')) {
      deletedTempCardIds.add(m.cardId)
    }
  }

  // Also collect any cards that belong to deleted temp sets
  for (const m of queue) {
    if (m.type === 'create_card' && deletedTempSetIds.has(m.setId)) {
      deletedTempCardIds.add(m.tempCardId)
    }
    if (m.type === 'update_card' && deletedTempSetIds.has(m.setId)) {
      deletedTempCardIds.add(m.cardId)
    }
    if (m.type === 'delete_card' && deletedTempSetIds.has(m.setId)) {
      deletedTempCardIds.add(m.cardId)
    }
  }

  // 2. Filter out all mutations relating to deleted temporary entities (cascade purge)
  const nonTempDeleted = queue.filter((m) => {
    // Preserve failed mutations as-is for inspection / user notification
    if (m.status === 'failed') return true

    if (m.type === 'create_set' && deletedTempSetIds.has(m.tempSetId)) return false
    if (m.type === 'update_set' && deletedTempSetIds.has(m.setId)) return false
    if (m.type === 'delete_set' && deletedTempSetIds.has(m.setId)) return false

    if (
      m.type === 'create_card' &&
      (deletedTempCardIds.has(m.tempCardId) || deletedTempSetIds.has(m.setId))
    )
      return false
    if (
      m.type === 'update_card' &&
      (deletedTempCardIds.has(m.cardId) || deletedTempSetIds.has(m.setId))
    )
      return false
    if (
      m.type === 'delete_card' &&
      (deletedTempCardIds.has(m.cardId) || deletedTempSetIds.has(m.setId))
    )
      return false

    if (m.type === 'submit_answer' && deletedTempCardIds.has(m.cardId)) return false

    return true
  })

  // 3. Sequential folding of create + update and update + update pairs
  const compacted: OfflineMutation[] = []

  for (const mutation of nonTempDeleted) {
    if (mutation.status === 'failed') {
      compacted.push(mutation)
      continue
    }

    let merged = false

    // Try to fold with an existing pending mutation in the result
    for (let i = 0; i < compacted.length; i++) {
      const existing = compacted[i]!
      if (existing.status === 'failed') continue

      // Set mutations folding
      if (
        existing.type === 'create_set' &&
        mutation.type === 'update_set' &&
        existing.tempSetId === mutation.setId
      ) {
        compacted[i] = mergeCreateSetWithUpdate(existing, mutation)
        merged = true
        break
      }

      if (
        existing.type === 'update_set' &&
        mutation.type === 'update_set' &&
        existing.setId === mutation.setId
      ) {
        compacted[i] = mergeUpdateSetWithUpdate(existing, mutation)
        merged = true
        break
      }

      if (
        existing.type === 'update_set' &&
        mutation.type === 'delete_set' &&
        existing.setId === mutation.setId
      ) {
        // Drop update, keep delete
        compacted[i] = mutation
        merged = true
        break
      }

      // Card mutations folding
      if (
        existing.type === 'create_card' &&
        mutation.type === 'update_card' &&
        existing.tempCardId === mutation.cardId
      ) {
        compacted[i] = mergeCreateCardWithUpdate(existing, mutation)
        merged = true
        break
      }

      if (
        existing.type === 'update_card' &&
        mutation.type === 'update_card' &&
        existing.cardId === mutation.cardId
      ) {
        compacted[i] = mergeUpdateCardWithUpdate(existing, mutation)
        merged = true
        break
      }

      if (
        existing.type === 'update_card' &&
        mutation.type === 'delete_card' &&
        existing.cardId === mutation.cardId
      ) {
        // Drop update, keep delete
        compacted[i] = mutation
        merged = true
        break
      }
    }

    if (!merged) {
      compacted.push(mutation)
    }
  }

  return compacted
}

function mergeCreateSetWithUpdate(
  base: OfflineCreateSetMutation,
  update: OfflineUpdateSetMutation,
): OfflineCreateSetMutation {
  return {
    ...base,
    title: update.title ?? base.title,
    parentId: update.parentId !== undefined ? update.parentId : base.parentId,
    color: update.color !== undefined ? update.color : base.color,
  }
}

function mergeUpdateSetWithUpdate(
  base: OfflineUpdateSetMutation,
  update: OfflineUpdateSetMutation,
): OfflineUpdateSetMutation {
  return {
    ...base,
    title: update.title ?? base.title,
    parentId: update.parentId !== undefined ? update.parentId : base.parentId,
    color: update.color !== undefined ? update.color : base.color,
    archived: update.archived !== undefined ? update.archived : base.archived,
    clientUpdatedAt: update.clientUpdatedAt,
  }
}

function mergeCreateCardWithUpdate(
  base: OfflineCreateCardMutation,
  update: OfflineUpdateCardMutation,
): OfflineCreateCardMutation {
  return {
    ...base,
    setId: update.studySetId ?? base.setId,
    paragraph: update.paragraph ?? base.paragraph,
    answers: update.answers ?? base.answers,
    tags: update.tags !== undefined ? update.tags : base.tags,
  }
}

function mergeUpdateCardWithUpdate(
  base: OfflineUpdateCardMutation,
  update: OfflineUpdateCardMutation,
): OfflineUpdateCardMutation {
  return {
    ...base,
    studySetId: update.studySetId !== undefined ? update.studySetId : base.studySetId,
    paragraph: update.paragraph ?? base.paragraph,
    answers: update.answers ?? base.answers,
    tags: update.tags !== undefined ? update.tags : base.tags,
    clientUpdatedAt: update.clientUpdatedAt,
  }
}

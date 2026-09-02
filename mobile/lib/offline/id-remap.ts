const inMemoryIdMap = new Map<string, string>()
const remapListeners = new Set<(tempId: string, serverId: string) => void>()

/**
 * Resolves a given entity ID through the in-memory temp-to-server ID mapping table.
 * If no mapping exists, returns the original ID.
 */
export function resolveEntityId(id: string): string {
  return inMemoryIdMap.get(id) ?? id
}

/**
 * Records a new mapping from a temporary client ID to a confirmed server ID.
 * Notifies all registered listeners (e.g. active screens, cache re-keyers).
 */
export function recordIdMapping(tempId: string, serverId: string): void {
  inMemoryIdMap.set(tempId, serverId)
  remapListeners.forEach((listener) => {
    try {
      listener(tempId, serverId)
    } catch (e) {
      console.warn('[id-remap] Listener error during onEntityRemapped', e)
    }
  })
}

/**
 * Registers a listener to be notified whenever a temporary ID is remapped to a server ID.
 * Returns an unregister function.
 */
export function onEntityRemapped(listener: (tempId: string, serverId: string) => void): () => void {
  remapListeners.add(listener)
  return () => {
    remapListeners.delete(listener)
  }
}

/**
 * Resets the in-memory ID mapping cache (e.g. on user logout).
 */
export function clearIdMappings(): void {
  inMemoryIdMap.clear()
}

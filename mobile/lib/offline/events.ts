const indexListeners = new Set<() => void>()

export function onOfflineIndexUpdated(listener: () => void): () => void {
  indexListeners.add(listener)
  return () => indexListeners.delete(listener)
}

export function notifyOfflineIndexUpdated(): void {
  indexListeners.forEach((l) => {
    try {
      l()
    } catch (e) {
      console.warn('[offline-events] listener error', e)
    }
  })
}

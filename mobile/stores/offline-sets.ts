import { create } from 'zustand'
import type { OfflineSetIndexEntry } from '../lib/offline/types'
import { getOfflineSetIndex, onOfflineIndexUpdated } from '../lib/offline/sets'

export interface OfflineSetsState {
  sets: Record<string, OfflineSetIndexEntry>
  initialized: boolean

  load: () => Promise<void>
  setEntry: (entry: OfflineSetIndexEntry) => void
  removeEntry: (setId: string) => void
  reset: () => void
}

export const useOfflineSetsStore = create<OfflineSetsState>((set) => ({
  sets: {},
  initialized: false,

  load: async () => {
    const index = await getOfflineSetIndex()
    set({ sets: index.sets, initialized: true })
  },
  setEntry: (entry) =>
    set((state) => ({
      sets: { ...state.sets, [entry.setId]: entry },
    })),
  removeEntry: (setId) =>
    set((state) => {
      const newSets = { ...state.sets }
      delete newSets[setId]
      return { sets: newSets }
    }),
  reset: () => set({ sets: {}, initialized: false }),
}))

// Automatically reload store when storage index changes
onOfflineIndexUpdated(() => {
  void useOfflineSetsStore.getState().load()
})

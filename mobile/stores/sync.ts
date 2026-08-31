import { create } from 'zustand'

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error' | 'success'
  pendingCount: number
  lastSyncedAt: string | null
  lastError: string | null

  setStatus: (status: SyncState['status']) => void
  setPendingCount: (count: number) => void
  setSuccess: () => void
  setError: (error: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,

  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setSuccess: () =>
    set({
      status: 'success',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    }),
  setError: (error) =>
    set({
      status: 'error',
      lastError: error,
    }),
}))

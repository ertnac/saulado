import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface BaggedSnippet {
  id: string
  fileId: string
  fileName: string
  fileType: 'docx' | 'doc'
  text: string
  sourceParagraphIndex?: number
  createdAt: string
}

interface SnippetBagState {
  snippets: BaggedSnippet[]
  addSnippet: (snippet: Omit<BaggedSnippet, 'id' | 'createdAt'>) => BaggedSnippet
  removeSnippet: (id: string) => void
  updateSnippetText: (id: string, text: string) => void
  clearBag: () => void
  hasSnippet: (fileId: string, text: string) => boolean
}

function generateSnippetId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'bag-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36)
}

export const useSnippetBagStore = create<SnippetBagState>()(
  persist(
    (set, get) => ({
      snippets: [],

      addSnippet: (input) => {
        const trimmed = input.text.trim()
        const existing = get().snippets.find(
          (s) => s.fileId === input.fileId && s.text.trim() === trimmed,
        )
        if (existing) {
          return existing
        }

        const newSnippet: BaggedSnippet = {
          ...input,
          text: trimmed,
          id: generateSnippetId(),
          createdAt: new Date().toISOString(),
        }

        set((state) => ({
          snippets: [newSnippet, ...state.snippets],
        }))

        return newSnippet
      },

      removeSnippet: (id) => {
        set((state) => ({
          snippets: state.snippets.filter((s) => s.id !== id),
        }))
      },

      updateSnippetText: (id, text) => {
        set((state) => ({
          snippets: state.snippets.map((s) => (s.id === id ? { ...s, text: text.trim() } : s)),
        }))
      },

      clearBag: () => {
        set({ snippets: [] })
      },

      hasSnippet: (fileId, text) => {
        const trimmed = text.trim()
        return get().snippets.some((s) => s.fileId === fileId && s.text.trim() === trimmed)
      },
    }),
    {
      name: 'saulado-snippet-bag',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)

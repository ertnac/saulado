import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BaggedSnippet, SnippetSource } from '@saulado/shared'
import { formatDocumentTextLayout } from '@/lib/text-formatting'

export type { BaggedSnippet, SnippetSource }

export type AddBaggedSnippetInput = Omit<BaggedSnippet, 'id' | 'createdAt' | 'source'> & {
  source?: SnippetSource
}

interface SnippetBagState {
  snippets: BaggedSnippet[]
  addSnippet: (snippet: AddBaggedSnippetInput) => BaggedSnippet
  removeSnippet: (id: string) => void
  updateSnippetText: (id: string, text: string) => void
  clearBag: () => void
  hasSnippet: (fileId: string, text: string, pageNumber?: number) => boolean
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
        const formatted = formatDocumentTextLayout(input.text) || input.text.trim()
        const existing = get().snippets.find(
          (s) =>
            s.fileId === input.fileId &&
            s.text.trim() === formatted &&
            (input.pageNumber === undefined || s.pageNumber === input.pageNumber),
        )
        if (existing) {
          return existing
        }

        const source = input.source || input.fileType || 'pdf'

        const newSnippet: BaggedSnippet = {
          ...input,
          source,
          text: formatted,
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
        const formatted = formatDocumentTextLayout(text) || text.trim()
        set((state) => ({
          snippets: state.snippets.map((s) => (s.id === id ? { ...s, text: formatted } : s)),
        }))
      },

      clearBag: () => {
        set({ snippets: [] })
      },

      hasSnippet: (fileId, text, pageNumber) => {
        const formatted = formatDocumentTextLayout(text) || text.trim()
        const rawTrimmed = text.trim()
        return get().snippets.some(
          (s) =>
            s.fileId === fileId &&
            (s.text.trim() === formatted || s.text.trim() === rawTrimmed) &&
            (pageNumber === undefined || s.pageNumber === pageNumber),
        )
      },
    }),
    {
      name: 'saulado-snippet-bag',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

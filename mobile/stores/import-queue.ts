import { create } from 'zustand'
import type { DraftAnswer } from '@saulado/shared'

/**
 * The cards a scan produced, waiting for the composer.
 *
 * The web keeps this in `SetDetailPage`'s own state, because its importer is a
 * dialog on that page — the queue never leaves the component that consumes it.
 * Here the scanner and the review screen are routes, so the set screen is still
 * mounted underneath them and `router.back()` returns to that same instance. A
 * module variable would not be read again; a store is, because the set screen
 * subscribes to it.
 *
 * Not persisted. A queue is a few minutes of work in front of a page the user is
 * still holding, and restoring one on next launch would put cards in a composer
 * for a photo taken yesterday.
 *
 * `setId` is carried so the queue can only be consumed by the set it was scanned
 * into. Without it, backing out to a different set would find the queue waiting
 * there and file the cards under the wrong subject.
 */
export interface ImportedCard {
  paragraph: string
  /** Offsets into `paragraph`, already derived by `createAnswer`. */
  answers: DraftAnswer[]
}

interface ImportQueueState {
  setId: string | null
  cards: ImportedCard[]
  /** Which card the composer is showing. */
  index: number
  start: (setId: string, cards: ImportedCard[]) => void
  /** Moves to the next card; clears when the last one is done or skipped. */
  advance: () => void
  clear: () => void
}

const EMPTY = { setId: null, cards: [], index: 0 }

export const useImportQueue = create<ImportQueueState>((set) => ({
  ...EMPTY,

  start: (setId, cards) => {
    set({ setId, cards, index: 0 })
  },

  advance: () => {
    set((state) =>
      state.index + 1 >= state.cards.length ? EMPTY : { ...state, index: state.index + 1 },
    )
  },

  clear: () => {
    set(EMPTY)
  },
}))

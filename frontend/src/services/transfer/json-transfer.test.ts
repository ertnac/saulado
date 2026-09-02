import { describe, expect, it, vi } from 'vitest'
import { exportSingleSetAsJson } from './json-export'
import { importSetsAndCards } from './json-import'
import * as api from '@/services/cards'

vi.mock('@/services/cards', () => ({
  getSet: vi.fn(),
  listCards: vi.fn(),
  getCard: vi.fn(),
  createSet: vi.fn(),
  createCard: vi.fn(),
}))

describe('json-transfer service (frontend)', () => {
  describe('exportSingleSetAsJson', () => {
    it('exports set and cards with answers into Saulado JSON format', async () => {
      vi.mocked(api.getSet).mockResolvedValueOnce({
        set: {
          id: 'set-1',
          title: 'Physics',
          color: 'teal',
          parentId: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          cardCount: 1,
          subtreeCardCount: 1,
          childCount: 0,
        },
      })

      vi.mocked(api.listCards).mockResolvedValueOnce({
        items: [
          {
            id: 'card-1',
            studySetId: 'set-1',
            paragraph: 'F equals m times a.',
            answerCount: 1,
            tags: ['physics'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      })

      vi.mocked(api.getCard).mockResolvedValueOnce({
        card: {
          id: 'card-1',
          studySetId: 'set-1',
          paragraph: 'F equals m times a.',
          tags: ['physics'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          answers: [
            {
              id: 'ans-1',
              ordinal: 0,
              startOffset: 0,
              endOffset: 1,
              answerText: 'F',
              altAnswers: [],
            },
          ],
        },
      })

      const json = await exportSingleSetAsJson('set-1')
      const parsed = JSON.parse(json) as {
        formatVersion: number
        set: { title: string; cards: { paragraph: string }[] }
      }

      expect(parsed.formatVersion).toBe(2)
      expect(parsed.set.title).toBe('Physics')
      expect(parsed.set.cards).toHaveLength(1)
      expect(parsed.set.cards[0]?.paragraph).toBe('F equals m times a.')
    })
  })

  describe('importSetsAndCards', () => {
    it('creates sets and cards sequentially', async () => {
      vi.mocked(api.createSet).mockResolvedValueOnce({
        set: {
          id: 'new-set-id',
          title: 'Imported',
          color: 'teal',
          parentId: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          cardCount: 0,
          subtreeCardCount: 0,
          childCount: 0,
        },
      })

      vi.mocked(api.createCard).mockResolvedValueOnce({
        card: {
          id: 'new-card-id',
          studySetId: 'new-set-id',
          paragraph: 'Hello world',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          answers: [],
        },
      })

      const importData = {
        sets: [
          {
            title: 'Imported',
            cards: [
              {
                paragraph: 'Hello world',
                answers: [{ startOffset: 0, endOffset: 5 }],
              },
            ],
          },
        ],
        totalCards: 1,
      }

      const onProgress = vi.fn()
      const summary = await importSetsAndCards(importData, onProgress)

      expect(summary.importedSets).toBe(1)
      expect(summary.importedCards).toBe(1)
      expect(summary.failedCards).toBe(0)
      expect(onProgress).toHaveBeenCalled()
    })
  })
})

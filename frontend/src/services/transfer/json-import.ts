import type { ParsedImportResult } from '@saulado/shared'
import * as api from '@/services/cards'

export interface ImportProgressCallback {
  (current: number, total: number, message: string): void
}

export interface ImportResultSummary {
  importedSets: number
  importedCards: number
  failedCards: number
}

/**
 * Creates imported sets and cards sequentially in the user's account with progress tracking
 * and resilient error handling.
 */
export async function importSetsAndCards(
  importData: ParsedImportResult,
  onProgress?: ImportProgressCallback,
  targetSetId?: string,
): Promise<ImportResultSummary> {
  let importedSets = 0
  let importedCards = 0
  let failedCards = 0
  const totalSteps = importData.sets.length + importData.totalCards
  let currentStep = 0

  for (const s of importData.sets) {
    currentStep++
    onProgress?.(currentStep, totalSteps, `Processing set "${s.title}"…`)

    let destinationSetId = targetSetId

    // If no existing target set is specified, create a new set
    if (!destinationSetId) {
      try {
        const createdSet = await api.createSet({
          title: s.title,
          color: s.color,
        })
        destinationSetId = createdSet.set.id
        importedSets++
      } catch {
        failedCards += s.cards.length
        currentStep += s.cards.length
        continue
      }
    }

    for (const c of s.cards) {
      currentStep++
      onProgress?.(currentStep, totalSteps, `Adding card to "${s.title}"…`)

      try {
        await api.createCard(destinationSetId, {
          paragraph: c.paragraph,
          answers: c.answers,
        })
        importedCards++
      } catch (err) {
        console.warn('Failed to import card:', err)
        failedCards++
      }
    }
  }

  return { importedSets, importedCards, failedCards }
}

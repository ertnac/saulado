import * as api from '@/services/cards'

/**
 * Builds a JSON export for a single set and all its cards.
 */
export async function exportSingleSetAsJson(setId: string): Promise<string> {
  const setResponse = await api.getSet(setId)
  const cardsResponse = await api.listCards(setId, { limit: 200 })

  const cardsWithAnswers = await Promise.all(
    cardsResponse.items.map(async (summary) => {
      const cardDetail = await api.getCard(summary.id)
      return {
        paragraph: cardDetail.card.paragraph,
        answers: cardDetail.card.answers.map((a) => ({
          startOffset: a.startOffset,
          endOffset: a.endOffset,
          answerText: a.answerText,
          altAnswers: a.altAnswers,
        })),
        tags: cardDetail.card.tags,
      }
    }),
  )

  const payload = {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    type: 'single_set',
    set: {
      title: setResponse.set.title,
      color: setResponse.set.color,
      cards: cardsWithAnswers,
    },
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Triggers a browser file download of the JSON payload.
 */
export function downloadJsonFile(filename: string, jsonString: string): void {
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

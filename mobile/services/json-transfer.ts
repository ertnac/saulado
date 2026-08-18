import { Alert, Share } from 'react-native'
import * as api from './cards'

export interface ParsedImportCard {
  paragraph: string
  answers: Array<{
    startOffset: number
    endOffset: number
    altAnswers?: string[]
  }>
  tags?: string[]
}

export interface ParsedImportSet {
  title: string
  cards: ParsedImportCard[]
}

export interface ParsedImportResult {
  sets: ParsedImportSet[]
  totalCards: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCard(raw: unknown): ParsedImportCard | null {
  if (!isRecord(raw) || typeof raw.paragraph !== 'string' || !raw.paragraph.trim()) {
    return null
  }

  const answers: Array<{ startOffset: number; endOffset: number; altAnswers?: string[] }> = []
  if (Array.isArray(raw.answers)) {
    for (const a of raw.answers) {
      if (isRecord(a) && typeof a.startOffset === 'number' && typeof a.endOffset === 'number') {
        const altAnswers = Array.isArray(a.altAnswers)
          ? a.altAnswers.filter((item): item is string => typeof item === 'string')
          : undefined

        answers.push({
          startOffset: a.startOffset,
          endOffset: a.endOffset,
          altAnswers: altAnswers && altAnswers.length > 0 ? altAnswers : undefined,
        })
      }
    }
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : []

  return {
    paragraph: raw.paragraph.trim(),
    answers,
    tags,
  }
}

function parseSet(raw: unknown): ParsedImportSet | null {
  if (!isRecord(raw) || typeof raw.title !== 'string' || !raw.title.trim()) {
    return null
  }

  const cards: ParsedImportCard[] = []
  if (Array.isArray(raw.cards)) {
    for (const c of raw.cards) {
      const parsedCard = parseCard(c)
      if (parsedCard) cards.push(parsedCard)
    }
  }

  return {
    title: raw.title.trim(),
    cards,
  }
}

/**
 * Validates and normalizes raw JSON string into a structured set/card import format.
 */
export function parseAndValidateJson(
  raw: string,
): { success: true; data: ParsedImportResult } | { success: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(raw)
    const sets: ParsedImportSet[] = []

    if (isRecord(parsed)) {
      // Case 1: Object with `sets` array
      if (Array.isArray(parsed.sets)) {
        for (const item of parsed.sets) {
          const s = parseSet(item)
          if (s) sets.push(s)
        }
      }
      // Case 2: Object with single `set` wrapper
      else if (isRecord(parsed.set)) {
        const s = parseSet(parsed.set)
        if (s) sets.push(s)
      }
      // Case 3: Direct Set object
      else {
        const s = parseSet(parsed)
        if (s) sets.push(s)
      }
    } else if (Array.isArray(parsed)) {
      // Case 4: Array of sets
      for (const item of parsed) {
        const s = parseSet(item)
        if (s) sets.push(s)
      }
    }

    if (sets.length === 0) {
      return {
        success: false,
        error:
          'No valid sets or cards found in this JSON. Ensure it contains a set title and cards array.',
      }
    }

    const totalCards = sets.reduce((sum, s) => sum + s.cards.length, 0)
    return { success: true, data: { sets, totalCards } }
  } catch {
    return {
      success: false,
      error: 'Invalid JSON format. Please verify the copied text is valid JSON.',
    }
  }
}

/**
 * Creates imported sets and cards sequentially in the user's account.
 */
export async function importSetsAndCards(
  importData: ParsedImportResult,
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<{ importedSets: number; importedCards: number }> {
  let importedSets = 0
  let importedCards = 0
  const totalSteps = importData.sets.length + importData.totalCards
  let currentStep = 0

  for (const s of importData.sets) {
    currentStep++
    onProgress?.(currentStep, totalSteps, `Creating set "${s.title}"...`)

    const createdSet = await api.createSet({ title: s.title })
    importedSets++

    for (const c of s.cards) {
      currentStep++
      onProgress?.(currentStep, totalSteps, `Adding card to "${s.title}"...`)

      await api.createCard(createdSet.set.id, {
        paragraph: c.paragraph,
        answers: c.answers,
        tags: c.tags,
      })
      importedCards++
    }
  }

  return { importedSets, importedCards }
}

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
 * Opens native Share sheet with the JSON payload.
 */
export async function shareJsonPayload(filename: string, json: string): Promise<void> {
  try {
    await Share.share({
      title: filename,
      message: json,
    })
  } catch {
    Alert.alert('Sharing Failed', 'Could not open the share sheet.')
  }
}

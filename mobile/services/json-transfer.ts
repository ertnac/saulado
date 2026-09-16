import { Alert, Platform, Share } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { onlineManager } from '@tanstack/react-query'
import {
  ANSWERS_MAX_PER_CARD,
  codePointLength,
  isSetColor,
  normalizeParagraph,
  normalizeTags,
  toCodePoints,
  type AnswerInput,
  type SetColor,
  type StudyCard,
  type StudyCardSummary,
} from '@saulado/shared'
import * as api from './cards'
import * as offlineData from '../lib/offline/data-source'
import { useOfflineSetsStore } from '../stores/offline-sets'
import { createCardOfflineAware, resolveUserId } from '../hooks/cards'

export interface ParsedImportCard {
  paragraph: string
  answers: AnswerInput[]
  tags?: string[]
}

export interface ParsedImportSet {
  title: string
  color?: SetColor
  cards: ParsedImportCard[]
}

export interface ParsedImportResult {
  sets: ParsedImportSet[]
  totalCards: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Extracts cloze markers such as [answer], {answer}, or Anki's {{c1::answer}} / {{c1::answer::hint}}.
 * Strips the brackets from the paragraph and computes exact code point offsets.
 */
function extractClozeBrackets(text: string): { cleanParagraph: string; answers: AnswerInput[] } {
  // Regex to match {{c1::answer[::hint]}}, [answer], or {answer}
  const clozeRegex = /\{\{c\d+::([^:}]+)(?:::([^}]*))?\}\}|\[([^\]]+)\]|\{([^}]+)\}/g
  const codePointsStr = text // Note: RegExp operates on standard JS string
  const matches: Array<{ match: string; answerText: string; index: number }> = []

  let m: RegExpExecArray | null
  while ((m = clozeRegex.exec(codePointsStr)) !== null) {
    const rawMatch = m[0]
    const answerText = m[1] ?? m[3] ?? m[4] ?? ''
    if (answerText.trim().length > 0) {
      matches.push({
        match: rawMatch,
        answerText: answerText.trim(),
        index: m.index,
      })
    }
  }

  if (matches.length === 0) {
    return { cleanParagraph: text, answers: [] }
  }

  // Build clean paragraph and calculate code point offsets
  let cleanText = ''
  let lastIndex = 0
  const answers: AnswerInput[] = []

  for (const item of matches) {
    // Add text before match
    cleanText += text.slice(lastIndex, item.index)
    const startOffset = toCodePoints(cleanText).length
    cleanText += item.answerText
    const endOffset = toCodePoints(cleanText).length

    answers.push({
      startOffset,
      endOffset,
    })

    lastIndex = item.index + item.match.length
  }

  cleanText += text.slice(lastIndex)

  return { cleanParagraph: cleanText, answers }
}

/**
 * Finds occurrences of text strings in paragraph to generate valid code point offsets.
 */
function findStringAnswers(paragraph: string, answerTexts: string[]): AnswerInput[] {
  const pLower = paragraph.toLowerCase()
  const points = toCodePoints(paragraph)
  const answers: AnswerInput[] = []
  const usedRanges: Array<[number, number]> = []

  for (const ans of answerTexts) {
    const target = ans.trim()
    if (!target) continue

    const tLower = target.toLowerCase()
    let searchPos = 0

    while (searchPos < paragraph.length) {
      const idx = pLower.indexOf(tLower, searchPos)
      if (idx === -1) break

      const startOffset = toCodePoints(paragraph.slice(0, idx)).length
      const endOffset = startOffset + toCodePoints(target).length

      // Check if overlapping with already found ranges
      const overlaps = usedRanges.some(([s, e]) => startOffset < e && endOffset > s)
      if (!overlaps && startOffset < endOffset && endOffset <= points.length) {
        answers.push({ startOffset, endOffset })
        usedRanges.push([startOffset, endOffset])
        break // Match one occurrence per answer text
      }

      searchPos = idx + target.length
    }
  }

  return answers
}

/**
 * Normalizes and validates raw card input.
 */
function parseCard(raw: unknown): ParsedImportCard | null {
  if (!isRecord(raw)) return null

  // Support multiple paragraph field names (paragraph, text, content, prompt, question, front, body)
  const rawText =
    typeof raw.paragraph === 'string'
      ? raw.paragraph
      : typeof raw.text === 'string'
        ? raw.text
        : typeof raw.content === 'string'
          ? raw.content
          : typeof raw.prompt === 'string'
            ? raw.prompt
            : typeof raw.question === 'string'
              ? raw.question
              : typeof raw.front === 'string'
                ? raw.front
                : typeof raw.body === 'string'
                  ? raw.body
                  : ''

  if (!rawText.trim()) return null

  // 1. Check for bracketed cloze markers first
  const { cleanParagraph, answers: clozeAnswers } = extractClozeBrackets(rawText)
  const paragraph = normalizeParagraph(cleanParagraph)
  const totalLength = codePointLength(paragraph)

  let answers: AnswerInput[] = []

  // 2. If bracket clozes were extracted, use those
  if (clozeAnswers.length > 0) {
    answers = clozeAnswers
  }
  // 3. Otherwise parse explicit `answers` field
  else if (Array.isArray(raw.answers)) {
    const stringAnswers: string[] = []

    for (const a of raw.answers) {
      // Direct string answer
      if (typeof a === 'string' && a.trim()) {
        stringAnswers.push(a.trim())
      }
      // Answer object
      else if (isRecord(a)) {
        const start =
          typeof a.startOffset === 'number'
            ? a.startOffset
            : typeof a.start === 'number'
              ? a.start
              : undefined
        const end =
          typeof a.endOffset === 'number'
            ? a.endOffset
            : typeof a.end === 'number'
              ? a.end
              : undefined

        const altAnswers = Array.isArray(a.altAnswers)
          ? a.altAnswers.filter(
              (item): item is string => typeof item === 'string' && item.trim().length > 0,
            )
          : undefined

        // Has explicit numeric offsets
        if (start !== undefined && end !== undefined) {
          answers.push({
            startOffset: Math.max(0, start),
            endOffset: Math.min(totalLength, end),
            altAnswers: altAnswers && altAnswers.length > 0 ? altAnswers : undefined,
          })
        }
        // Has answer text only
        else {
          const ansText =
            typeof a.answerText === 'string'
              ? a.answerText
              : typeof a.text === 'string'
                ? a.text
                : typeof a.answer === 'string'
                  ? a.answer
                  : typeof a.value === 'string'
                    ? a.value
                    : ''
          if (ansText.trim()) {
            stringAnswers.push(ansText.trim())
          }
        }
      }
    }

    // Match any string answers found in the paragraph
    if (stringAnswers.length > 0) {
      const found = findStringAnswers(paragraph, stringAnswers)
      answers.push(...found)
    }
  }

  // 4. Sanitize, sort, and remove overlapping answers
  answers = answers
    .filter((a) => a.startOffset >= 0 && a.endOffset <= totalLength && a.startOffset < a.endOffset)
    .sort((a, b) => a.startOffset - b.startOffset)

  // Remove overlapping answers to prevent API rejection
  const nonOverlapping: AnswerInput[] = []
  for (const ans of answers) {
    const overlaps = nonOverlapping.some(
      (prev) => ans.startOffset < prev.endOffset && ans.endOffset > prev.startOffset,
    )
    if (!overlaps) {
      nonOverlapping.push(ans)
    }
  }

  // Limit answers to maximum per card
  const finalAnswers = nonOverlapping.slice(0, ANSWERS_MAX_PER_CARD)

  // Tags
  let rawTags: string[] = []
  if (Array.isArray(raw.tags)) {
    rawTags = raw.tags.filter((t): t is string => typeof t === 'string')
  } else if (typeof raw.tags === 'string') {
    rawTags = raw.tags.split(',').map((t) => t.trim())
  }

  const tags = normalizeTags(rawTags)

  return {
    paragraph,
    answers: finalAnswers,
    tags: tags.length > 0 ? tags : undefined,
  }
}

/**
 * Normalizes and validates raw set input.
 */
function parseSet(raw: unknown, defaultTitle = 'Imported Set'): ParsedImportSet | null {
  if (!isRecord(raw)) return null

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : defaultTitle

  let color: SetColor | undefined
  if (isSetColor(raw.color)) {
    color = raw.color
  } else if (typeof raw.color === 'string') {
    const colorMap: Record<string, SetColor> = {
      forest: 'teal',
      green: 'green',
      teal: 'teal',
      emerald: 'green',
      terracotta: 'amber',
      orange: 'amber',
      amber: 'amber',
      red: 'red',
      crimson: 'red',
      sky: 'blue',
      blue: 'blue',
      indigo: 'violet',
      violet: 'violet',
      purple: 'violet',
      pink: 'pink',
      rose: 'pink',
      slate: 'slate',
      gray: 'slate',
      grey: 'slate',
    }
    color = colorMap[raw.color.toLowerCase().trim()]
  }

  const cards: ParsedImportCard[] = []
  if (Array.isArray(raw.cards)) {
    for (const c of raw.cards) {
      const parsedCard = parseCard(c)
      if (parsedCard) cards.push(parsedCard)
    }
  }

  if (cards.length === 0 && !raw.title && !raw.name) {
    return null
  }

  return {
    title,
    color,
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
    const trimmed = raw.trim()
    if (!trimmed) {
      return { success: false, error: 'The provided text or file is empty.' }
    }

    const parsed: unknown = JSON.parse(trimmed)
    const sets: ParsedImportSet[] = []

    if (isRecord(parsed)) {
      // Case 1: Object with `sets` array (Full DataExport or multiple sets)
      if (Array.isArray(parsed.sets)) {
        for (const item of parsed.sets) {
          const s = parseSet(item)
          if (s && s.cards.length > 0) sets.push(s)
        }
      }
      // Case 2: Object with single `set` wrapper
      else if (isRecord(parsed.set)) {
        const s = parseSet(parsed.set)
        if (s && s.cards.length > 0) sets.push(s)
      }
      // Case 3: Object with `cards` array directly (e.g. { title: "...", cards: [...] } or { cards: [...] })
      else if (Array.isArray(parsed.cards)) {
        const s = parseSet(parsed, typeof parsed.title === 'string' ? parsed.title : 'Imported Set')
        if (s && s.cards.length > 0) sets.push(s)
      }
      // Case 4: Direct single card object
      else {
        const singleCard = parseCard(parsed)
        if (singleCard) {
          sets.push({
            title: 'Imported Card',
            cards: [singleCard],
          })
        }
      }
    } else if (Array.isArray(parsed)) {
      // Case 5: Array of sets OR Array of cards
      const parsedArray = parsed as unknown[]
      if (parsedArray.length > 0) {
        // Check if elements look like sets or cards
        const first = parsedArray[0]
        if (isRecord(first) && Array.isArray(first.cards)) {
          // Array of sets
          for (const item of parsedArray) {
            const s = parseSet(item)
            if (s && s.cards.length > 0) sets.push(s)
          }
        } else {
          // Array of cards
          const cards: ParsedImportCard[] = []
          for (const item of parsedArray) {
            const c = parseCard(item)
            if (c) cards.push(c)
          }
          if (cards.length > 0) {
            sets.push({
              title: 'Imported Deck',
              cards,
            })
          }
        }
      }
    }

    if (sets.length === 0) {
      return {
        success: false,
        error:
          'No valid cards found in this JSON. Ensure it contains text/paragraphs and card definitions.',
      }
    }

    const totalCards = sets.reduce((sum, s) => sum + s.cards.length, 0)
    return { success: true, data: { sets, totalCards } }
  } catch (err) {
    return {
      success: false,
      error: `Invalid JSON format: ${err instanceof Error ? err.message : 'Please verify the JSON is correctly formatted.'}`,
    }
  }
}

/**
 * Bounded concurrency helper for parallel tasks
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

/**
 * Creates imported sets and cards sequentially in the user's account with progress tracking
 * and resilient offline/online error recovery.
 */
export async function importSetsAndCards(
  importData: ParsedImportResult,
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<{ importedSets: number; importedCards: number; failedCards: number }> {
  let importedSets = 0
  let importedCards = 0
  let failedCards = 0
  const totalSteps = importData.sets.length + importData.totalCards
  let currentStep = 0
  const userId = await resolveUserId()

  for (const s of importData.sets) {
    currentStep++
    onProgress?.(currentStep, totalSteps, `Creating set "${s.title}"...`)

    let createdSetId: string
    try {
      if (!onlineManager.isOnline() && userId) {
        const local = await offlineData.createSet(userId, { title: s.title, color: s.color })
        createdSetId = local.id
      } else {
        try {
          const createdSet = await api.createSet({
            title: s.title,
            color: s.color,
          })
          createdSetId = createdSet.set.id
        } catch (apiErr) {
          if (userId) {
            // Fallback to offline creation
            const local = await offlineData.createSet(userId, { title: s.title, color: s.color })
            createdSetId = local.id
          } else {
            throw apiErr
          }
        }
      }
      importedSets++
    } catch {
      // If set creation failed, skip its cards
      failedCards += s.cards.length
      currentStep += s.cards.length
      continue
    }

    for (const c of s.cards) {
      currentStep++
      onProgress?.(currentStep, totalSteps, `Adding card to "${s.title}"...`)

      try {
        await createCardOfflineAware(createdSetId, {
          paragraph: c.paragraph,
          answers: c.answers,
          tags: c.tags,
        })
        importedCards++
      } catch (err) {
        console.warn('Failed to import individual card:', err)
        failedCards++
      }
    }
  }

  return { importedSets, importedCards, failedCards }
}

export interface ExportSingleSetOptions {
  title?: string
  color?: SetColor
}

/**
 * Builds a JSON export for a single set and all its cards.
 * Resilient to offline mode, local/unsynced sets, large decks, and network hiccups.
 */
export async function exportSingleSetAsJson(
  setId: string,
  options?: ExportSingleSetOptions,
): Promise<string> {
  const isOnline = onlineManager.isOnline()
  const isTemp = setId.startsWith('temp-set-')
  const offlineEntry = useOfflineSetsStore.getState().sets[setId]

  let setTitle = options?.title ?? offlineEntry?.metadata?.title
  let setColor = options?.color ?? offlineEntry?.metadata?.color

  // 1. Try local SQLite data source first
  let localCards: StudyCard[] = []
  try {
    const userId = await resolveUserId()
    let fetched = await offlineData.getCards(userId, setId)
    if (fetched.length === 0 && userId !== 'local-user') {
      fetched = await offlineData.getCards('local-user', setId)
    }
    localCards = fetched

    if (!setTitle || !setColor) {
      let localSet = await offlineData.getSet(userId, setId)
      if (!localSet && userId !== 'local-user') {
        localSet = await offlineData.getSet('local-user', setId)
      }
      if (localSet) {
        setTitle = setTitle ?? localSet.title
        setColor = setColor ?? localSet.color
      }
    }
  } catch (err) {
    console.warn('Could not read cards from offline database:', err)
  }

  // 2. If we found cards locally in SQLite, build and return the payload immediately
  if (localCards.length > 0) {
    const cardsWithAnswers = localCards.map((c) => ({
      paragraph: c.paragraph,
      answers: (c.answers ?? []).map((a) => ({
        startOffset: a.startOffset,
        endOffset: a.endOffset,
        answerText: a.answerText,
        altAnswers: a.altAnswers,
      })),
      tags: c.tags && c.tags.length > 0 ? c.tags : undefined,
    }))

    const payload = {
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      type: 'single_set',
      set: {
        title: setTitle || 'Exported Set',
        color: setColor,
        cards: cardsWithAnswers,
      },
    }

    return JSON.stringify(payload, null, 2)
  }

  // 3. If no local cards and we are offline (or this is a temp set that only exists locally)
  if (!isOnline || isTemp) {
    throw new Error(
      isTemp
        ? 'This set was created locally and has no cards to export.'
        : 'This set is not saved for offline use. Please connect to the internet to export it.',
    )
  }

  // 4. Fetch from remote API with pagination and bounded concurrency
  try {
    const setResponse = await api.getSet(setId)
    setTitle = setResponse.set.title ?? setTitle
    setColor = setResponse.set.color ?? setColor
  } catch {
    if (!setTitle) {
      throw new Error('Could not fetch set details from server.')
    }
  }

  // Fetch all card summaries with pagination
  const cardSummaries: StudyCardSummary[] = []
  let cursor: string | null = null
  do {
    const page = await api.listCards(setId, { limit: 50, cursor: cursor || undefined })
    cardSummaries.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  if (cardSummaries.length === 0) {
    const payload = {
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      type: 'single_set',
      set: {
        title: setTitle || 'Exported Set',
        color: setColor,
        cards: [],
      },
    }
    return JSON.stringify(payload, null, 2)
  }

  // Fetch card details in batches of 5 with fallback to summary if a single card fetch fails
  const cardsWithAnswers = await mapLimit(cardSummaries, 5, async (summary) => {
    try {
      const detail = await api.getCard(summary.id)
      return {
        paragraph: detail.card.paragraph,
        answers: (detail.card.answers ?? []).map((a) => ({
          startOffset: a.startOffset,
          endOffset: a.endOffset,
          answerText: a.answerText,
          altAnswers: a.altAnswers,
        })),
        tags: detail.card.tags && detail.card.tags.length > 0 ? detail.card.tags : undefined,
      }
    } catch {
      return {
        paragraph: summary.paragraph,
        answers: [],
        tags: summary.tags && summary.tags.length > 0 ? summary.tags : undefined,
      }
    }
  })

  const payload = {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    type: 'single_set',
    set: {
      title: setTitle || 'Exported Set',
      color: setColor,
      cards: cardsWithAnswers,
    },
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Writes JSON to a temp file and opens the native Share sheet.
 *
 * File-based sharing avoids the Android intent payload limit (~500 KB) that
 * crashes `Share.share({ message })` for any non-trivial library. It also
 * gives the recipient a `.json` file they can import directly rather than
 * a wall of text they must copy into a text editor first.
 */
export async function shareJsonPayload(filename: string, json: string): Promise<void> {
  try {
    const cacheDir = FileSystem.cacheDirectory
    if (!cacheDir) {
      // Fallback: try message-based sharing if no cache directory is available
      await Share.share({ title: filename, message: json })
      return
    }

    // Sanitize filename for Android/iOS filesystem: strip illegal characters
    const sanitized = filename.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'study-set'
    const safeName = sanitized.endsWith('.json') ? sanitized : `${sanitized}.json`
    const dir = cacheDir.endsWith('/') ? cacheDir : `${cacheDir}/`
    const filePath = `${dir}${safeName}`

    await FileSystem.writeAsStringAsync(filePath, json, {
      encoding: FileSystem.EncodingType.UTF8,
    })

    const canShare = await Sharing.isAvailableAsync()
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: safeName,
        UTI: 'public.json',
      })
    } else {
      // Device doesn't support sharing files — fall back to text
      await Share.share({ title: safeName, message: json })
    }
  } catch (err) {
    console.error('Sharing failed:', err)
    Alert.alert('Sharing Failed', 'Could not open the share sheet.')
  }
}

/**
 * Saves a JSON file directly to device storage (e.g., Downloads folder).
 * On Android, prompts the user to select or confirm a destination directory using
 * the Storage Access Framework (SAF), writing the file directly to storage
 * without requiring intermediate third-party applications.
 * On other platforms, invokes the native share sheet with "Save to Files".
 */
export async function saveJsonToDevice(filename: string, json: string): Promise<boolean> {
  try {
    const sanitized = filename.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'study-set'
    const safeName = sanitized.endsWith('.json') ? sanitized : `${sanitized}.json`

    if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (!permissions.granted) {
        return false
      }

      const baseName = safeName.replace(/\.json$/i, '')
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        baseName,
        'application/json',
      )
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      Alert.alert('Saved to Device', `"${safeName}" was successfully saved to your chosen folder.`)
      return true
    } else {
      await shareJsonPayload(safeName, json)
      return true
    }
  } catch (err) {
    console.error('Save to device failed:', err)
    Alert.alert('Save Failed', 'Could not save the file to your device.')
    return false
  }
}

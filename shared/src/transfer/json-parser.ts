import { normalizeParagraph } from '../cloze/answers.js'
import { codePointLength } from '../cloze/codepoints.js'
import { ANSWERS_MAX_PER_CARD, isSetColor, type SetColor } from '../cards/limits.js'
import type { AnswerInput } from '../cards/types.js'
import { extractClozeBrackets } from './cloze-brackets.js'
import { findStringAnswers } from './string-answers.js'

export interface ParsedImportCard {
  paragraph: string
  answers: AnswerInput[]
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
 * Normalizes and validates raw card input.
 */
export function parseCard(raw: unknown): ParsedImportCard | null {
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
  // 3. Otherwise parse explicit `answers` field or QA `back`/`answer` fields
  else if (Array.isArray(raw.answers)) {
    const stringAnswers: string[] = []

    for (const a of raw.answers) {
      if (typeof a === 'string' && a.trim()) {
        stringAnswers.push(a.trim())
      } else if (isRecord(a)) {
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

        if (start !== undefined && end !== undefined) {
          answers.push({
            startOffset: Math.max(0, start),
            endOffset: Math.min(totalLength, end),
            altAnswers: altAnswers && altAnswers.length > 0 ? altAnswers : undefined,
          })
        } else {
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

    if (stringAnswers.length > 0) {
      const found = findStringAnswers(paragraph, stringAnswers)
      answers.push(...found)
    }
  } else if (typeof raw.answer === 'string' || typeof raw.back === 'string') {
    const singleAns = (typeof raw.answer === 'string' ? raw.answer : (raw.back as string)).trim()
    if (singleAns) {
      const found = findStringAnswers(paragraph, [singleAns])
      answers.push(...found)
    }
  }

  // 4. Sanitize, sort, and remove overlapping answers
  answers = answers
    .filter((a) => a.startOffset >= 0 && a.endOffset <= totalLength && a.startOffset < a.endOffset)
    .sort((a, b) => a.startOffset - b.startOffset)

  const nonOverlapping: AnswerInput[] = []
  for (const ans of answers) {
    const overlaps = nonOverlapping.some(
      (prev) => ans.startOffset < prev.endOffset && ans.endOffset > prev.startOffset,
    )
    if (!overlaps) {
      nonOverlapping.push(ans)
    }
  }

  const finalAnswers = nonOverlapping.slice(0, ANSWERS_MAX_PER_CARD)

  return {
    paragraph,
    answers: finalAnswers,
  }
}

/**
 * Normalizes and validates raw set input.
 */
export function parseSet(raw: unknown, defaultTitle = 'Imported Set'): ParsedImportSet | null {
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
      // Case 1: Object with `sets` array
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
      // Case 3: Object with `cards` array directly
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
        const first = parsedArray[0]
        if (isRecord(first) && Array.isArray(first.cards)) {
          for (const item of parsedArray) {
            const s = parseSet(item)
            if (s && s.cards.length > 0) sets.push(s)
          }
        } else {
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

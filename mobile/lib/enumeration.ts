import { codePointLength } from '@saulado/shared'

/**
 * Formats plain or pasted text into a structured enumeration study template.
 *
 * Pattern:
 * Title / Topic:
 * 1. Note item 1
 * 2. Note item 2
 * 3. Note item 3
 */

/**
 * Splits a single paragraph string into sentence chunks without relying on
 * regex lookbehind (for 100% universal JS engine compatibility).
 */
export function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)
  if (!matches) return [text]
  return matches.map((s) => s.trim()).filter((s) => s.length > 0)
}

/**
 * Strips leading bullet markers, dashes, asterisks, or existing numbers/letters
 * e.g. "1. ", "1) ", "- ", "• ", "* ", "a) "
 * Repeats in a loop to ensure any duplicated numbers/markers are completely removed.
 */
export function stripBulletMarker(line: string): string {
  let cleaned = line.trim()
  const markerRegex = /^([0-9]+[.)]|\([0-9a-zA-Z]+\)|[a-zA-Z][.)]|[-*•+–—])\s*/
  while (markerRegex.test(cleaned)) {
    cleaned = cleaned.replace(markerRegex, '').trim()
  }
  return cleaned
}

/**
 * Definition delimiter regex:
 * 1. Colons optionally followed by dashes and spaces (e.g. ":", ":-", " : - ", " : ", " :- ")
 * 2. Hyphen/en-dash/em-dash with whitespace on BOTH sides (e.g. " - ", " – ", " — ")
 *    NOTE: Hyphenated words without spaces on both sides (e.g. "in-between", "end-to-end", "cost-effective")
 *    will NOT match and are preserved intact.
 * 3. Dash followed by colon (e.g. " -: ")
 */
export const DEFINITION_DELIMITER_REGEX = /(?:\s*:\s*[-–—]?\s*|\s+[-–—]\s+|\s*[-–—]:\s*)/

/**
 * Extracts only the enumerated term from a line, excluding any trailing definition
 * delimiters (such as ":", ":-", " - ") and any explanation sentence/words following them.
 * Connected words with hyphens (e.g. "in-between", "state-of-the-art") remain un-split.
 */
export function extractEnumerationTerm(raw: string): string {
  const cleaned = stripBulletMarker(raw).trim()
  if (!cleaned) return ''

  const match = DEFINITION_DELIMITER_REGEX.exec(cleaned)
  if (match && match.index > 0) {
    const term = cleaned.slice(0, match.index).trim()
    if (term.length > 0) {
      return term.replace(/[,;:]+$/, '').trim()
    }
  }

  return cleaned.replace(/[,;:]+$/, '').trim()
}

/**
 * Alias for extractEnumerationTerm for backward and semantic compatibility.
 */
export const cleanEnumerationItem = extractEnumerationTerm

/**
 * Strips any literal "Title:", "Topic:", "Subject:" label so only the user's
 * actual title text is kept.
 */
export function cleanTitleText(raw: string): string {
  return raw
    .trim()
    .replace(/^(Title|Topic|Subject)\s*[:\-–—]?\s*/i, '')
    .replace(/[:.]+$/, '')
    .trim()
}

/**
 * Ensures a title ends with a colon if not ending with punctuation.
 */
export function formatTitle(raw: string): string {
  const cleaned = cleanTitleText(raw)
  if (!cleaned) return ''
  if (!cleaned.endsWith(':') && !cleaned.endsWith('?') && !cleaned.endsWith('!')) {
    return `${cleaned}:`
  }
  return cleaned
}

export interface ParsedEnumeration {
  title: string
  items: string[]
}

/**
 * Checks if a question text block is formatted as an enumeration.
 * Returns true if it has multiple lines and at least one subsequent line begins
 * with a list marker (e.g. "1. ", "1) ", "- ", "• ", "* ").
 */
export function isEnumeratedQuestion(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 2) {
    return false
  }

  const itemLines = lines.slice(1)
  const markerRegex = /^([0-9]+[.)]|\([0-9a-zA-Z]+\)|[a-zA-Z][.)]|[-*•+–—])\s+/
  return itemLines.some((line) => markerRegex.test(line))
}

/**
 * Parses raw or pasted text into a structured enumeration of title and items.
 */
export function parseEnumeration(rawText: string): ParsedEnumeration {
  const text = rawText.trim()
  if (!text) {
    return { title: '', items: ['', '', ''] }
  }

  // ── Case A: Multi-line text (e.g. pasted lines or existing list) ──
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (rawLines.length > 1) {
    // If the first line itself starts with a bullet/number marker, all lines are items
    const firstLineIsMarker = /^([0-9]+[.)]|\([0-9a-zA-Z]+\)|[a-zA-Z][.)]|[-*•+–—])\s+/.test(
      rawLines[0] as string,
    )

    if (firstLineIsMarker) {
      const items = rawLines.map((line) => cleanEnumerationItem(line)).filter((l) => l.length > 0)
      return { title: '', items: items.length > 0 ? items : ['', '', ''] }
    }

    const rawTitle = cleanTitleText(rawLines[0] as string)
    const items = rawLines
      .slice(1)
      .map((line) => cleanEnumerationItem(line))
      .filter((l) => l.length > 0)
    return { title: rawTitle, items: items.length > 0 ? items : ['', '', ''] }
  }

  // ── Case B: Single line / block paragraph ──
  let titlePart = ''
  let bodyPart = text

  const colonIndex = text.indexOf(':')
  if (colonIndex > 0 && colonIndex < text.length - 1) {
    titlePart = text.slice(0, colonIndex).trim()
    bodyPart = text.slice(colonIndex + 1).trim()
  }

  let segments: string[] = []

  if (titlePart) {
    if (bodyPart.includes(';')) {
      segments = bodyPart
        .split(/\s*;\s*/)
        .map((s) => s.trim().replace(/[;.!?]$/, ''))
        .filter((s) => s.length > 0)
    } else if (bodyPart.includes(',')) {
      segments = bodyPart
        .split(/\s*,\s*/)
        .map((s) => s.trim().replace(/[;.!?]$/, ''))
        .filter((s) => s.length > 0)
    } else {
      segments = splitSentences(bodyPart)
        .map((s) => s.replace(/[.!?]$/, '').trim())
        .filter((s) => s.length > 0)
    }
  } else {
    const sentences = splitSentences(text)
    if (sentences.length > 1) {
      titlePart = sentences[0] as string
      segments = sentences
        .slice(1)
        .map((s) => s.replace(/[.!?]$/, '').trim())
        .filter((s) => s.length > 0)
    } else if (text.includes(';')) {
      const semiSegments = text
        .split(/\s*;\s*/)
        .map((s) => s.trim().replace(/[;.!?]$/, ''))
        .filter((s) => s.length > 0)
      if (semiSegments.length > 1) {
        titlePart = semiSegments[0] as string
        segments = semiSegments.slice(1)
      } else {
        titlePart = text
        segments = []
      }
    } else if (text.includes(',')) {
      const commaSegments = text
        .split(/\s*,\s*/)
        .map((s) => s.trim().replace(/[;.!?]$/, ''))
        .filter((s) => s.length > 0)
      if (commaSegments.length > 1) {
        titlePart = ''
        segments = commaSegments
      } else {
        titlePart = text
        segments = []
      }
    } else {
      titlePart = text
      segments = []
    }
  }

  const cleanTitle = cleanTitleText(titlePart)
  const items = segments.map((seg) => cleanEnumerationItem(seg)).filter((s) => s.length > 0)

  return {
    title: cleanTitle,
    items: items.length > 0 ? items : ['', '', ''],
  }
}

export interface CompiledEnumeration {
  paragraph: string
  blanks: {
    startOffset: number
    endOffset: number
    answerText: string
  }[]
}

/**
 * Compiles structured title and items into a clean paragraph and computes
 * exact code point offsets for auto-highlighting each item as a question blank.
 *
 * NOTE: When includeNumberPrefix is false (the default for reviewer cards),
 * numbers like "1. ", "2. ", "3. " are NOT added to the paragraph to avoid
 * duplicate numbers with the highlight ordinal badges ([1], [2], [3]).
 */
export function compileEnumeration(
  title: string,
  items: string[],
  options?: { includeNumberPrefix?: boolean },
): CompiledEnumeration {
  const includePrefix = options?.includeNumberPrefix ?? false
  const formattedTitle = formatTitle(title)
  const validItems = items
    .map((it) => cleanEnumerationItem(it))
    .filter((it) => it.trim().length > 0)

  const lines: string[] = []
  if (formattedTitle) {
    lines.push(formattedTitle)
  }

  const blanks: { startOffset: number; endOffset: number; answerText: string }[] = []

  let runningOffset = formattedTitle ? codePointLength(formattedTitle) + 1 : 0

  validItems.forEach((itemText, index) => {
    const prefix = includePrefix ? `${String(index + 1)}. ` : ''
    const prefixLen = codePointLength(prefix)
    const itemLen = codePointLength(itemText)

    const startOffset = runningOffset + prefixLen
    const endOffset = startOffset + itemLen

    blanks.push({
      startOffset,
      endOffset,
      answerText: itemText,
    })

    const fullLine = `${prefix}${itemText}`
    lines.push(fullLine)
    runningOffset += codePointLength(fullLine) + 1
  })

  const paragraph = lines.join('\n')

  return {
    paragraph,
    blanks,
  }
}

/**
 * Transforms plain or pasted text into a structured enumeration string.
 * Automatically removes leading 1., 2., 3. or bullets from items to avoid duplications.
 */
export function formatAsEnumeration(
  rawText: string,
  options?: { includeNumberPrefix?: boolean },
): string {
  const parsed = parseEnumeration(rawText)
  const compiled = compileEnumeration(parsed.title, parsed.items, options)
  return compiled.paragraph
}

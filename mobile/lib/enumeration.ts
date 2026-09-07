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
 */
export function stripBulletMarker(line: string): string {
  return line.replace(/^([0-9]+[.)]|\([0-9a-zA-Z]+\)|[a-zA-Z][.)]|[-*•+–—])\s*/, '').trim()
}

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
    const rawTitle = cleanTitleText(rawLines[0] as string)
    const items = rawLines.slice(1).map((line) => stripBulletMarker(line))
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
    } else {
      titlePart = text
      segments = []
    }
  }

  const cleanTitle = cleanTitleText(titlePart)
  const items = segments.map((seg) => stripBulletMarker(seg))

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
 * NOTE: The word "Title:" is removed from the resulting paragraph.
 * Only the actual title text (followed by ':') is output, and the title is NOT blanked.
 */
export function compileEnumeration(title: string, items: string[]): CompiledEnumeration {
  const formattedTitle = formatTitle(title)
  const validItems = items.map((it) => stripBulletMarker(it)).filter((it) => it.trim().length > 0)

  const lines: string[] = []
  if (formattedTitle) {
    lines.push(formattedTitle)
  }

  const blanks: { startOffset: number; endOffset: number; answerText: string }[] = []

  let runningOffset = formattedTitle ? codePointLength(formattedTitle) + 1 : 0

  validItems.forEach((itemText, index) => {
    const prefix = `${String(index + 1)}. `
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
 * Strips any literal "Title:" word if present in the source text.
 */
export function formatAsEnumeration(rawText: string): string {
  const parsed = parseEnumeration(rawText)
  const compiled = compileEnumeration(parsed.title, parsed.items)
  if (!compiled.paragraph) {
    return '1. \n2. \n3. '
  }
  return compiled.paragraph
}

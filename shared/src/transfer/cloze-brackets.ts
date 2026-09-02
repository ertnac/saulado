import { toCodePoints } from '../cloze/codepoints.js'
import type { AnswerInput } from '../cards/types.js'

/**
 * Extracts cloze markers such as:
 * - Markdown brackets: `[answer]`
 * - Braces: `{answer}`
 * - Anki cloze syntax: `{{c1::answer}}` or `{{c1::answer::hint}}`
 *
 * Strips the brackets/syntax from the paragraph and computes exact Unicode code point offsets.
 */
export function extractClozeBrackets(text: string): {
  cleanParagraph: string
  answers: AnswerInput[]
} {
  // Regex to match {{c1::answer[::hint]}}, [answer], or {answer}
  const clozeRegex = /\{\{c\d+::([^:}]+)(?:::([^}]*))?\}\}|\[([^\]]+)\]|\{([^}]+)\}/g
  const matches: Array<{ match: string; answerText: string; index: number }> = []

  let m: RegExpExecArray | null
  while ((m = clozeRegex.exec(text)) !== null) {
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

  let cleanText = ''
  let lastIndex = 0
  const answers: AnswerInput[] = []

  for (const item of matches) {
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

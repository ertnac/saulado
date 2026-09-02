import { toCodePoints } from '../cloze/codepoints.js'
import type { AnswerInput } from '../cards/types.js'

/**
 * Finds occurrences of text strings in a paragraph to generate valid code point offsets.
 */
export function findStringAnswers(paragraph: string, answerTexts: string[]): AnswerInput[] {
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

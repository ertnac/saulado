/**
 * Intelligently cleans and formats document text layout.
 *
 * Resolves PDF/OCR extraction artifacts where:
 * 1. Line breaks between lines, headings, and bullet points were stripped.
 * 2. Words were collided together without spaces (e.g. "IntroductionLesson", "andCyber", "IAsecurity").
 * 3. Enumeration items were inlined into a single continuous sentence.
 */
export function formatDocumentTextLayout(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''

  let text = raw.trim()
  if (!text) return ''

  // 1. Normalize line breaks (\r\n -> \n, \r -> \n)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 2. Fix glued punctuation collisions (e.g. "Security.Differentiate" -> "Security. Differentiate")
  text = text.replace(/([.!?])([A-Z])/g, '$1 $2')

  // 3. Fix glued closing parentheses or brackets (e.g. "(IA)andCyber" -> "(IA) andCyber")
  text = text.replace(/([)\]])([A-Za-z0-9])/g, '$1 $2')

  // 4. Fix common small glued English words (e.g. "andCyber" -> "and Cyber", "toIdentify" -> "to Identify")
  text = text.replace(
    /\b(and|or|in|to|of|the|with|for|by|from|is|are|on|at|as|between|into)([A-Z][a-z]+)\b/g,
    '$1 $2',
  )

  // 5. Fix acronym glued to lowercase words (e.g. "IAsecurity" -> "IA security", "CIAgoals" -> "CIA goals")
  text = text.replace(/\b([A-Z]{2,})([a-z]{3,})\b/g, '$1 $2')

  // 6. Fix title glued to next word (e.g. "IntroductionLesson" -> "Introduction\n\nLesson")
  text = text.replace(
    /\b(Introduction|Overview|Summary|Objectives|Conclusion|Background|Definitions?|Chapter\s*\d+|Section\s*\d+)([A-Z][a-z]+)\b/g,
    '$1\n\n$2',
  )

  // 7. Insert line breaks before mid-sentence bullet markers
  // Handles: •, \u2022, \u25cf, \u25cb, \u25a0, *, -, –, —
  // and numbered/lettered lists e.g. "1. ", "1) ", "(1) ", "a) "
  const bulletPattern =
    /(?<=[^\n])\s+([•\u2022\u25cf\u25cb\u25a0]|\(?\d{1,2}[.)]|\([a-zA-Z]\)|[a-zA-Z][.)]|[-*–—])\s+(?=[A-Za-z0-9"'`“‘])/g
  text = text.replace(bulletPattern, '\n$1 ')

  // 8. Ensure line break after heading/colon when followed by list item
  text = text.replace(
    /(:)\s*([•\u2022\u25cf\u25cb\u25a0]|\(?\d{1,2}[.)]|\([a-zA-Z]\)|[a-zA-Z][.)]|[-*–—])\s+/g,
    '$1\n$2 ',
  )

  // 9. Clean up whitespace and line breaks
  const lines = text.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim())

  const cleanedLines: string[] = []
  let consecutiveEmpty = 0

  for (const line of lines) {
    if (line.length === 0) {
      consecutiveEmpty++
      if (consecutiveEmpty <= 1 && cleanedLines.length > 0) {
        cleanedLines.push('')
      }
    } else {
      consecutiveEmpty = 0
      cleanedLines.push(line)
    }
  }

  return cleanedLines.join('\n').trim()
}

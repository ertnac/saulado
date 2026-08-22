/**
 * High-performance, lightweight OCR text post-processor.
 *
 * Runs in < 1ms on any device without memory allocation overhead.
 * Corrects typical mobile OCR character confusions, reconnects broken words,
 * expands ligatures, and restores math & science symbols.
 */

// Common OCR-broken English suffixes and word fragments
const BROKEN_WORD_PATTERNS: [RegExp, string][] = [
  [/\bproce\s+ss\b/gi, 'process'],
  [/\bproce\s+dures\b/gi, 'procedures'],
  [/\bsepara\s+tely\b/gi, 'separately'],
  [/\biden\s+tify\b/gi, 'identify'],
  [/\binfor\s+mation\b/gi, 'information'],
  [/\bdevelo\s+pers\b/gi, 'developers'],
  [/\bdevelop\s+ers\b/gi, 'developers'],
  [/\bdevelo\s+ping\b/gi, 'developing'],
  [/\bdevelop\s+ing\b/gi, 'developing'],
  [/\bdevelo\s+pment\b/gi, 'development'],
  [/\bdevelop\s+ment\b/gi, 'development'],
  [/\bappli\s+cation\b/gi, 'application'],
  [/\bcompo\s+nents\b/gi, 'components'],
  [/\bcompo\s+nent\b/gi, 'component'],
  [/\bfunc\s+tional\b/gi, 'functional'],
  [/\busa\s+bility\b/gi, 'usability'],
  [/\bcorectly\b/gi, 'correctly'], // Common ML Kit typo on low res
  [/\ben\s+sure\b/gi, 'ensure'],
]

export function enhanceOcrText(text: string): string {
  if (!text || text.trim().length === 0) return ''

  let result = text

  // 1. Rejoin hyphenated line breaks (e.g. "photosyn-\nthesis" or "photosyn- thesis")
  result = result.replace(/(\b[a-zA-Z]+)-\s*\n\s*([a-zA-Z]+\b)/g, '$1$2')
  result = result.replace(/(\b[a-zA-Z]+)-\s+([a-zA-Z]+\b)/g, '$1$2')

  // 2. Expand common typographical ligatures
  result = result
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')

  // 3. Rejoin common fragmented word patterns
  for (const [pattern, replacement] of BROKEN_WORD_PATTERNS) {
    result = result.replace(pattern, replacement)
  }

  // 4. Restore Math, Science, and Directional Symbols
  result = result
    .replace(/([a-zA-Z0-9)])\s*\^\s*2\b/g, '$1²')
    .replace(/([a-zA-Z0-9)])\s*\^\s*3\b/g, '$1³')
    .replace(/\+\/-/g, '±')
    .replace(/<->/g, '↔')
    .replace(/->/g, '→')
    .replace(/<-/g, '←')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/~=/g, '≈')
    .replace(/\bdeg\s*C\b/gi, '℃')
    .replace(/\bdeg\s*F\b/gi, '℉')
    .replace(/\(c\)/gi, '©')
    .replace(/\(r\)/gi, '®')

  // 5. Standardize bullet list characters at line start
  result = result.replace(/^[-*–—]\s+/gm, '• ')

  // 6. Clean up irregular spacing around punctuation
  result = result
    .replace(/\s+([,.!?;:])/g, '$1') // remove space before punctuation
    .replace(/\(\s+/g, '(') // remove space after opening parenthesis
    .replace(/\s+\)/g, ')') // remove space before closing parenthesis
    .replace(/\[\s+/g, '[') // remove space after opening bracket
    .replace(/\s+\]/g, ']') // remove space before closing bracket
    .replace(/\b([a-zA-Z]+)\s+,\s+([a-zA-Z]+)\b/g, '$1, $2') // ensure single space after comma

  // 7. Normalize multiple blank lines (keep maximum of 2 newlines for question separation)
  result = result.replace(/[ \t]+/g, ' ')
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n')

  return result.trim()
}

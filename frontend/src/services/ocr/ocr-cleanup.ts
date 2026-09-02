import { dewrap, enhanceOcrText, normalizeParagraph } from '@saulado/shared'

/**
 * Normalizes and cleans up raw OCR text through the pipeline:
 * 1. Dewrap visual line breaks into natural paragraphs
 * 2. Apply typography, ligature, broken-word, and symbol restorations (enhanceOcrText)
 * 3. Unicode NFC and whitespace normalization (normalizeParagraph)
 */
export function cleanOcrText(rawText: string): string {
  if (!rawText || rawText.trim().length === 0) return ''

  // 1. Dewrap visual lines
  const dewrapped = dewrap(rawText)

  // 2. Enhance OCR text with symbol & typo fixes
  const enhanced = enhanceOcrText(dewrapped)

  // 3. Normalize paragraphs and whitespace
  return normalizeParagraph(enhanced).trim()
}

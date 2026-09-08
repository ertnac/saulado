import { describe, expect, it } from 'vitest'
import { extractTextFromPdfStream } from './pdf.js'

describe('extractTextFromPdfStream', () => {
  it('returns empty string for empty input', () => {
    expect(extractTextFromPdfStream('')).toBe('')
    expect(extractTextFromPdfStream(new Uint8Array())).toBe('')
  })

  it('extracts text from standard BT ... ET blocks with Tj operators', () => {
    const stream = `
      BT
        /F1 12 Tf
        (Photosynthesis is the process by which green plants) Tj
        T*
        (convert light energy into chemical energy.) Tj
      ET
    `
    const extracted = extractTextFromPdfStream(stream)
    expect(extracted).toContain(
      'Photosynthesis is the process by which green plants convert light energy into chemical energy.',
    )
  })

  it('extracts text from TJ array operators with kerning numbers', () => {
    const stream = `
      BT
        [(Mito) 20 (chondria) -10 ( is the powerhouse of the cell.)] TJ
      ET
    `
    const extracted = extractTextFromPdfStream(stream)
    expect(extracted).toBe('Mitochondria is the powerhouse of the cell.')
  })

  it('unescapes parenthesis, newlines, and octal sequences in PDF strings', () => {
    const stream = `
      BT
        (The formula for water is H2O \\(dihydrogen monoxide\\).) Tj
      ET
    `
    const extracted = extractTextFromPdfStream(stream)
    expect(extracted).toBe('The formula for water is H2O (dihydrogen monoxide).')
  })

  it('decodes hex string tokens inside text blocks', () => {
    // Hex representation of "DNA" is 44 4E 41
    const stream = `
      BT
        <444E41> Tj
        ( carries genetic instructions.) Tj
      ET
    `
    const extracted = extractTextFromPdfStream(stream)
    expect(extracted).toContain('DNA carries genetic instructions.')
  })

  it('handles multiple BT ... ET blocks separated into paragraphs', () => {
    const stream = `
      BT
        (Question 1: What is Newton's First Law?) Tj
      ET
      BT
        (Question 2: What is the speed of light?) Tj
      ET
    `
    const extracted = extractTextFromPdfStream(stream)
    expect(extracted).toContain("Question 1: What is Newton's First Law?")
    expect(extracted).toContain('Question 2: What is the speed of light?')
    expect(extracted).toMatch(/Question 1[\s\S]*?\n\n[\s\S]*?Question 2/)
  })

  it('extracts text from Uint8Array byte buffer', () => {
    const text = 'BT (Cellular respiration produces ATP.) Tj ET'
    const encoder = new TextEncoder()
    const bytes = encoder.encode(text)

    const extracted = extractTextFromPdfStream(bytes)
    expect(extracted).toBe('Cellular respiration produces ATP.')
  })

  it('falls back to standalone Tj operators when BT/ET delimiters are missing', () => {
    const stream = `
      /F1 12 Tf
      (Gravity is a fundamental interaction.) Tj
    `
    const extracted = extractTextFromPdfStream(stream)
    expect(extracted).toBe('Gravity is a fundamental interaction.')
  })
})

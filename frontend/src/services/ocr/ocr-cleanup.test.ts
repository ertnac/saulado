import { describe, expect, it } from 'vitest'
import { cleanOcrText } from './ocr-cleanup'

describe('cleanOcrText', () => {
  it('returns empty string for empty or whitespace-only input', () => {
    expect(cleanOcrText('')).toBe('')
    expect(cleanOcrText('   ')).toBe('')
  })

  it('rejoins hyphenated line breaks and expands ligatures', () => {
    const raw = 'Photosyn-\nthesis is an essential proce ss.'
    const cleaned = cleanOcrText(raw)

    expect(cleaned).toContain('Photosynthesis')
    expect(cleaned).toContain('process')
  })

  it('restores math and science symbols', () => {
    const raw = 'The temperature is 25 deg C with an error of +/- 2.'
    const cleaned = cleanOcrText(raw)

    expect(cleaned).toContain('25 ℃')
    expect(cleaned).toContain('± 2')
  })
})

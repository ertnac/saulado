import { describe, expect, it } from 'vitest'
import { enhanceNotesText, enhanceOcrText } from './ocr-enhancer.js'

describe('enhanceOcrText', () => {
  it('rejoins broken words across lines', () => {
    const input = 'This is photosyn-\nthesis in plants and proce-\ndures.'
    const output = enhanceOcrText(input)
    expect(output).toContain('photosynthesis')
    expect(output).toContain('procedures')
  })

  it('rejoins OCR fragmented words with spurious spaces', () => {
    const input = 'The develo pers conducted unit testing in the develop ment proce ss.'
    const output = enhanceOcrText(input)
    expect(output).toContain('developers')
    expect(output).toContain('development')
    expect(output).toContain('process')
  })

  it('expands unicode ligatures', () => {
    const input = 'The ﬁrst ﬂower had ﬀ and ﬃ ligatures.'
    const output = enhanceOcrText(input)
    expect(output).toBe('The first flower had ff and ffi ligatures.')
  })

  it('restores math and science symbols from ASCII', () => {
    const input = 'x^2 + y^2 = r^2, margin +/- 5%, 25 deg C, A -> B, x != y, a <= b'
    const output = enhanceOcrText(input)
    expect(output).toBe('x² + y² = r², margin ± 5%, 25 ℃, A → B, x ≠ y, a ≤ b')
  })

  it('standardizes bullet lists', () => {
    const input = '* First item\n- Second item\n— Third item'
    const output = enhanceOcrText(input)
    expect(output).toBe('• First item\n• Second item\n• Third item')
  })

  it('cleans up misplaced punctuation spaces', () => {
    const input = 'Testing ( in app ) , with multiple items [ 1 ] .'
    const output = enhanceOcrText(input)
    expect(output).toBe('Testing (in app), with multiple items [1].')
  })

  it('exports enhanceNotesText identical to enhanceOcrText', () => {
    const raw = 'The fi-rst step is photosynthesis.'
    expect(enhanceNotesText(raw)).toBe(enhanceOcrText(raw))
  })
})

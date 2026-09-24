import { describe, expect, it } from 'vitest'
import { enhanceNotesText } from '@saulado/shared'

describe('Paste Cards text processing', () => {
  it('splits notes into question card paragraphs on blank lines', () => {
    const rawNotes = `First card concept.
Detail line.

Second card concept.
More detail.

Third card concept.`

    const paragraphs = rawNotes
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0]).toBe('First card concept.\nDetail line.')
    expect(paragraphs[1]).toBe('Second card concept.\nMore detail.')
    expect(paragraphs[2]).toBe('Third card concept.')
  })

  it('cleans up typography and broken words for pasted notes', () => {
    const messy = 'The fi-rst step in develo pment is proce ss.'
    const cleaned = enhanceNotesText(messy)
    expect(cleaned).toContain('development')
    expect(cleaned).toContain('process')
  })
})

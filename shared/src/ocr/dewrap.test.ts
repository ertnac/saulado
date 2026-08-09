import { describe, expect, it } from 'vitest'
import { dewrap } from './dewrap.js'

/**
 * De-wrapping full-page OCR text into prose.
 *
 * OCR emits a newline at every visual line. Left in, the paragraph reads as a
 * column of fragments and every newline is a code point each answer offset has
 * to index around. De-wrapping joins lines, rejoins hyphenated words, and
 * collapses CRLF so the text is ready for highlighting.
 */

const PROSE = 'The CPU is the brain of the computer and runs every instruction it is given.'

describe('dewrap', () => {
  it('joins visual lines into prose', () => {
    const wrapped = 'The CPU is the brain of\nthe computer and runs every\ninstruction it is given.'

    expect(dewrap(wrapped)).toBe(PROSE)
  })

  it('rejoins a word hyphenated across a line break', () => {
    const wrapped = 'A chloro-\nplast turns light into sugar inside the leaf of a plant.'

    expect(dewrap(wrapped)).toBe('A chloroplast turns light into sugar inside the leaf of a plant.')
  })

  it('leaves a bullet hyphen alone', () => {
    const wrapped = 'Two things matter here:\n- the leaf, and the light it gets.'

    expect(dewrap(wrapped)).toBe('Two things matter here: - the leaf, and the light it gets.')
  })

  it('drops indentation OCR puts on a wrapped line', () => {
    const wrapped = 'The CPU is the brain of the computer and\n   runs every one.'

    expect(dewrap(wrapped)).toBe('The CPU is the brain of the computer and runs every one.')
  })

  it('collapses CRLF to a space', () => {
    expect(dewrap('The CPU is\r\nthe brain.')).toBe('The CPU is the brain.')
  })

  it('collapses lone CR to a space', () => {
    expect(dewrap('The CPU is\rthe brain.')).toBe('The CPU is the brain.')
  })

  it('keeps a blank line, because that gap is a real paragraph boundary', () => {
    // The whole point of splitting first: a wrap becomes a space, a paragraph
    // gap stays a gap. Flattening both would hand the user one wall of text.
    expect(dewrap('First one\nwrapped.\n\nSecond one\nwrapped.')).toBe(
      'First one wrapped.\n\nSecond one wrapped.',
    )
  })

  it('drops a run of blank lines rather than emitting empty blocks', () => {
    expect(dewrap('First.\n\n   \n\nSecond.')).toBe('First.\n\nSecond.')
  })
})

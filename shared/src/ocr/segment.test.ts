import { describe, expect, it } from 'vitest'
import { segmentParagraphs } from './segment.js'
import { codePointLength } from '../cloze/codepoints.js'
import { PARAGRAPH_MAX_CODE_POINTS } from '../cards/limits.js'

/**
 * Segmentation of OCR text.
 *
 * The load-bearing assertions are de-wrapping and truncation. A surviving
 * newline is a code point every answer offset downstream has to index around,
 * and a block cut with `String.prototype.slice` would hand the highlight editor
 * a lone surrogate. Everything else here is classification, where being wrong
 * costs the user one click.
 */

/** Long enough and punctuated, so classification turns on the rule under test. */
const PROSE = 'The CPU is the brain of the computer and runs every instruction it is given.'

describe('splitting', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    expect(segmentParagraphs('')).toEqual([])
    expect(segmentParagraphs('   \n \t \n\n  ')).toEqual([])
  })

  it('splits on a blank line and numbers the results in reading order', () => {
    const second = 'RAM holds the data the CPU is using right now.'
    const paragraphs = segmentParagraphs(`${PROSE}\n\n${second}`)

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]).toEqual({ id: '0', text: PROSE, confidence: 'likely' })
    expect(paragraphs[1]?.id).toBe('1')
  })

  it('splits a block gap that arrived as CRLF', () => {
    // Tesseract emits LF, but text pasted into the review list on Windows does
    // not. The split runs before normalization, so the `\r` has to go first.
    expect(segmentParagraphs(`${PROSE}\r\n\r\n${PROSE}`)).toHaveLength(2)
  })

  it('numbers by output position, not by block position', () => {
    // A dropped block must not leave a hole in the ids — they are React keys.
    const paragraphs = segmentParagraphs(`${PROSE}\n\n   \n\n${PROSE}`)

    expect(paragraphs.map((paragraph) => paragraph.id)).toEqual(['0', '1'])
  })
})

describe('de-wrapping', () => {
  it('joins the visual lines of one paragraph into prose', () => {
    const wrapped = 'The CPU is the brain of\nthe computer and runs every\ninstruction it is given.'

    expect(segmentParagraphs(wrapped)[0]?.text).toBe(PROSE)
  })

  it('rejoins a word hyphenated across a line break', () => {
    const wrapped = 'A chloro-\nplast turns light into sugar inside the leaf of a plant.'

    expect(segmentParagraphs(wrapped)[0]?.text).toBe(
      'A chloroplast turns light into sugar inside the leaf of a plant.',
    )
  })

  it('leaves a bullet hyphen alone', () => {
    // The rejoin rule needs a letter on *both* sides of the hyphen. Without that,
    // a list item loses its marker and merges into the line above it.
    const wrapped = 'Two things matter here, in this order:\n- the leaf, and the light it gets.'

    expect(segmentParagraphs(wrapped)[0]?.text).toBe(
      'Two things matter here, in this order: - the leaf, and the light it gets.',
    )
  })

  it('drops the indentation OCR puts on a wrapped line', () => {
    const wrapped = 'The CPU is the brain of the computer and\n   runs every one.'

    expect(segmentParagraphs(wrapped)[0]?.text).toBe(
      'The CPU is the brain of the computer and runs every one.',
    )
  })
})

describe('classification', () => {
  it('marks a page number unlikely', () => {
    expect(segmentParagraphs(`${PROSE}\n\n12`)[1]).toEqual({
      id: '1',
      text: '12',
      confidence: 'unlikely',
    })
  })

  it('marks a running head unlikely — too short to be a sentence', () => {
    expect(segmentParagraphs('Chapter 3: Photosynthesis')[0]?.confidence).toBe('unlikely')
  })

  it('marks a long block with no sentence ending unlikely', () => {
    const caption = 'Photosynthesis in the leaves of green plants and algae'

    expect(codePointLength(caption)).toBeGreaterThan(40)
    expect(segmentParagraphs(caption)[0]?.confidence).toBe('unlikely')
  })

  it('marks a mostly-numeric row unlikely', () => {
    const row = '1990 1991 1992 1993 1994 1995 1996 1997 1998 1999 2000 2001.'

    expect(segmentParagraphs(row)[0]?.confidence).toBe('unlikely')
  })

  it('keeps an unlikely block rather than dropping it', () => {
    // OCR noise is a coin flip, so the user gets the block unchecked instead of
    // silently losing a paragraph the classifier misread.
    expect(segmentParagraphs('12')).toHaveLength(1)
  })
})

describe('truncation', () => {
  it('cuts an over-long block to the card paragraph cap', () => {
    const long = `${'word '.repeat(1200)}end.`
    const text = segmentParagraphs(long)[0]?.text ?? ''

    expect(codePointLength(long)).toBeGreaterThan(PARAGRAPH_MAX_CODE_POINTS)
    expect(codePointLength(text)).toBeLessThanOrEqual(PARAGRAPH_MAX_CODE_POINTS)
  })

  it('cuts on a code-point boundary, not a UTF-16 one', () => {
    // Every emoji here is a surrogate pair. `slice(0, 5000)` would land in the
    // middle of one and leave a lone surrogate in text the user is about to
    // highlight — an offset the editor cannot map back to a character.
    const text = segmentParagraphs('\u{1F600}'.repeat(6000))[0]?.text ?? ''

    expect(codePointLength(text)).toBe(PARAGRAPH_MAX_CODE_POINTS)
    expect(text.length).toBe(PARAGRAPH_MAX_CODE_POINTS * 2)
    expect(Array.from(text).every((char) => char === '\u{1F600}')).toBe(true)
  })
})

describe('normalization', () => {
  it('recomposes decomposed characters, so the text matches what gets committed', () => {
    // NFD from a macOS paste vs NFC from a keyboard: identical on screen,
    // different lengths, and every stored offset indexes the normalized form.
    // Skipping this would let the review dialog show one string while the
    // composer commits another. The NFD form is built with `.normalize` rather
    // than typed, because the two are indistinguishable in an editor.
    const tail = ' au lait is the drink they serve in the morning.'
    const text = segmentParagraphs(`café${tail}`.normalize('NFD'))[0]?.text ?? ''

    expect(text).toBe(`café${tail}`.normalize('NFC'))
    expect(codePointLength(text)).toBe(codePointLength(tail) + 4)
  })

  it('drops the trailing space OCR leaves at the end of a line', () => {
    expect(segmentParagraphs(`${PROSE}   `)[0]?.text).toBe(PROSE)
  })
})

import { sliceCodePoints } from '@saulado/shared'
import { describe, expect, it } from 'vitest'
import {
  cleanTitleText,
  compileEnumeration,
  formatAsEnumeration,
  formatTitle,
  parseEnumeration,
} from '../enumeration'

describe('enumeration module', () => {
  describe('cleanTitleText and formatTitle', () => {
    it('removes literal Title: or Topic: words', () => {
      expect(cleanTitleText('Title: Three Primary Colors')).toBe('Three Primary Colors')
      expect(cleanTitleText('Title - Stages of Mitosis')).toBe('Stages of Mitosis')
      expect(cleanTitleText('Topic: Solar System')).toBe('Solar System')
      expect(cleanTitleText('Title:')).toBe('')
    })

    it('formats title with colon without Title: prefix', () => {
      expect(formatTitle('Title: Three Primary Colors')).toBe('Three Primary Colors:')
      expect(formatTitle('Photosynthesis')).toBe('Photosynthesis:')
      expect(formatTitle('What are the 3 states of matter?')).toBe(
        'What are the 3 states of matter?',
      )
    })
  })

  describe('parseEnumeration', () => {
    it('parses empty text into empty title and empty items', () => {
      const parsed = parseEnumeration('')
      expect(parsed.title).toBe('')
      expect(parsed.items).toHaveLength(3)
    })

    it('parses multiline text stripping bullets', () => {
      const input = `Title: Three Branches
- Legislative
• Executive
3. Judicial`
      const parsed = parseEnumeration(input)
      expect(parsed.title).toBe('Three Branches')
      expect(parsed.items).toEqual(['Legislative', 'Executive', 'Judicial'])
    })

    it('parses continuous sentences into title and items', () => {
      const input = 'Primary Colors. Red is energetic. Blue is calming. Yellow is bright.'
      const parsed = parseEnumeration(input)
      expect(parsed.title).toBe('Primary Colors')
      expect(parsed.items).toEqual(['Red is energetic', 'Blue is calming', 'Yellow is bright'])
    })
  })

  describe('compileEnumeration', () => {
    it('removes the word Title from the resulting paragraph and auto-blanks only the items', () => {
      const title = 'Title: Three Primary Colors'
      const items = ['Red', 'Blue', 'Yellow']

      const { paragraph, blanks } = compileEnumeration(title, items)

      // The literal word "Title" must NOT be in the paragraph
      expect(paragraph).not.toContain('Title')
      expect(paragraph).toBe(`Three Primary Colors:
1. Red
2. Blue
3. Yellow`)

      // There must be 3 blanks corresponding to the 3 items
      expect(blanks).toHaveLength(3)
      expect(blanks[0]?.answerText).toBe('Red')
      expect(blanks[1]?.answerText).toBe('Blue')
      expect(blanks[2]?.answerText).toBe('Yellow')

      // Verify exact code point slices match the items
      for (const blank of blanks) {
        const sliced = sliceCodePoints(paragraph, blank.startOffset, blank.endOffset)
        expect(sliced).toBe(blank.answerText)
      }

      // Title must NOT be in blanks
      expect(blanks.some((b) => b.answerText.includes('Primary Colors'))).toBe(false)
    })

    it('works when title is empty', () => {
      const { paragraph, blanks } = compileEnumeration('', ['Solid', 'Liquid', 'Gas'])
      expect(paragraph).toBe(`1. Solid
2. Liquid
3. Gas`)
      expect(blanks).toHaveLength(3)
      for (const blank of blanks) {
        expect(sliceCodePoints(paragraph, blank.startOffset, blank.endOffset)).toBe(
          blank.answerText,
        )
      }
    })
  })

  describe('formatAsEnumeration', () => {
    it('removes literal Title: from text and formats items', () => {
      const input = `Title: Three Primary Colors
Red
Blue
Yellow`
      const result = formatAsEnumeration(input)
      expect(result).not.toContain('Title')
      expect(result).toBe(`Three Primary Colors:
1. Red
2. Blue
3. Yellow`)
    })
  })
})

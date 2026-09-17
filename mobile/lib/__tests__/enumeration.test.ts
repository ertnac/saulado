import { sliceCodePoints } from '@saulado/shared'
import { describe, expect, it } from 'vitest'
import {
  cleanTitleText,
  compileEnumeration,
  extractEnumerationTerm,
  formatAsEnumeration,
  formatTitle,
  isEnumeratedQuestion,
  parseEnumeration,
} from '../enumeration'

describe('enumeration module', () => {
  describe('extractEnumerationTerm', () => {
    it('strips colons and definition sentences', () => {
      expect(
        extractEnumerationTerm(
          "Organizational Function: Protects the organization's core capability to function smoothly.",
        ),
      ).toBe('Organizational Function')
    })

    it('strips :- and : - with spaces and definition sentences', () => {
      expect(extractEnumerationTerm('Client Side :- Runs on user browser or mobile device.')).toBe(
        'Client Side',
      )
      expect(
        extractEnumerationTerm('Server Side : - Handles business logic and database access.'),
      ).toBe('Server Side')
    })

    it('strips spaced dashes ( - , – , — ) and definitions', () => {
      expect(extractEnumerationTerm('Database Layer - Stores relational and object data.')).toBe(
        'Database Layer',
      )
      expect(extractEnumerationTerm('Cache Layer – Accelerates repeated data retrieval.')).toBe(
        'Cache Layer',
      )
      expect(
        extractEnumerationTerm('Queue Worker — Processes background asynchronous tasks.'),
      ).toBe('Queue Worker')
    })

    it('preserves connected/hyphenated words without spaces (e.g. in-between, end-to-end, cost-effective)', () => {
      expect(
        extractEnumerationTerm('In-between nodes: Relays packets between network segments.'),
      ).toBe('In-between nodes')
      expect(
        extractEnumerationTerm('End-to-End Encryption - Encrypts data from origin to destination.'),
      ).toBe('End-to-End Encryption')
      expect(
        extractEnumerationTerm('Cost-Effective Safeguards : - Controls that fit within budget.'),
      ).toBe('Cost-Effective Safeguards')
      expect(extractEnumerationTerm('State-of-the-Art Architecture')).toBe(
        'State-of-the-Art Architecture',
      )
    })

    it('preserves plain items without definitions', () => {
      expect(extractEnumerationTerm('Red')).toBe('Red')
      expect(extractEnumerationTerm('1. Blue')).toBe('Blue')
    })
  })

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
    it('removes literal Title and compiles notes without duplicate numbers by default', () => {
      const title = 'Title: Three Primary Colors'
      const items = ['1. Red', '2. Blue', '3. Yellow']

      const { paragraph, blanks } = compileEnumeration(title, items, { includeNumberPrefix: false })

      // The literal word "Title" must NOT be in the paragraph
      expect(paragraph).not.toContain('Title')
      expect(paragraph).toBe(`Three Primary Colors:
Red
Blue
Yellow`)

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

    it('supports includeNumberPrefix: true when explicitly requested', () => {
      const { paragraph, blanks } = compileEnumeration('Colors', ['Red', 'Blue'], {
        includeNumberPrefix: true,
      })
      expect(paragraph).toBe(`Colors:
1. Red
2. Blue`)
      expect(blanks).toHaveLength(2)
      expect(sliceCodePoints(paragraph, blanks[0]!.startOffset, blanks[0]!.endOffset)).toBe('Red')
      expect(sliceCodePoints(paragraph, blanks[1]!.startOffset, blanks[1]!.endOffset)).toBe('Blue')
    })

    it('works when title is empty', () => {
      const { paragraph, blanks } = compileEnumeration('', ['Solid', 'Liquid', 'Gas'], {
        includeNumberPrefix: false,
      })
      expect(paragraph).toBe(`Solid
Liquid
Gas`)
      expect(blanks).toHaveLength(3)
      for (const blank of blanks) {
        expect(sliceCodePoints(paragraph, blank.startOffset, blank.endOffset)).toBe(
          blank.answerText,
        )
      }
    })

    it("handles user's four critical roles example: excludes colons and definitions from blanks and paragraph", () => {
      const input = `Four Critical Roles of Security Measures
1. Organizational Function: Protects the organization's core capability to function smoothly without operational disruption.
2. Safe Application Deployment: Enables the safe operation and deployment of software applications across IT systems.
3. Data Protection: Safeguards the integrity and confidentiality of data collected and processed.
4. Technology Safeguards: Safeguards the underlying hardware, network, and cloud technology infrastructure.`

      const parsed = parseEnumeration(input)
      expect(parsed.title).toBe('Four Critical Roles of Security Measures')
      expect(parsed.items).toEqual([
        'Organizational Function',
        'Safe Application Deployment',
        'Data Protection',
        'Technology Safeguards',
      ])

      const compiled = compileEnumeration(parsed.title, parsed.items, {
        includeNumberPrefix: false,
      })
      expect(compiled.paragraph).toBe(
        `Four Critical Roles of Security Measures:
Organizational Function
Safe Application Deployment
Data Protection
Technology Safeguards`,
      )

      expect(compiled.blanks).toHaveLength(4)
      expect(compiled.blanks[0]?.answerText).toBe('Organizational Function')
      expect(compiled.blanks[1]?.answerText).toBe('Safe Application Deployment')
      expect(compiled.blanks[2]?.answerText).toBe('Data Protection')
      expect(compiled.blanks[3]?.answerText).toBe('Technology Safeguards')

      for (const blank of compiled.blanks) {
        expect(sliceCodePoints(compiled.paragraph, blank.startOffset, blank.endOffset)).toBe(
          blank.answerText,
        )
      }
    })
  })

  describe('isEnumeratedQuestion', () => {
    it('returns true for questions with numbered or bulleted list items', () => {
      const q1 = `Primary Colors:
1. Red
2. Blue
3. Yellow`
      expect(isEnumeratedQuestion(q1)).toBe(true)

      const q2 = `Stages of Mitosis:
• Prophase
• Metaphase
• Anaphase
• Telophase`
      expect(isEnumeratedQuestion(q2)).toBe(true)

      const q3 = `1. Legislative
2. Executive
3. Judicial`
      expect(isEnumeratedQuestion(q3)).toBe(true)
    })

    it('returns false for plain prose paragraphs and single-line notes', () => {
      const p1 = 'The mitochondrion is the powerhouse of the eukaryotic cell.'
      expect(isEnumeratedQuestion(p1)).toBe(false)

      const p2 = `Photosynthesis Overview:
Plants convert sunlight, water, and carbon dioxide into sugars.
Oxygen is released as a byproduct into the atmosphere.`
      expect(isEnumeratedQuestion(p2)).toBe(false)
    })

    it('returns true for single-line glued bullet lists extracted from PDFs', () => {
      const raw =
        'Lesson Objectives: • Explain IA concepts. • Differentiate CIA Triad. • Map security controls.'
      expect(isEnumeratedQuestion(raw)).toBe(true)

      const parsed = parseEnumeration(raw)
      expect(parsed.title).toBe('Lesson Objectives')
      expect(parsed.items).toHaveLength(3)
      expect(parsed.items[0]).toBe('Explain IA concepts.')
      expect(parsed.items[1]).toBe('Differentiate CIA Triad.')
      expect(parsed.items[2]).toBe('Map security controls.')
    })
  })

  describe('formatAsEnumeration', () => {
    it('removes literal Title: from text and formats items without duplicate numbering', () => {
      const input = `Title: Three Primary Colors
1. Red
2. Blue
3. Yellow`
      const result = formatAsEnumeration(input)
      expect(result).not.toContain('Title')
      expect(result).toBe(`Three Primary Colors:
Red
Blue
Yellow`)
    })

    it('handles list without title where first line has a marker', () => {
      const input = `1. Apple
2. Banana
3. Orange`
      const result = formatAsEnumeration(input)
      expect(result).toBe(`Apple
Banana
Orange`)
    })

    it('formats comma separated items after title', () => {
      const input = 'Primary Colors: Red, Blue, Yellow'
      const result = formatAsEnumeration(input)
      expect(result).toBe(`Primary Colors:
Red
Blue
Yellow`)
    })
  })
})

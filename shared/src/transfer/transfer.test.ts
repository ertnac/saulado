import { describe, expect, it } from 'vitest'
import { extractClozeBrackets } from './cloze-brackets.js'
import { findStringAnswers } from './string-answers.js'
import { parseAndValidateJson, parseCard } from './json-parser.js'

describe('transfer module (shared)', () => {
  describe('extractClozeBrackets', () => {
    it('extracts markdown bracket syntax [answer]', () => {
      const input = 'The capital of France is [Paris].'
      const { cleanParagraph, answers } = extractClozeBrackets(input)

      expect(cleanParagraph).toBe('The capital of France is Paris.')
      expect(answers).toHaveLength(1)
      expect(answers[0]?.startOffset).toBe(25)
      expect(answers[0]?.endOffset).toBe(30)
    })

    it('extracts brace syntax {answer}', () => {
      const input = 'Water freezes at {0} degrees Celsius.'
      const { cleanParagraph, answers } = extractClozeBrackets(input)

      expect(cleanParagraph).toBe('Water freezes at 0 degrees Celsius.')
      expect(answers).toHaveLength(1)
      expect(answers[0]?.startOffset).toBe(17)
      expect(answers[0]?.endOffset).toBe(18)
    })

    it('extracts Anki cloze syntax {{c1::answer}}', () => {
      const input = 'Photosynthesis occurs in {{c1::chloroplasts}} of plants.'
      const { cleanParagraph, answers } = extractClozeBrackets(input)

      expect(cleanParagraph).toBe('Photosynthesis occurs in chloroplasts of plants.')
      expect(answers).toHaveLength(1)
      expect(answers[0]?.startOffset).toBe(25)
      expect(answers[0]?.endOffset).toBe(37)
    })

    it('extracts Anki cloze syntax with hint {{c1::answer::hint}}', () => {
      const input = 'The powerhouse of the cell is {{c1::mitochondria::organelle}}.'
      const { cleanParagraph, answers } = extractClozeBrackets(input)

      expect(cleanParagraph).toBe('The powerhouse of the cell is mitochondria.')
      expect(answers).toHaveLength(1)
      expect(answers[0]?.startOffset).toBe(30)
      expect(answers[0]?.endOffset).toBe(42)
    })

    it('extracts multiple clozes in one text', () => {
      const input = '{{c1::DNA}} codes for {{c2::proteins}}.'
      const { cleanParagraph, answers } = extractClozeBrackets(input)

      expect(cleanParagraph).toBe('DNA codes for proteins.')
      expect(answers).toHaveLength(2)
      expect(answers[0]?.startOffset).toBe(0)
      expect(answers[0]?.endOffset).toBe(3)
      expect(answers[1]?.startOffset).toBe(14)
      expect(answers[1]?.endOffset).toBe(22)
    })
  })

  describe('findStringAnswers', () => {
    it('converts string answers to valid offsets', () => {
      const paragraph = 'Mitochondria produces ATP for energy.'
      const answers = findStringAnswers(paragraph, ['Mitochondria', 'ATP'])

      expect(answers).toHaveLength(2)
      expect(answers[0]?.startOffset).toBe(0)
      expect(answers[0]?.endOffset).toBe(12)
      expect(answers[1]?.startOffset).toBe(22)
      expect(answers[1]?.endOffset).toBe(25)
    })

    it('ignores overlapping or non-matching string answers', () => {
      const paragraph = 'Cell biology'
      const answers = findStringAnswers(paragraph, ['Cell', 'Cell bio', 'NonExistent'])

      expect(answers).toHaveLength(1)
      expect(answers[0]?.startOffset).toBe(0)
      expect(answers[0]?.endOffset).toBe(4)
    })
  })

  describe('parseCard', () => {
    it('parses card with bracket clozes', () => {
      const card = parseCard({
        paragraph: 'France has capital [Paris].',
        tags: ['geography', 'capitals'],
      })

      expect(card).not.toBeNull()
      expect(card?.paragraph).toBe('France has capital Paris.')
      expect(card?.answers).toHaveLength(1)
      expect(card?.tags).toEqual(['geography', 'capitals'])
    })

    it('parses QA format card with front and back', () => {
      const card = parseCard({
        front: 'The speed of light in vacuum is approximately 300,000 km/s.',
        back: '300,000 km/s',
      })

      expect(card).not.toBeNull()
      expect(card?.paragraph).toContain('speed of light')
      expect(card?.answers).toHaveLength(1)
    })
  })

  describe('parseAndValidateJson', () => {
    it('parses full Saulado export format', () => {
      const raw = JSON.stringify({
        formatVersion: 2,
        type: 'single_set',
        set: {
          title: 'Biology 101',
          color: 'teal',
          cards: [
            {
              paragraph: 'Plants use [chlorophyll] to absorb light.',
              answers: [],
              tags: ['bio'],
            },
          ],
        },
      })

      const res = parseAndValidateJson(raw)
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.sets).toHaveLength(1)
        expect(res.data.sets[0]?.title).toBe('Biology 101')
        expect(res.data.sets[0]?.cards).toHaveLength(1)
        expect(res.data.totalCards).toBe(1)
      }
    })

    it('parses raw array of cloze cards', () => {
      const raw = JSON.stringify([
        { text: 'Water is composed of [hydrogen] and [oxygen].' },
        { text: 'Earth is the [third] planet from the Sun.' },
      ])

      const res = parseAndValidateJson(raw)
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.sets).toHaveLength(1)
        expect(res.data.totalCards).toBe(2)
      }
    })

    it('parses cards with string array answers', () => {
      const raw = JSON.stringify({
        title: 'Chemistry',
        cards: [
          {
            paragraph: 'Sodium and chlorine form table salt.',
            answers: ['Sodium', 'chlorine'],
          },
        ],
      })

      const res = parseAndValidateJson(raw)
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.sets[0]?.cards[0]?.answers).toHaveLength(2)
      }
    })

    it('returns error on invalid or empty JSON', () => {
      expect(parseAndValidateJson('').success).toBe(false)
      expect(parseAndValidateJson('{ broken json').success).toBe(false)
      expect(parseAndValidateJson('{"randomKey": 123}').success).toBe(false)
    })
  })
})

import { describe, expect, it } from 'vitest'
import { generateBlankOptions, extractContextWords } from './distractors.js'

describe('extractContextWords', () => {
  it('extracts unique long words and ignores stop words/punctuation', () => {
    const paragraph = 'The quick, brown foxes jump over the lazy dogs! Dogs are fun.'
    const result = extractContextWords(paragraph, ['foxes'])
    // 'the', 'are' are stop words. 'foxes' is excluded.
    // candidates: 'quick', 'brown', 'jump', 'over', 'lazy', 'dogs', 'fun'
    expect(result).toContain('quick')
    expect(result).toContain('brown')
    expect(result).toContain('jump')
    expect(result).toContain('dogs')
    expect(result).not.toContain('the')
    expect(result).not.toContain('foxes')
    expect(result).not.toContain('are')
  })
})

describe('generateBlankOptions', () => {
  it('uses set answers if pool has at least 3 unique distractors', () => {
    const correct = ['photosynthesis']
    const allAnswers = ['respiration', 'mitosis', 'meiosis', 'osmosis', 'respiration']
    const paragraph = 'This is a test paragraph.'

    const options = generateBlankOptions(correct, allAnswers, paragraph, 4)
    expect(options).toHaveLength(4)
    expect(options).toContain('photosynthesis')
    // We don't know exact ones since it's shuffled, but all should come from the set
    options.forEach((opt) => {
      if (opt !== 'photosynthesis') {
        expect(allAnswers).toContain(opt)
      }
    })
  })

  it('falls back to context words if pool has fewer than 3 unique distractors', () => {
    const correct = ['photosynthesis']
    const allAnswers = ['respiration', 'photosynthesis'] // only 1 unique distractor
    const paragraph = 'Plants use sunlight to synthesise foods from carbon dioxide and water.'

    const options = generateBlankOptions(correct, allAnswers, paragraph, 4)
    expect(options).toHaveLength(4)
    expect(options).toContain('photosynthesis')
    // Should contain words from the paragraph
    const pWords = [
      'plants',
      'use',
      'sunlight',
      'synthesise',
      'foods',
      'from',
      'carbon',
      'dioxide',
      'water',
    ]
    const distractors = options.filter((opt) => opt !== 'photosynthesis')

    distractors.forEach((opt) => {
      expect(pWords).toContain(opt)
    })
  })
})

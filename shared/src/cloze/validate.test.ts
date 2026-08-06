import { describe, expect, it } from 'vitest'
import {
  checkAnswer,
  checkAnswers,
  describeMatch,
  gradeCard,
  isCardCorrect,
  normalize,
  typoThreshold,
} from './validate.js'

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('CPU')).toBe('cpu')
  })

  it('trims whitespace', () => {
    expect(normalize('  CPU  ')).toBe('cpu')
  })

  it('collapses internal whitespace', () => {
    expect(normalize('central   processing   unit')).toBe('central processing unit')
  })

  it('converts smart quotes to straight', () => {
    // Written as escapes so the test can't be silently "fixed" by an editor or
    // formatter that normalizes quote characters in source.
    const smartSingle = '‘it’s’'
    const smartDouble = '“hello”'

    expect(normalize(smartSingle)).toBe("'it's'")
    expect(normalize(smartDouble)).toBe('"hello"')
  })

  it('applies NFC normalization', () => {
    expect(normalize('café')).toBe(normalize('café'))
  })
})

describe('typoThreshold', () => {
  it('scales with length', () => {
    expect(typoThreshold(3)).toBe(0) // Short answers get zero tolerance
    expect(typoThreshold(6)).toBe(1)
    expect(typoThreshold(12)).toBe(2)
    expect(typoThreshold(99)).toBe(2) // Caps at 2
  })
})

describe('checkAnswer', () => {
  it('accepts exact matches case-insensitively', () => {
    const result = checkAnswer('cpu', { answerText: 'CPU', altAnswers: [] })
    expect(result.correct).toBe(true)
    expect(result.matchType).toBe('exact')
    expect(result.canonical).toBe('CPU')
  })

  it('accepts answers with extra whitespace', () => {
    const result = checkAnswer('  CPU  ', { answerText: 'CPU', altAnswers: [] })
    expect(result.correct).toBe(true)
    expect(result.matchType).toBe('exact')
  })

  it('accepts alternative answers', () => {
    const result = checkAnswer('central processing unit', {
      answerText: 'CPU',
      altAnswers: ['central processing unit', 'processor'],
    })
    expect(result.correct).toBe(true)
    expect(result.matchType).toBe('alternative')
    expect(result.canonical).toBe('central processing unit')
  })

  it('accepts typos within the threshold when typo tolerance is on', () => {
    const result = checkAnswer('mitochondira', { answerText: 'mitochondria', altAnswers: [] })
    expect(result.correct).toBe(true)
    expect(result.matchType).toBe('typo')
    expect(result.canonical).toBe('mitochondria')
  })

  it('rejects typos when typo tolerance is off', () => {
    const result = checkAnswer(
      'mitochondira',
      { answerText: 'mitochondria', altAnswers: [] },
      { typoTolerance: false },
    )
    expect(result.correct).toBe(false)
    expect(result.matchType).toBe('wrong')
  })

  it('rejects typos on short answers (zero threshold)', () => {
    const result = checkAnswer('cat', { answerText: 'CPU', altAnswers: [] })
    expect(result.correct).toBe(false)
  })

  it('rejects completely wrong answers', () => {
    const result = checkAnswer('GPU', { answerText: 'CPU', altAnswers: [] })
    expect(result.correct).toBe(false)
    expect(result.matchType).toBe('wrong')
  })

  it('rejects empty input', () => {
    const result = checkAnswer('', { answerText: 'CPU', altAnswers: [] })
    expect(result.correct).toBe(false)
  })

  it('returns the primary answer as canonical even for typos on alternatives', () => {
    const result = checkAnswer('mitochondira', {
      answerText: 'organelle',
      altAnswers: ['mitochondria'],
    })
    expect(result.correct).toBe(true)
    expect(result.matchType).toBe('typo')
    expect(result.canonical).toBe('organelle')
  })

  it('prefers alternative match over typo match', () => {
    // If input exactly matches an alternative, report it as 'alternative' not 'typo'
    const result = checkAnswer('CPU', {
      answerText: 'central processing unit',
      altAnswers: ['CPU', 'processor'],
    })
    expect(result.matchType).toBe('alternative')
    expect(result.canonical).toBe('CPU')
  })
})

describe('checkAnswers', () => {
  it('checks multiple blanks independently', () => {
    const answers = [
      { answerText: 'CPU', altAnswers: [] },
      { answerText: 'RAM', altAnswers: [] },
    ]
    const results = checkAnswers(['cpu', 'ram'], answers)

    expect(results[0]?.correct).toBe(true)
    expect(results[1]?.correct).toBe(true)
  })

  it('treats missing input as empty', () => {
    const answers = [{ answerText: 'CPU', altAnswers: [] }]
    const results = checkAnswers([], answers)

    expect(results[0]?.correct).toBe(false)
  })
})

describe('gradeCard', () => {
  it('grades all correct as good', () => {
    expect(gradeCard([{ correct: true }, { correct: true }])).toBe('good')
  })

  it('grades none correct as again', () => {
    expect(gradeCard([{ correct: false }, { correct: false }])).toBe('again')
  })

  it('grades some correct as hard', () => {
    expect(gradeCard([{ correct: true }, { correct: false }])).toBe('hard')
  })

  it('grades an empty card as again', () => {
    expect(gradeCard([])).toBe('again')
  })
})

describe('isCardCorrect', () => {
  it('is true only when every blank is correct', () => {
    expect(isCardCorrect([{ correct: true }, { correct: true }])).toBe(true)
    expect(isCardCorrect([{ correct: true }, { correct: false }])).toBe(false)
    expect(isCardCorrect([{ correct: false }])).toBe(false)
  })

  it('is false for a card with no blanks', () => {
    // `every` on an empty array is vacuously true, which would report a broken
    // card as a clean pass. The length guard is what stops that.
    expect(isCardCorrect([])).toBe(false)
  })
})

describe('describeMatch', () => {
  it('describes each match type', () => {
    expect(describeMatch('exact')).toContain('Correct')
    expect(describeMatch('alternative')).toContain('alternative')
    expect(describeMatch('typo')).toContain('spelling')
    expect(describeMatch('wrong')).toContain('Incorrect')
  })
})

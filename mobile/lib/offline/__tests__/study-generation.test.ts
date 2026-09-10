import { describe, expect, it } from 'vitest'
import { generateOfflineSession } from '../study-generation'
import type { StudyCard } from '@saulado/shared'

describe('Offline Study Generation Phase 5.5', () => {
  const mockCards: StudyCard[] = [
    {
      id: 'c1',
      studySetId: 's1',
      paragraph: 'This is a {{test}} cloze with {{multiple}} blanks.',
      answers: [
        {
          id: 'ans1',
          ordinal: 0,
          answerText: 'test',
          startOffset: 10,
          endOffset: 18,
          altAnswers: ['trial'],
        },
        {
          id: 'ans2',
          ordinal: 1,
          answerText: 'multiple',
          startOffset: 30,
          endOffset: 42,
          altAnswers: ['several'],
        },
      ],
      tags: ['offline-test'],
      createdAt: '2026-08-31',
      updatedAt: '2026-08-31',
    },
    {
      id: 'c2',
      studySetId: 's1',
      paragraph: 'Another card about {{algorithms}} and {{datastructures}}.',
      answers: [
        {
          id: 'ans3',
          ordinal: 0,
          answerText: 'algorithms',
          startOffset: 19,
          endOffset: 33,
          altAnswers: [],
        },
        {
          id: 'ans4',
          ordinal: 1,
          answerText: 'datastructures',
          startOffset: 38,
          endOffset: 56,
          altAnswers: [],
        },
      ],
      tags: ['compsci'],
      createdAt: '2026-08-31',
      updatedAt: '2026-08-31',
    },
  ]

  it('maps full StudyCards to local SessionCards reliably', () => {
    const session = generateOfflineSession('s1', 'sequential', mockCards)

    expect(session.id).toContain('offline-session-')
    expect(session.queue).toHaveLength(2)

    const card = session.queue[0]!
    expect(card.cardId).toBe('c1')
    expect(card.isNew).toBe(false)
    expect(card.blankCount).toBe(2)
    expect(card.tags).toEqual(['offline-test'])
    expect(card.segments).toBeDefined()
    expect(card.segments.length).toBeGreaterThan(0)
    expect(card.cardAnswers).toEqual([
      { answerText: 'test', altAnswers: ['trial'] },
      { answerText: 'multiple', altAnswers: ['several'] },
    ])
  })

  it('Test A & B — Multiple-choice card generates non-empty blankOptions containing the correct answer', () => {
    const session = generateOfflineSession('s1', 'sequential', mockCards)
    const card = session.queue[0]!

    expect(card.blankOptions).toBeDefined()
    expect(card.blankOptions).toHaveLength(2)

    // Blank 0: correct answer 'test' must be present in blankOptions[0]
    expect(card.blankOptions![0]).toBeDefined()
    expect(card.blankOptions![0]!.length).toBeGreaterThanOrEqual(1)
    expect(card.blankOptions![0]).toContain('test')

    // Blank 1: correct answer 'multiple' must be present in blankOptions[1]
    expect(card.blankOptions![1]).toBeDefined()
    expect(card.blankOptions![1]!.length).toBeGreaterThanOrEqual(1)
    expect(card.blankOptions![1]).toContain('multiple')
  })

  it('Test C & D — Distractors are generated per blank ordinal using set answers and context', () => {
    const session = generateOfflineSession('s1', 'sequential', mockCards)
    const card = session.queue[0]!

    const blank0Options = card.blankOptions![0]!
    const blank1Options = card.blankOptions![1]!

    // Blank 0 options should include 'test' and distractors from the set/context
    expect(blank0Options).toContain('test')
    // Blank 1 options should include 'multiple' and distractors
    expect(blank1Options).toContain('multiple')

    // Blank 0 and Blank 1 should have their own distinct option lists
    expect(blank0Options).not.toEqual(blank1Options)
  })

  it('Test E — Offline multiple-choice session matches online SessionCard contract', () => {
    const session = generateOfflineSession('s1', 'sequential', mockCards)
    const card = session.queue[0]!

    // Validate complete shape expected by mobile components
    expect(card).toHaveProperty('cardId')
    expect(card).toHaveProperty('studySetId')
    expect(card).toHaveProperty('segments')
    expect(card).toHaveProperty('blankCount')
    expect(card).toHaveProperty('blankOptions')
    expect(card).toHaveProperty('blankAnswers')
    expect(card).toHaveProperty('cardAnswers')
    expect(card).toHaveProperty('isNew')
    expect(card).toHaveProperty('isLeech')
  })

  it('Test F — Non-multiple-choice cards / flashcards continue to work unchanged', () => {
    const flashcard: StudyCard = {
      id: 'fc1',
      studySetId: 's1',
      paragraph: 'This is a pure flashcard.',
      answers: [],
      tags: ['flashcard'],
      createdAt: '2026-08-31',
      updatedAt: '2026-08-31',
    }

    const session = generateOfflineSession('s1', 'sequential', [flashcard])
    const card = session.queue[0]!

    expect(card.cardId).toBe('fc1')
    expect(card.blankCount).toBe(0)
    expect(card.blankAnswers).toBeUndefined()
    expect(card.blankOptions).toEqual([])
  })

  it('Test G — Supports shuffled, sequential, and spaced repetition modalities offline', () => {
    const cards: StudyCard[] = Array.from({ length: 15 }, (_, i) => ({
      id: `c_${i}`,
      studySetId: 's1',
      paragraph: `Card number ${i} with {{term${i}}}`,
      answers: [
        {
          id: `a_${i}`,
          ordinal: 0,
          answerText: `term${i}`,
          startOffset: 15,
          endOffset: 25,
          altAnswers: [],
        },
      ],
      tags: [],
      createdAt: `2026-08-${String(i + 1).padStart(2, '0')}`,
      updatedAt: `2026-08-${String(i + 1).padStart(2, '0')}`,
    }))

    // Sequential mode preserves initial order
    const seqSession = generateOfflineSession('s1', 'sequential', cards)
    expect(seqSession.mode).toBe('sequential')
    expect(seqSession.queue.map((c) => c.cardId)).toEqual(cards.map((c) => c.id))

    // Spaced mode offline
    const spacedSession = generateOfflineSession('s1', 'spaced', cards)
    expect(spacedSession.mode).toBe('spaced')
    expect(spacedSession.queue).toHaveLength(15)

    // Shuffled mode randomizes question order
    const shuffledSession = generateOfflineSession('s1', 'shuffled', cards)
    expect(shuffledSession.mode).toBe('shuffled')
    expect(shuffledSession.queue).toHaveLength(15)
    // The shuffled queue should contain all cards but not identical to sequential order
    const shuffledIds = shuffledSession.queue.map((c) => c.cardId)
    expect(new Set(shuffledIds)).toEqual(new Set(cards.map((c) => c.id)))
    // With 15 cards, probability of random permutation matching exact order is 1/15! (~0)
    expect(shuffledIds).not.toEqual(cards.map((c) => c.id))
  })
})

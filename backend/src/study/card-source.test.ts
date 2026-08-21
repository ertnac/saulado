import { describe, expect, it } from 'vitest'
import {
  SpacedRepetitionSource,
  SequentialSource,
  ShuffledSource,
  RetakeSource,
  verdictFor,
  type CandidateCard,
  type PoolCard,
} from './card-source.js'

/**
 * Queue composition, tested without a database.
 *
 * The whole reason `CardSource` takes rows rather than fetching them: these are
 * the rules that break subtly — a cap applied in the wrong order, a tie-break
 * that makes "resume" reorder the queue — and none of them need Postgres to
 * demonstrate.
 */

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`)

function due(cardId: string, dueAt: string, lapses = 0): CandidateCard {
  return { cardId, studySetId: 'set-1', dueAt: day(dueAt), lapses }
}

function fresh(cardId: string): CandidateCard {
  return { cardId, studySetId: 'set-1', dueAt: null, lapses: 0 }
}

const options = { newCardsPerDay: 10, dailyCap: 100, reviewsToday: 0 }

describe('SpacedRepetitionSource', () => {
  it('orders due cards oldest first', () => {
    const source = new SpacedRepetitionSource({
      ...options,
      due: [due('c', '2026-08-07'), due('a', '2026-08-01'), due('b', '2026-08-04')],
      fresh: [],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a due-date tie by lapses, most-forgotten first', () => {
    const source = new SpacedRepetitionSource({
      ...options,
      due: [due('calm', '2026-08-01', 0), due('hard', '2026-08-01', 6)],
      fresh: [],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['hard', 'calm'])
  })

  it('builds the same queue twice from the same rows', () => {
    // Resuming a session must not reorder cards under the user, which is what
    // the final tie-break on id buys.
    const rows = [due('z', '2026-08-01'), due('a', '2026-08-01'), due('m', '2026-08-01')]

    const first = new SpacedRepetitionSource({ ...options, due: rows, fresh: [] }).build()
    const second = new SpacedRepetitionSource({ ...options, due: [...rows].reverse(), fresh: [] })

    expect(second.build()).toEqual(first)
  })

  it('opens on a due card and interleaves one new card per four', () => {
    const source = new SpacedRepetitionSource({
      ...options,
      due: ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => due(id, '2026-08-01')),
      fresh: [fresh('n1')],
    })

    const order = source.build().map((slot) => slot.cardId)

    expect(order[0]).toBe('d1')
    expect(order).toEqual(['d1', 'd2', 'd3', 'd4', 'n1', 'd5'])
  })

  it('marks only the unseen cards as new', () => {
    const source = new SpacedRepetitionSource({
      ...options,
      due: [due('seen', '2026-08-01')],
      fresh: [fresh('unseen')],
    })

    const byId = new Map(source.build().map((slot) => [slot.cardId, slot.isNew]))

    expect(byId.get('seen')).toBe(false)
    expect(byId.get('unseen')).toBe(true)
  })

  it('caps new cards at newCardsPerDay', () => {
    const source = new SpacedRepetitionSource({
      ...options,
      newCardsPerDay: 2,
      due: [],
      fresh: [fresh('n1'), fresh('n2'), fresh('n3'), fresh('n4')],
    })

    expect(source.build()).toHaveLength(2)
  })

  it('serves an all-new queue when nothing is due', () => {
    // A first-ever session has no due cards at all. It must not come back empty.
    const source = new SpacedRepetitionSource({
      ...options,
      due: [],
      fresh: [fresh('n1'), fresh('n2')],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['n1', 'n2'])
  })

  it('spends the daily cap on due cards before new ones', () => {
    /**
     * The ordering that matters on a backlog day. Capping the *interleaved*
     * queue would cut whichever kind sorted last, so a user 300 cards behind
     * would silently stop being shown anything new.
     */
    const source = new SpacedRepetitionSource({
      ...options,
      dailyCap: 3,
      due: ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => due(id, '2026-08-01')),
      fresh: [fresh('n1')],
    })

    const order = source.build().map((slot) => slot.cardId)

    expect(order).toEqual(['d1', 'd2', 'd3'])
    expect(order).not.toContain('n1')
  })

  it('counts reviews already done today against the cap', () => {
    // Studying twice in one day must not hand out two full sessions.
    const source = new SpacedRepetitionSource({
      ...options,
      dailyCap: 10,
      reviewsToday: 8,
      due: Array.from({ length: 20 }, (_, i) =>
        due(`d${String(i).padStart(2, '0')}`, '2026-08-01'),
      ),
      fresh: [],
    })

    expect(source.build()).toHaveLength(2)
  })

  it('builds an empty queue when the cap is already spent', () => {
    const source = new SpacedRepetitionSource({
      ...options,
      dailyCap: 5,
      reviewsToday: 5,
      due: [due('d1', '2026-08-01')],
      fresh: [fresh('n1')],
    })

    expect(source.build()).toEqual([])
  })
})

describe('SpacedRepetitionSource cursor', () => {
  const source = (): SpacedRepetitionSource =>
    new SpacedRepetitionSource({
      ...options,
      due: [due('a', '2026-08-01'), due('b', '2026-08-02')],
      fresh: [],
    })

  it('serves cards in order then returns null', () => {
    const s = source()

    expect(s.next()?.cardId).toBe('a')
    expect(s.next()?.cardId).toBe('b')
    expect(s.next()).toBeNull()
  })

  it('drains size() while total() stays put', () => {
    const s = source()

    expect(s.size()).toBe(2)
    expect(s.total()).toBe(2)

    s.next()

    // `total` is the denominator of "3 / 12" — it must not shrink as the user
    // works through the session.
    expect(s.size()).toBe(1)
    expect(s.total()).toBe(2)
  })
})

describe('SpacedRepetitionSource.verdict', () => {
  it('re-queues a failed card once', () => {
    expect(SpacedRepetitionSource.verdict('again', 1).requeue).toBe(true)
  })

  it('stops re-queueing after the attempt cap', () => {
    // Otherwise a card the user simply does not know yet loops forever and the
    // session cannot end.
    expect(SpacedRepetitionSource.verdict('again', 2).requeue).toBe(false)
  })

  it('does not re-queue a partially correct card', () => {
    expect(SpacedRepetitionSource.verdict('hard', 1).requeue).toBe(false)
    expect(SpacedRepetitionSource.verdict('good', 1).requeue).toBe(false)
  })

  it('always reschedules, including on a failure', () => {
    // Withholding the schedule write on `again` would let a user farm failures
    // to keep a card out of tomorrow's queue.
    expect(SpacedRepetitionSource.verdict('again', 1).reschedule).toBe(true)
    expect(SpacedRepetitionSource.verdict('good', 1).reschedule).toBe(true)
  })

  it('agrees with the instance method', () => {
    const s = new SpacedRepetitionSource({ ...options, due: [], fresh: [] })

    expect(s.onGraded('any', 'again', 1)).toEqual(SpacedRepetitionSource.verdict('again', 1))
  })
})

describe('SequentialSource', () => {
  it('orders by creation date, oldest first', () => {
    const source = new SequentialSource({
      cards: [pool('c', '2026-03-01'), pool('a', '2026-01-01'), pool('b', '2026-02-01')],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a creation-date tie on card id', () => {
    // A bulk import shares created_at to the millisecond, so without this the
    // order is whatever Postgres returns and "resume" can reorder the queue.
    const source = new SequentialSource({
      cards: [pool('z', '2026-01-01'), pool('a', '2026-01-01'), pool('m', '2026-01-01')],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['a', 'm', 'z'])
  })

  it('marks every card as not new', () => {
    // isNew drives a UI badge that means "never studied". A sequential drill
    // over a whole set says nothing about whether a card has been seen.
    const source = new SequentialSource({ cards: [pool('a', '2026-01-01')] })

    expect(source.build()[0]?.isNew).toBe(false)
  })

  it('reports its kind and totals', () => {
    const source = new SequentialSource({
      cards: [pool('a', '2026-01-01'), pool('b', '2026-02-01')],
    })

    expect(source.kind).toBe('sequential')
    expect(source.total()).toBe(2)
    expect(source.size()).toBe(2)
    expect(source.next()?.cardId).toBe('a')
    expect(source.size()).toBe(1)
  })
})

describe('ShuffledSource', () => {
  it('returns every card exactly once', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => pool(id, '2026-01-01'))
    const source = new ShuffledSource({ cards, rng: () => 0.5 })

    expect(
      source
        .build()
        .map((slot) => slot.cardId)
        .sort(),
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('produces a pinned order for a pinned rng', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => pool(id, '2026-01-01'))
    const source = new ShuffledSource({ cards, rng: () => 0 })

    // Sorted by (createdAt, cardId) first, then rotated by the all-zero rng.
    expect(source.build().map((slot) => slot.cardId)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('numbers positions from zero regardless of order', () => {
    const cards = ['a', 'b', 'c'].map((id) => pool(id, '2026-01-01'))
    const source = new ShuffledSource({ cards, rng: () => 0 })

    expect(source.build().map((slot) => slot.position)).toEqual([0, 1, 2])
  })
})

describe('RetakeSource', () => {
  it('keeps the order it was handed', () => {
    // The rows come from the prior session already ordered by position; a
    // retake re-walks that pass rather than inventing a new order.
    const source = new RetakeSource({ cards: ['c', 'a', 'b'] })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['c', 'a', 'b'])
    expect(source.kind).toBe('retake')
  })
})

describe('verdictFor', () => {
  const base = {
    grade: 'good' as const,
    attempts: 1,
    hadEmptyBlank: false,
    isDue: true,
    correct: true,
  }

  it('records and reschedules in spaced mode', () => {
    expect(verdictFor('spaced', base)).toEqual({ requeue: false, reschedule: true, record: true })
  })

  it('requeues a wrong answer in spaced mode, as today', () => {
    expect(verdictFor('spaced', { ...base, grade: 'again', correct: false }).requeue).toBe(true)
  })

  it('reschedules a correct answer in sequential mode', () => {
    expect(verdictFor('sequential', base)).toEqual({
      requeue: false,
      reschedule: true,
      record: true,
    })
  })

  it('requeues a wrong answer in sequential mode', () => {
    expect(verdictFor('sequential', { ...base, grade: 'again', correct: false }).requeue).toBe(true)
  })

  it('does not requeue a blank, in either new mode', () => {
    // D8: a blank is held for the end-of-session retake prompt instead.
    for (const mode of ['sequential', 'shuffled'] as const) {
      const verdict = verdictFor(mode, {
        ...base,
        grade: 'again',
        correct: false,
        hadEmptyBlank: true,
      })

      expect(verdict.requeue).toBe(false)
    }
  })

  it('lets a blank beat a wrong answer on the requeue decision', () => {
    // A card can be both: two blanks filled wrong, a third left empty.
    const verdict = verdictFor('sequential', {
      ...base,
      grade: 'again',
      correct: false,
      hadEmptyBlank: true,
      attempts: 1,
    })

    expect(verdict.requeue).toBe(false)
  })

  it('reschedules a due card in shuffled mode whether right or wrong', () => {
    expect(verdictFor('shuffled', { ...base, isDue: true, correct: true }).reschedule).toBe(true)
    expect(
      verdictFor('shuffled', { ...base, isDue: true, correct: false, grade: 'again' }).reschedule,
    ).toBe(true)
  })

  it('never punishes a not-due card answered wrong in shuffled mode', () => {
    // D4: the card keeps its existing next_review rather than resetting to
    // tomorrow. Drilling ahead must not be able to damage the schedule.
    expect(
      verdictFor('shuffled', { ...base, isDue: false, correct: false, grade: 'again' }).reschedule,
    ).toBe(false)
  })

  it('still rewards a not-due card answered correctly in shuffled mode', () => {
    expect(verdictFor('shuffled', { ...base, isDue: false, correct: true }).reschedule).toBe(true)
  })

  it('records nothing at all in retake mode', () => {
    expect(verdictFor('retake', base)).toEqual({
      requeue: false,
      reschedule: false,
      record: false,
    })
  })

  it('records nothing in retake mode even for a wrong answer', () => {
    expect(
      verdictFor('retake', { ...base, grade: 'again', correct: false, hadEmptyBlank: true }),
    ).toEqual({ requeue: false, reschedule: false, record: false })
  })
})

function pool(cardId: string, createdAt: string): PoolCard {
  return { cardId, studySetId: 'set-1', createdAt: new Date(`${createdAt}T00:00:00.000Z`) }
}

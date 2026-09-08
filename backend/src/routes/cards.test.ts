import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

/**
 * Cards CRUD, server-side answer derivation, tag filtering and the tags
 * aggregation.
 *
 * The paragraph below is reused so offsets stay readable in the assertions:
 *
 *   "The CPU is the brain of the computer"
 *    0123456789...
 *
 * `[4, 7)` is "CPU" and `[15, 20)` is "brain", both verified by index rather than
 * asserted from a slice the test itself computed.
 */

const app = createApp()

const PARAGRAPH = 'The CPU is the brain of the computer'
const CPU = { startOffset: 4, endOffset: 7 }
const BRAIN = { startOffset: 15, endOffset: 20 }

afterAll(async () => {
  await cleanupTestUsers()
})

async function createSet(token: string, title = 'Computer Architecture'): Promise<string> {
  const res = await request(app)
    .post('/api/sets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title })

  expect(res.status).toBe(201)
  return (res.body as { set: { id: string } }).set.id
}

interface CardBody {
  id: string
  paragraph: string
  tags: string[]
  answers: { answerText: string; startOffset: number; ordinal: number; altAnswers: string[] }[]
}

async function createCard(
  token: string,
  setId: string,
  body: Record<string, unknown> = {},
): Promise<CardBody> {
  const res = await request(app)
    .post(`/api/sets/${setId}/cards`)
    .set('Authorization', `Bearer ${token}`)
    .send({ paragraph: PARAGRAPH, answers: [CPU], ...body })

  expect(res.status).toBe(201)
  return (res.body as { card: CardBody }).card
}

describe('POST /api/sets/:setId/cards', () => {
  it('derives answer text from the paragraph', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const card = await createCard(token, setId, { answers: [CPU, BRAIN] })

    expect(card.answers).toHaveLength(2)
    expect(card.answers.map((a) => a.answerText)).toEqual(['CPU', 'brain'])
  })

  /**
   * The core guarantee of plan §3.2: the client sends ranges, the server slices
   * the text. A client that also sends `answerText` must not be able to make the
   * stored answer disagree with the paragraph — otherwise the `validateAnswers`
   * corruption tripwire degenerates into comparing client data against itself.
   */
  it('ignores a client-supplied answerText', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const card = await createCard(token, setId, {
      answers: [{ ...CPU, answerText: 'anything at all' }],
    })

    expect(card.answers[0]?.answerText).toBe('CPU')
  })

  /**
   * `assignOrdinals` sorts by `startOffset`, so the first blank in the paragraph
   * is ordinal 0 regardless of the order the user highlighted things in.
   */
  it('numbers ordinals by position, not by submission order', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const card = await createCard(token, setId, { answers: [BRAIN, CPU] })

    expect(card.answers.map((a) => [a.ordinal, a.answerText])).toEqual([
      [0, 'CPU'],
      [1, 'brain'],
    ])
  })

  it('accepts a card with no blanks yet', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const card = await createCard(token, setId, { answers: [] })
    expect(card.answers).toEqual([])
  })

  it('keeps alternative answers', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const card = await createCard(token, setId, {
      answers: [{ ...CPU, altAnswers: ['processor', 'central processing unit'] }],
    })

    expect(card.answers[0]?.altAnswers).toEqual(['processor', 'central processing unit'])
  })

  it('rejects an offset past the end of the paragraph', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paragraph: PARAGRAPH,
        answers: [{ startOffset: 4, endOffset: 9_999 }],
      })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('rejects a zero-length range', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paragraph: PARAGRAPH,
        answers: [{ startOffset: 4, endOffset: 4 }],
      })

    expect(res.status).toBe(400)
  })

  it('rejects a whitespace-only range', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      // Offset 3 is the space between "The" and "CPU".
      .send({ paragraph: PARAGRAPH, answers: [{ startOffset: 3, endOffset: 4 }] })

    expect(res.status).toBe(400)
  })

  /** Overlaps only exist in combination, which is why `validateAnswers` re-checks the whole set. */
  it('rejects overlapping blanks', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paragraph: PARAGRAPH,
        answers: [
          { startOffset: 4, endOffset: 7 },
          { startOffset: 6, endOffset: 10 },
        ],
      })

    expect(res.status).toBe(400)
  })

  it('caps the number of blanks per card', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paragraph: PARAGRAPH,
        answers: Array.from({ length: 21 }, (_, index) => ({
          startOffset: index,
          endOffset: index + 1,
        })),
      })

    expect(res.status).toBe(400)
  })

  it('cannot add a card to another user’s set', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const setId = await createSet(owner.token)

    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ paragraph: PARAGRAPH, answers: [CPU] })

    expect(res.status).toBe(404)
  })
})

describe('GET /api/sets/:setId/cards', () => {
  /**
   * Ownership is checked before the list query rather than folded into it, so
   * "someone else's set" (404) stays distinguishable from "your set, no cards"
   * (an empty page).
   */
  it('returns an empty page for an owned set with no cards', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const res = await request(app)
      .get(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ items: [], nextCursor: null })
  })

  it('404s for another user’s set rather than an empty page', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const setId = await createSet(owner.token)

    const res = await request(app)
      .get(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${intruder.token}`)

    expect(res.status).toBe(404)
  })

  /** The list shape omits answers — study mode must not ship them to the browser early. */
  it('summarises cards with a blank count instead of the answers', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    await createCard(token, setId, { answers: [CPU, BRAIN] })

    const res = await request(app)
      .get(`/api/sets/${setId}/cards`)
      .set('Authorization', `Bearer ${token}`)

    const item = (res.body as { items: Record<string, unknown>[] }).items[0]
    expect(item).toMatchObject({ answerCount: 2 })
    expect(item).not.toHaveProperty('answers')
  })

  it('paginates without skipping or repeating', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)

    const created: string[] = []
    for (let index = 0; index < 7; index += 1) {
      // The paragraph carries the index now: it is the only thing distinguishing
      // one card from another, and the pagination assertions compare ids anyway.
      const card = await createCard(token, setId, {
        paragraph: `${PARAGRAPH} — card ${String(index)}`,
      })
      created.push(card.id)
    }

    const seen: string[] = []
    let cursor: string | null = null
    let guard = 0

    do {
      const base = `/api/sets/${setId}/cards?limit=3`
      const url = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      const page = res.body as { items: { id: string }[]; nextCursor: string | null }

      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor
      guard += 1
    } while (cursor && guard < 10)

    expect(new Set(seen).size).toBe(created.length)
    expect([...seen].sort()).toEqual([...created].sort())
  })
})

describe('GET /api/cards/:id', () => {
  it('returns the card with its answers in ordinal order', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    const created = await createCard(token, setId, { answers: [BRAIN, CPU] })

    const res = await request(app)
      .get(`/api/cards/${created.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const card = (res.body as { card: CardBody }).card
    expect(card.answers.map((a) => a.ordinal)).toEqual([0, 1])
  })

  it('404s for another user’s card', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const setId = await createSet(owner.token)
    const card = await createCard(owner.token, setId)

    const res = await request(app)
      .get(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)

    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/cards/:id', () => {
  it('moves the card to a different set without touching the answers', async () => {
    const { token } = await registerTestUser(app)
    const set1 = await createSet(token, 'Set 1')
    const set2 = await createSet(token, 'Set 2')
    const card = await createCard(token, set1, { answers: [CPU, BRAIN] })

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studySetId: set2 })

    expect(res.status).toBe(200)
    const updated = (res.body as { card: CardBody & { studySetId: string } }).card
    expect(updated.studySetId).toBe(set2)
    expect(updated.paragraph).toBe(PARAGRAPH)
    expect(updated.answers.map((a) => a.answerText)).toEqual(['CPU', 'brain'])
  })

  it('re-derives answers when the paragraph is rewritten', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    const card = await createCard(token, setId, { answers: [CPU] })

    const rewritten = 'A GPU renders the frames'

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paragraph: rewritten, answers: [{ startOffset: 2, endOffset: 5 }] })

    expect(res.status).toBe(200)
    const updated = (res.body as { card: CardBody }).card
    expect(updated.paragraph).toBe(rewritten)
    expect(updated.answers).toHaveLength(1)
    expect(updated.answers[0]?.answerText).toBe('GPU')
  })

  /**
   * A new paragraph invalidates every stored offset, so accepting one against the
   * old answers would persist exactly the corruption the offset model exists to
   * prevent.
   */
  it('rejects a paragraph sent without its blanks', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    const card = await createCard(token, setId)

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paragraph: 'Something else entirely' })

    expect(res.status).toBe(400)
  })

  it('rejects a stale offset against the new paragraph', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    const card = await createCard(token, setId)

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
      // "Short" is 5 code points; the old CPU range does not fit.
      .send({ paragraph: 'Short', answers: [CPU] })

    expect(res.status).toBe(400)
  })

  it('moves a card between the caller’s own sets', async () => {
    const { token } = await registerTestUser(app)
    const from = await createSet(token, 'From')
    const to = await createSet(token, 'To')
    const card = await createCard(token, from)

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studySetId: to })

    expect(res.status).toBe(200)
    expect((res.body as { card: { studySetId: string } }).card.studySetId).toBe(to)
  })

  /** Otherwise a card could be pushed into someone else's library. */
  it('cannot move a card into another user’s set', async () => {
    const owner = await registerTestUser(app, 'owner')
    const other = await registerTestUser(app, 'other')
    const mine = await createSet(owner.token, 'Mine')
    const theirs = await createSet(other.token, 'Theirs')
    const card = await createCard(owner.token, mine)

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ studySetId: theirs })

    expect(res.status).toBe(404)

    const after = await request(app)
      .get(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect((after.body as { card: { studySetId: string } }).card.studySetId).toBe(mine)
  })

  it('cannot patch another user’s card', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const setId = await createSet(owner.token)
    const card = await createCard(owner.token, setId)

    const res = await request(app)
      .patch(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ tags: ['hijacked'] })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/cards/:id', () => {
  it('deletes the card', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    const card = await createCard(token, setId)

    const res = await request(app)
      .delete(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(204)

    const after = await request(app)
      .get(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(after.status).toBe(404)
  })

  it('cannot delete another user’s card', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const setId = await createSet(owner.token)
    const card = await createCard(owner.token, setId)

    const res = await request(app)
      .delete(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/sets/:id cascade', () => {
  /** `onDelete: Cascade` is declared in the schema so a set can never leave orphaned cards. */
  it('takes the set’s cards with it', async () => {
    const { token } = await registerTestUser(app)
    const setId = await createSet(token)
    const card = await createCard(token, setId)

    await request(app).delete(`/api/sets/${setId}`).set('Authorization', `Bearer ${token}`)

    const res = await request(app)
      .get(`/api/cards/${card.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

describe('GET /api/tags', () => {
  it('returns an empty tags list', async () => {
    const { token } = await registerTestUser(app)
    const res = await request(app).get('/api/tags').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tags: [] })
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/tags')
    expect(res.status).toBe(401)
  })
})

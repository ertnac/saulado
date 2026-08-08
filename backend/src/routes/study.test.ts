import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

/**
 * Study session integration tests.
 *
 * Two things get the most attention here, because they are the two that would
 * be invisible if broken:
 *
 * 1. **No answer text reaches the client before submission.** A leak looks
 *    identical in the UI, so it has to be asserted against the response body.
 * 2. **Sessions are scoped to their owner.** Every route takes a session id from
 *    the URL, which is exactly the shape an IDOR takes.
 */

const app = createApp()

const PARAGRAPH = 'The CPU is the brain of the computer'
const CPU = { startOffset: 4, endOffset: 7 }
const BRAIN = { startOffset: 15, endOffset: 20 }

afterAll(async () => {
  await cleanupTestUsers()
})

interface SessionBody {
  id: string
  studySetId: string | null
  queue: {
    cardId: string
    title: string
    blankCount: number
    segments: { kind: string; text?: string; answerLength?: number }[]
  }[]
  progress: { answered: number; total: number; correct: number }
}

const auth = (token: string): string => `Bearer ${token}`

async function seedSet(
  token: string,
  cards: { title: string; answers: { startOffset: number; endOffset: number }[] }[],
): Promise<string> {
  const setRes = await request(app)
    .post('/api/sets')
    .set('Authorization', auth(token))
    .send({ title: 'Computer Architecture' })

  expect(setRes.status).toBe(201)
  const setId = (setRes.body as { set: { id: string } }).set.id

  for (const card of cards) {
    const res = await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', auth(token))
      .send({ title: card.title, paragraph: PARAGRAPH, answers: card.answers })

    expect(res.status).toBe(201)
  }

  return setId
}

async function startSession(token: string, studySetId?: string): Promise<SessionBody> {
  const res = await request(app)
    .post('/api/study/sessions')
    .set('Authorization', auth(token))
    .send(studySetId ? { studySetId } : {})

  expect(res.status).toBe(200)
  return (res.body as { session: SessionBody }).session
}

describe('POST /api/study/sessions', () => {
  it('builds a queue from the set', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [
      { title: 'Card one', answers: [CPU] },
      { title: 'Card two', answers: [CPU, BRAIN] },
    ])

    const session = await startSession(token, setId)

    expect(session.queue).toHaveLength(2)
    expect(session.studySetId).toBe(setId)
    expect(session.progress).toEqual({ answered: 0, total: 2, correct: 0 })
  })

  it('never sends answer text to the client', async () => {
    /**
     * The assertion this file exists for. Grading is server-side precisely so
     * the answer key stays there; a card carrying `answerText` would render
     * identically and leak every answer to anyone with devtools open.
     */
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Card one', answers: [CPU, BRAIN] }])

    const session = await startSession(token, setId)

    expect(JSON.stringify(session)).not.toContain('CPU')
    expect(JSON.stringify(session)).not.toContain('brain')

    const card = session.queue[0]
    expect(card?.blankCount).toBe(2)
    expect(card?.segments.some((segment) => segment.kind === 'blank')).toBe(true)
  })

  it('gives every blank on a card the same width by default', async () => {
    // Fixed blank width mode (plan §2.7): a 3-character slot beside a
    // 5-character one rules out "brain" before the user has thought about it.
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Card one', answers: [CPU, BRAIN] }])

    const session = await startSession(token, setId)
    const widths = session.queue[0]?.segments
      .filter((segment) => segment.kind === 'blank')
      .map((segment) => segment.answerLength)

    expect(widths).toHaveLength(2)
    expect(new Set(widths).size).toBe(1)
  })

  it('excludes a card that has no blanks', async () => {
    /**
     * Phase 3 allows saving a card before highlighting it. `gradeCard([])`
     * returns `again`, so an unhighlighted card in the queue is a failure loop
     * the user cannot escape by knowing the material.
     */
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [
      { title: 'Highlighted', answers: [CPU] },
      { title: 'Not yet highlighted', answers: [] },
    ])

    const session = await startSession(token, setId)

    expect(session.queue).toHaveLength(1)
    expect(session.queue[0]?.title).toBe('Highlighted')
  })

  it('returns the open session instead of starting a second', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Card one', answers: [CPU] }])

    const first = await startSession(token, setId)
    const second = await startSession(token, setId)

    expect(second.id).toBe(first.id)
  })

  it('404s for another user’s set', async () => {
    const owner = await registerTestUser(app, 'owner')
    const other = await registerTestUser(app, 'other')
    const setId = await seedSet(owner.token, [{ title: 'Card one', answers: [CPU] }])

    const res = await request(app)
      .post('/api/study/sessions')
      .set('Authorization', auth(other.token))
      .send({ studySetId: setId })

    expect(res.status).toBe(404)
  })

  it('requires authentication', async () => {
    const res = await request(app).post('/api/study/sessions').send({})
    expect(res.status).toBe(401)
  })
})

describe('archived sets', () => {
  /**
   * Archiving is the user saying "not now". If archived cards keep arriving in
   * the daily queue and keep inflating the dashboard count, archiving has done
   * nothing that the user could observe.
   */

  async function archive(token: string, setId: string): Promise<void> {
    const res = await request(app)
      .patch(`/api/sets/${setId}`)
      .set('Authorization', auth(token))
      .send({ archived: true })

    expect(res.status).toBe(200)
  }

  it('keeps an archived set out of an all-sets session', async () => {
    const { token } = await registerTestUser(app)
    const kept = await seedSet(token, [{ title: 'Still studying', answers: [CPU] }])
    const shelved = await seedSet(token, [{ title: 'Put away', answers: [CPU] }])
    await archive(token, shelved)

    const session = await startSession(token)

    expect(session.queue).toHaveLength(1)
    expect(session.queue[0]?.title).toBe('Still studying')
    expect(kept).toBeTruthy()
  })

  it('still studies an archived set when asked for it by id', async () => {
    // Mirrors the library, where an archived set is hidden from the list but
    // still opens. Asking for it by id is an explicit override, not an accident.
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Put away', answers: [CPU] }])
    await archive(token, setId)

    const session = await startSession(token, setId)

    expect(session.queue).toHaveLength(1)
    expect(session.queue[0]?.title).toBe('Put away')
  })

  it('leaves an archived set out of the due counts', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Put away', answers: [CPU, BRAIN] }])
    await archive(token, setId)

    const res = await request(app).get('/api/study/due').set('Authorization', auth(token))

    expect(res.status).toBe(200)
    const body = res.body as { counts: { studySetId: string }[]; totalDue: number }
    expect(body.counts.map((entry) => entry.studySetId)).not.toContain(setId)
  })
})

describe('GET /api/study/due', () => {
  /** The counts behind the library badges. Review-time behaviour is in `study.answers.test.ts`. */

  it('reports new cards separately from due ones', async () => {
    // A freshly built set has no schedule rows at all. Counting those as "due"
    // would make a 500-card import read as 500 overdue reviews on day one.
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Card one', answers: [CPU] }])

    const res = await request(app).get('/api/study/due').set('Authorization', auth(token))

    expect(res.status).toBe(200)
    const body = res.body as {
      counts: { studySetId: string; due: number; newCards: number }[]
      totalDue: number
      scheduledCards: number
    }
    const entry = body.counts.find((count) => count.studySetId === setId)
    expect(entry).toEqual({ studySetId: setId, due: 0, newCards: 1 })
    expect(body.totalDue).toBe(0)
    // Nothing studied yet. This is what lets the dashboard tell "never started"
    // from "caught up" — `counts` is empty for both once the queue is cleared.
    expect(body.scheduledCards).toBe(0)
  })

  it('does not count a card with no blanks', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ title: 'Not yet highlighted', answers: [] }])

    const res = await request(app).get('/api/study/due').set('Authorization', auth(token))

    const body = res.body as { counts: { studySetId: string }[] }
    expect(body.counts.map((entry) => entry.studySetId)).not.toContain(setId)
  })

  it('sees nothing belonging to another user', async () => {
    const owner = await registerTestUser(app, 'owner')
    const other = await registerTestUser(app, 'other')
    await seedSet(owner.token, [{ title: 'Card one', answers: [CPU] }])

    const res = await request(app).get('/api/study/due').set('Authorization', auth(other.token))

    expect(res.status).toBe(200)
    expect((res.body as { counts: unknown[] }).counts).toEqual([])
  })
})

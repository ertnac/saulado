import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

/**
 * Submitting answers, finishing a session, and the properties that hold across
 * a whole review: idempotency, server-side grading, and progress that only ever
 * moves forward.
 */

const app = createApp()

const PARAGRAPH = 'The CPU is the brain of the computer'
const CPU = { startOffset: 4, endOffset: 7 }
const BRAIN = { startOffset: 15, endOffset: 20 }

afterAll(async () => {
  await cleanupTestUsers()
})

const auth = (token: string): string => `Bearer ${token}`

interface AnswerBody {
  grade: string
  correct: boolean
  dueAt: string
  intervalDays: number
  requeued: boolean
  results: { ordinal: number; correct: boolean; matchType: string; canonical: string }[]
  progress: { answered: number; total: number; correct: number }
}

interface SessionBody {
  id: string
  queue: { cardId: string; title: string }[]
  progress: { answered: number; total: number; correct: number }
}

async function setup(
  answers: { startOffset: number; endOffset: number }[] = [CPU],
): Promise<{ token: string; session: SessionBody }> {
  const { token } = await registerTestUser(app)

  const setRes = await request(app)
    .post('/api/sets')
    .set('Authorization', auth(token))
    .send({ title: 'Computer Architecture' })

  const setId = (setRes.body as { set: { id: string } }).set.id

  await request(app)
    .post(`/api/sets/${setId}/cards`)
    .set('Authorization', auth(token))
    .send({ title: 'CPU basics', paragraph: PARAGRAPH, answers })

  const res = await request(app)
    .post('/api/study/sessions')
    .set('Authorization', auth(token))
    .send({ studySetId: setId })

  expect(res.status).toBe(200)
  return { token, session: (res.body as { session: SessionBody }).session }
}

let keyCounter = 0
const nextKey = (): string => `idem-key-${String(++keyCounter).padStart(6, '0')}`

async function answer(
  token: string,
  sessionId: string,
  cardId: string,
  blanks: { ordinal: number; submitted: string }[],
  extra: Record<string, unknown> = {},
): Promise<request.Response> {
  return request(app)
    .post(`/api/study/sessions/${sessionId}/answers`)
    .set('Authorization', auth(token))
    .send({ cardId, blanks, idempotencyKey: nextKey(), ...extra })
}

describe('POST /api/study/sessions/:id/answers', () => {
  it('grades a correct answer and schedules it forward', async () => {
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''

    const res = await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'CPU' }])

    expect(res.status).toBe(200)
    const body = res.body as AnswerBody
    expect(body.grade).toBe('good')
    expect(body.correct).toBe(true)
    expect(body.intervalDays).toBe(1)
    expect(body.requeued).toBe(false)
    expect(body.progress).toEqual({ answered: 1, total: 1, correct: 1 })
  })

  it('accepts a case-insensitive answer', async () => {
    const { token, session } = await setup()

    const res = await answer(token, session.id, session.queue[0]?.cardId ?? '', [
      { ordinal: 0, submitted: '  cpu  ' },
    ])

    expect((res.body as AnswerBody).correct).toBe(true)
  })

  it('re-queues a failed card rather than finishing it', async () => {
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''

    const res = await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'GPU' }])
    const body = res.body as AnswerBody

    expect(body.grade).toBe('again')
    expect(body.requeued).toBe(true)
    // The denominator does not grow and the numerator does not advance: a
    // re-queued card is one card seen twice, not two cards.
    expect(body.progress).toEqual({ answered: 0, total: 1, correct: 0 })
  })

  it('stops re-queueing after the second attempt', async () => {
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''

    await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'GPU' }])
    const res = await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'GPU' }])

    const body = res.body as AnswerBody
    expect(body.requeued).toBe(false)
    expect(body.progress.answered).toBe(1)
  })

  it('returns the canonical answer so the card can be revealed', async () => {
    const { token, session } = await setup()

    const res = await answer(token, session.id, session.queue[0]?.cardId ?? '', [
      { ordinal: 0, submitted: 'GPU' },
    ])

    expect((res.body as AnswerBody).results[0]?.canonical).toBe('CPU')
  })

  it('grades a reveal as again even with the right answer typed in', async () => {
    const { token, session } = await setup()

    const res = await answer(
      token,
      session.id,
      session.queue[0]?.cardId ?? '',
      [{ ordinal: 0, submitted: 'CPU' }],
      { revealed: true },
    )

    const body = res.body as AnswerBody
    expect(body.grade).toBe('again')
    expect(body.correct).toBe(false)
  })

  it('replays a repeated idempotency key without booking a second review', async () => {
    /**
     * A double-tap on a phone, or a retry after a flaky connection, must not
     * count as two recalls. The replay returns the first result verbatim.
     */
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''
    const key = nextKey()

    const send = (): Promise<request.Response> =>
      request(app)
        .post(`/api/study/sessions/${session.id}/answers`)
        .set('Authorization', auth(token))
        .send({ cardId, blanks: [{ ordinal: 0, submitted: 'CPU' }], idempotencyKey: key })

    const first = await send()
    const second = await send()

    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect((second.body as AnswerBody).progress.answered).toBe(1)
  })

  it('grades a multi-blank card hard when only some blanks are right', async () => {
    const { token, session } = await setup([CPU, BRAIN])

    const res = await answer(token, session.id, session.queue[0]?.cardId ?? '', [
      { ordinal: 0, submitted: 'CPU' },
      { ordinal: 1, submitted: 'heart' },
    ])

    const body = res.body as AnswerBody
    expect(body.grade).toBe('hard')
    expect(body.correct).toBe(false)
    expect(body.results.map((r) => r.correct)).toEqual([true, false])
  })

  it('ignores a grade the client tries to send', async () => {
    // Grading is server-side. A client that could name its own grade could mark
    // everything `easy` and push its whole deck a year out.
    const { token, session } = await setup()

    const res = await answer(
      token,
      session.id,
      session.queue[0]?.cardId ?? '',
      [{ ordinal: 0, submitted: 'GPU' }],
      { grade: 'easy' },
    )

    expect((res.body as AnswerBody).grade).toBe('again')
  })

  it('404s on another user’s session', async () => {
    const { session } = await setup()
    const other = await registerTestUser(app, 'other')

    const res = await answer(other.token, session.id, session.queue[0]?.cardId ?? '', [
      { ordinal: 0, submitted: 'CPU' },
    ])

    expect(res.status).toBe(404)
  })

  it('404s for a card that is not in the session', async () => {
    const { token, session } = await setup()

    const res = await answer(token, session.id, '00000000-0000-4000-8000-000000000000', [
      { ordinal: 0, submitted: 'CPU' },
    ])

    expect(res.status).toBe(404)
  })

  it('rejects a request with no idempotency key', async () => {
    const { token, session } = await setup()

    const res = await request(app)
      .post(`/api/study/sessions/${session.id}/answers`)
      .set('Authorization', auth(token))
      .send({ cardId: session.queue[0]?.cardId, blanks: [] })

    expect(res.status).toBe(400)
  })
})

describe('session lifecycle', () => {
  it('drops answered cards from the resumed queue', async () => {
    const { token, session } = await setup([CPU, BRAIN])
    const cardId = session.queue[0]?.cardId ?? ''

    await answer(token, session.id, cardId, [
      { ordinal: 0, submitted: 'CPU' },
      { ordinal: 1, submitted: 'brain' },
    ])

    const res = await request(app)
      .get(`/api/study/sessions/${session.id}`)
      .set('Authorization', auth(token))

    expect(res.status).toBe(200)
    const resumed = (res.body as { session: SessionBody }).session
    expect(resumed.queue).toHaveLength(0)
    expect(resumed.progress).toEqual({ answered: 1, total: 1, correct: 1 })
  })

  it('keeps a re-queued card in the resumed queue', async () => {
    // Interruption recovery (plan §4.2) has to survive a failed card too.
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''

    await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'GPU' }])

    const res = await request(app)
      .get(`/api/study/sessions/${session.id}`)
      .set('Authorization', auth(token))

    expect((res.body as { session: SessionBody }).session.queue).toHaveLength(1)
  })

  it('summarises a completed session', async () => {
    const { token, session } = await setup()

    await answer(token, session.id, session.queue[0]?.cardId ?? '', [
      { ordinal: 0, submitted: 'CPU' },
    ])

    const res = await request(app)
      .post(`/api/study/sessions/${session.id}/complete`)
      .set('Authorization', auth(token))

    expect(res.status).toBe(200)
    const summary = (res.body as { summary: Record<string, unknown> }).summary
    expect(summary.cardsSeen).toBe(1)
    expect(summary.correctCards).toBe(1)
    expect(summary.accuracy).toBe(1)
    expect(summary.toRevisit).toEqual([])
    expect(summary.reviewsToday).toBe(1)
  })

  it('lists a failed card under toRevisit', async () => {
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''

    await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'GPU' }])
    await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'GPU' }])

    const res = await request(app)
      .post(`/api/study/sessions/${session.id}/complete`)
      .set('Authorization', auth(token))

    const summary = res.body as { summary: { toRevisit: { title: string }[] } }
    expect(summary.summary.toRevisit).toHaveLength(1)
    expect(summary.summary.toRevisit[0]?.title).toBe('CPU basics')
  })

  it('completes twice without erroring', async () => {
    // The client calls this when the queue empties; a retry after a dropped
    // response must not turn a finished session into a 400.
    const { token, session } = await setup()

    const complete = (): Promise<request.Response> =>
      request(app)
        .post(`/api/study/sessions/${session.id}/complete`)
        .set('Authorization', auth(token))

    expect((await complete()).status).toBe(200)
    expect((await complete()).status).toBe(200)
  })

  it('rejects an answer submitted after completion', async () => {
    const { token, session } = await setup()
    const cardId = session.queue[0]?.cardId ?? ''

    await request(app)
      .post(`/api/study/sessions/${session.id}/complete`)
      .set('Authorization', auth(token))

    const res = await answer(token, session.id, cardId, [{ ordinal: 0, submitted: 'CPU' }])

    expect(res.status).toBe(400)
  })

  it('404s reading another user’s session', async () => {
    const { session } = await setup()
    const other = await registerTestUser(app, 'other')

    const res = await request(app)
      .get(`/api/study/sessions/${session.id}`)
      .set('Authorization', auth(other.token))

    expect(res.status).toBe(404)
  })
})

describe('GET /api/study/due', () => {
  it('counts new cards before anything has been studied', async () => {
    const { token, session } = await setup()

    const res = await request(app).get('/api/study/due').set('Authorization', auth(token))

    expect(res.status).toBe(200)
    const body = res.body as { counts: { newCards: number; due: number }[]; totalDue: number }
    expect(body.counts[0]?.newCards).toBe(1)
    // A new card is not a debt — it has never been due.
    expect(body.totalDue).toBe(0)
    expect(session.id).toBeTruthy()
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/study/due')
    expect(res.status).toBe(401)
  })
})

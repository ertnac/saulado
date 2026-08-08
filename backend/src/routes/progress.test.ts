import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import type { DashboardResponse, ProgressResponse } from '@saulado/shared'
import { createApp } from '../app.js'
import { prisma } from '../db/client.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

/**
 * Dashboard and progress integration tests (plan §5.1).
 *
 * The things most worth asserting here are the ones a screenshot would not
 * catch:
 *
 * 1. **A zero and an absence are different facts.** A brand-new user and a
 *    caught-up user produce almost identical payloads, and rendering one as the
 *    other is the bug §4.7 and §6.1 were both about.
 * 2. **The day series is never sparse.** A gap in the middle of a chart draws
 *    Monday next to Friday.
 * 3. **Everything is scoped to its owner.** These are aggregate reads, so a
 *    leak here is a leak of another user's whole study history at once.
 */

const app = createApp()

const PARAGRAPH = 'The CPU is the brain of the computer'
const CPU = { startOffset: 4, endOffset: 7 }

afterAll(async () => {
  await cleanupTestUsers()
})

const auth = (token: string): string => `Bearer ${token}`

async function seedSet(token: string, title = 'Computer Architecture'): Promise<string> {
  const setRes = await request(app)
    .post('/api/sets')
    .set('Authorization', auth(token))
    .send({ title })
  expect(setRes.status).toBe(201)
  const setId = (setRes.body as { set: { id: string } }).set.id

  const cardRes = await request(app)
    .post(`/api/sets/${setId}/cards`)
    .set('Authorization', auth(token))
    .send({ title: 'The CPU', paragraph: PARAGRAPH, answers: [CPU] })

  expect(cardRes.status).toBe(201)
  return setId
}

/**
 * Studies one card correctly, so there is a real review behind the stats.
 *
 * `studySetId` is optional but worth passing whenever the test has more than one
 * set: an unscoped session queues every due card across the library, and the
 * order among brand-new cards is not something a test should depend on. Without
 * it, "study the first set" is really "study whichever card the queue happened
 * to put first", which passes or fails for reasons the test never states.
 */
async function studyOneCard(token: string, studySetId?: string): Promise<void> {
  const startRes = await request(app)
    .post('/api/study/sessions')
    .set('Authorization', auth(token))
    .send(studySetId === undefined ? {} : { studySetId })

  expect(startRes.status).toBe(200)
  const session = (startRes.body as { session: { id: string; queue: { cardId: string }[] } })
    .session
  const cardId = session.queue[0]?.cardId
  expect(cardId).toBeDefined()

  const answerRes = await request(app)
    .post(`/api/study/sessions/${session.id}/answers`)
    .set('Authorization', auth(token))
    .send({
      cardId,
      blanks: [{ ordinal: 0, submitted: 'CPU' }],
      idempotencyKey: `test-${String(Date.now())}-${cardId ?? ''}`,
    })

  expect(answerRes.status).toBe(200)
}

async function getDashboard(token: string): Promise<DashboardResponse> {
  const res = await request(app).get('/api/dashboard').set('Authorization', auth(token))
  expect(res.status).toBe(200)
  return res.body as DashboardResponse
}

async function getProgress(token: string, range?: string): Promise<ProgressResponse> {
  const res = await request(app)
    .get(range === undefined ? '/api/progress' : `/api/progress?range=${range}`)
    .set('Authorization', auth(token))

  expect(res.status).toBe(200)
  return res.body as ProgressResponse
}

describe('GET /api/dashboard', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/dashboard')
    expect(res.status).toBe(401)
  })

  it('distinguishes a brand-new user from a caught-up one', async () => {
    // The §6.1 bug: both have totalDue 0 and an empty counts array, and only
    // `hasStudied` tells them apart. Showing a new user "every review is done"
    // congratulates them for work they have not begun.
    const fresh = await registerTestUser(app, 'dash-fresh')
    const body = await getDashboard(fresh.token)

    expect(body.hasStudied).toBe(false)
    expect(body.totalDue).toBe(0)
    expect(body.newCards).toBe(0)
    expect(body.streak.current).toBe(0)
    expect(body.recentSets).toEqual([])
  })

  it('counts new cards without folding them into the due total', async () => {
    // New work is not a debt: a freshly imported 500-card set must not render
    // as 500 overdue reviews on day one.
    const user = await registerTestUser(app, 'dash-new')
    await seedSet(user.token)

    const body = await getDashboard(user.token)
    expect(body.newCards).toBe(1)
    expect(body.totalDue).toBe(0)
    expect(body.hasStudied).toBe(false)
  })

  it('reports a streak of 1 and hasStudied after the first review', async () => {
    const user = await registerTestUser(app, 'dash-studied')
    await seedSet(user.token)
    await studyOneCard(user.token)

    const body = await getDashboard(user.token)
    expect(body.hasStudied).toBe(true)
    expect(body.streak.current).toBe(1)
    expect(body.streak.studiedToday).toBe(true)
    expect(body.today.reviews).toBe(1)
    expect(body.today.correct).toBe(1)
  })

  it('returns a dense 7-day sparkline ending today', async () => {
    const user = await registerTestUser(app, 'dash-spark')
    await seedSet(user.token)
    await studyOneCard(user.token)

    const body = await getDashboard(user.token)
    expect(body.sparkline).toHaveLength(7)

    // Dense and ascending — a chart fed sparse data misplaces every bar.
    const days = body.sparkline.map((entry) => entry.day)
    expect([...days].sort((a, b) => a.localeCompare(b))).toEqual(days)
    expect(body.sparkline.at(-1)?.reviews).toBe(1)
    expect(body.sparkline.slice(0, 6).every((entry) => entry.reviews === 0)).toBe(true)
  })

  it('carries the goal as the ring denominator', async () => {
    const user = await registerTestUser(app, 'dash-goal')
    const body = await getDashboard(user.token)

    // The default from the schema. The ring needs the *current* goal even when
    // the day has no row yet, or a new user's ring has no denominator.
    expect(body.today.goal).toBe(20)
    expect(body.today.goalMet).toBe(false)
  })

  it('lists recent sets with their due counts', async () => {
    const user = await registerTestUser(app, 'dash-recent')
    await seedSet(user.token, 'Set One')

    const body = await getDashboard(user.token)
    expect(body.recentSets).toHaveLength(1)
    expect(body.recentSets[0]?.title).toBe('Set One')
    expect(body.recentSets[0]?.cardCount).toBe(1)
    expect(body.recentSets[0]?.lastStudiedAt).toBeNull()
  })

  it('never shows one user another user’s data', async () => {
    const owner = await registerTestUser(app, 'dash-owner')
    const stranger = await registerTestUser(app, 'dash-stranger')

    await seedSet(owner.token)
    await studyOneCard(owner.token)

    const body = await getDashboard(stranger.token)
    expect(body.hasStudied).toBe(false)
    expect(body.newCards).toBe(0)
    expect(body.recentSets).toEqual([])
    expect(body.streak.current).toBe(0)
  })
})

describe('GET /api/progress', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/progress')
    expect(res.status).toBe(401)
  })

  it('defaults to 30 days', async () => {
    const user = await registerTestUser(app, 'prog-default')
    const body = await getProgress(user.token)

    expect(body.range).toBe('30d')
    expect(body.days).toHaveLength(30)
  })

  it.each([
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
    ['365d', 365],
  ])('returns exactly %s of dense days', async (range, length) => {
    const user = await registerTestUser(app, `prog-${range}`)
    const body = await getProgress(user.token, range)

    expect(body.range).toBe(range)
    expect(body.days).toHaveLength(length)
    // Inclusive of today at the far end — the off-by-one that would show an
    // eighth bar on a "last 7 days" chart.
    expect(body.days.at(-1)?.day).toBe(new Date().toISOString().slice(0, 10))
  })

  it('rejects a range outside the closed set', async () => {
    // Not merely invalid input: `?range=100000d` would be a cheap request that
    // scans the entire review log.
    const user = await registerTestUser(app, 'prog-bad')
    const res = await request(app)
      .get('/api/progress?range=99999d')
      .set('Authorization', auth(user.token))

    expect(res.status).toBe(400)
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR')
  })

  it('is all zeroes but never sparse for a user who has never studied', async () => {
    const user = await registerTestUser(app, 'prog-empty')
    const body = await getProgress(user.token, '7d')

    expect(body.days).toHaveLength(7)
    expect(body.days.every((day) => day.reviews === 0)).toBe(true)
    expect(body.totals).toEqual({ reviews: 0, correct: 0, activeDays: 0 })
    expect(body.perSet).toEqual([])
  })

  it('counts a review in the totals and the per-set breakdown', async () => {
    const user = await registerTestUser(app, 'prog-studied')
    await seedSet(user.token, 'Architecture')
    await studyOneCard(user.token)

    const body = await getProgress(user.token, '7d')

    expect(body.totals.reviews).toBe(1)
    expect(body.totals.correct).toBe(1)
    expect(body.totals.activeDays).toBe(1)

    expect(body.perSet).toHaveLength(1)
    expect(body.perSet[0]?.title).toBe('Architecture')
    expect(body.perSet[0]?.reviews).toBe(1)
    expect(body.perSet[0]?.correct).toBe(1)
    expect(body.perSet[0]?.cardsStudied).toBe(1)
    expect(body.perSet[0]?.cardCount).toBe(1)
  })

  it('keeps the day series and the per-set table agreeing on correctness', async () => {
    /*
      These come from two different tables — the series from the
      `user_daily_stats` rollup, the breakdown from the `reviews` log — so they
      can disagree if the "correct" predicate is defined differently in each.
      `hard` is the trap: some blanks right, which is a grade above `again` but
      is not a correct card.
    */
    const user = await registerTestUser(app, 'prog-agree')
    await seedSet(user.token)
    await studyOneCard(user.token)

    const body = await getProgress(user.token, '7d')
    const setTotal = body.perSet.reduce((sum, set) => sum + set.correct, 0)

    expect(setTotal).toBe(body.totals.correct)
  })

  it('omits sets with no activity in the window', async () => {
    // The table sits under charts scoped to the same window; a wall of zero
    // rows would read as failure rather than as sets left unopened.
    const user = await registerTestUser(app, 'prog-quiet')
    const studied = await seedSet(user.token, 'Studied')
    await seedSet(user.token, 'Untouched')
    await studyOneCard(user.token, studied)

    const body = await getProgress(user.token, '7d')
    expect(body.perSet.map((set) => set.title)).not.toContain('Untouched')
  })

  it('never shows one user another user’s history', async () => {
    const owner = await registerTestUser(app, 'prog-owner')
    const stranger = await registerTestUser(app, 'prog-stranger')

    await seedSet(owner.token)
    await studyOneCard(owner.token)

    const body = await getProgress(stranger.token, '7d')
    expect(body.totals.reviews).toBe(0)
    expect(body.perSet).toEqual([])
  })
})

describe('the rollup and the log agree', () => {
  it('writes a daily stats row matching the reviews behind it', async () => {
    // The invariant the backfill script exists to restore. Asserted directly
    // because every chart on the progress page trusts it.
    const user = await registerTestUser(app, 'rollup')
    await seedSet(user.token)
    await studyOneCard(user.token)

    const [rows, reviews] = await Promise.all([
      prisma.userDailyStats.findMany({ where: { userId: user.userId } }),
      prisma.review.count({ where: { userId: user.userId } }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.reviewsCount).toBe(reviews)
  })
})

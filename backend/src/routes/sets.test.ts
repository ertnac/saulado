import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

/**
 * Sets CRUD, ownership isolation and cursor pagination.
 *
 * Cards, tags and answer derivation are in `cards.test.ts` — the interesting
 * assertions there all need a set to hang off, so splitting on that boundary
 * keeps each file's setup short.
 *
 * Rate limiting is off (`skip: () => env.isTest`), so the loops below that create
 * a dozen sets in a row do not throttle.
 */

const app = createApp()

afterAll(async () => {
  await cleanupTestUsers()
})

/** Authenticated POST /api/sets, returning the created set. */
async function createSet(
  token: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; title: string; updatedAt: string }> {
  const res = await request(app)
    .post('/api/sets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Neuroanatomy', ...body })

  expect(res.status).toBe(201)
  return (res.body as { set: { id: string; title: string; updatedAt: string } }).set
}

describe('POST /api/sets', () => {
  it('creates a set with defaults applied', async () => {
    const { token } = await registerTestUser(app)

    const res = await request(app)
      .post('/api/sets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '  Cell Biology  ' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      set: {
        title: 'Cell Biology',
        color: 'slate',
        archivedAt: null,
        cardCount: 0,
      },
    })
  })

  it('accepts a colour', async () => {
    const { token } = await registerTestUser(app)
    const set = await createSet(token, { color: 'violet' })

    expect(set).toMatchObject({ color: 'violet' })
  })

  it('rejects an empty title', async () => {
    const { token } = await registerTestUser(app)

    const res = await request(app)
      .post('/api/sets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('rejects a colour outside the closed list', async () => {
    const { token } = await registerTestUser(app)

    const res = await request(app)
      .post('/api/sets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Anatomy', color: '#ff00ff' })

    expect(res.status).toBe(400)
  })

  it('requires authentication', async () => {
    const res = await request(app).post('/api/sets').send({ title: 'Anatomy' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/sets/:id', () => {
  it('returns the caller’s own set', async () => {
    const { token } = await registerTestUser(app)
    const set = await createSet(token)

    const res = await request(app)
      .get(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ set: { id: set.id } })
  })

  /**
   * 404, not 403 (plan §3.1). A 403 would confirm the id is real, which turns id
   * enumeration into a membership oracle: "this set exists and is not yours" is
   * information the requester has no right to.
   */
  it('returns 404 — not 403 — for another user’s set', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const set = await createSet(owner.token)

    const res = await request(app)
      .get(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })
})

describe('PATCH /api/sets/:id', () => {
  it('updates individual fields', async () => {
    const { token } = await registerTestUser(app)
    const set = await createSet(token)

    const res = await request(app)
      .patch(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed', color: 'teal' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      // Untouched fields survive a partial update.
      set: { title: 'Renamed', color: 'teal' },
    })
  })

  it('archives and restores', async () => {
    const { token } = await registerTestUser(app)
    const set = await createSet(token)

    const archived = await request(app)
      .patch(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ archived: true })

    expect(archived.status).toBe(200)
    expect((archived.body as { set: { archivedAt: string | null } }).set.archivedAt).toEqual(
      expect.any(String),
    )

    const restored = await request(app)
      .patch(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ archived: false })

    expect((restored.body as { set: { archivedAt: string | null } }).set.archivedAt).toBeNull()
  })

  it('rejects an empty patch body', async () => {
    const { token } = await registerTestUser(app)
    const set = await createSet(token)

    const res = await request(app)
      .patch(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('cannot patch another user’s set', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const set = await createSet(owner.token, { title: 'Original' })

    const res = await request(app)
      .patch(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ title: 'Hijacked' })

    expect(res.status).toBe(404)

    // And the write did not land.
    const after = await request(app)
      .get(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect((after.body as { set: { title: string } }).set.title).toBe('Original')
  })
})

describe('DELETE /api/sets/:id', () => {
  it('deletes and is then gone', async () => {
    const { token } = await registerTestUser(app)
    const set = await createSet(token)

    const res = await request(app)
      .delete(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(204)

    const after = await request(app)
      .get(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(after.status).toBe(404)
  })

  it('cannot delete another user’s set', async () => {
    const owner = await registerTestUser(app, 'owner')
    const intruder = await registerTestUser(app, 'intruder')
    const set = await createSet(owner.token)

    const res = await request(app)
      .delete(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)

    expect(res.status).toBe(404)

    const after = await request(app)
      .get(`/api/sets/${set.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(after.status).toBe(200)
  })
})

describe('GET /api/sets', () => {
  it('lists only the caller’s sets', async () => {
    const owner = await registerTestUser(app, 'owner')
    const other = await registerTestUser(app, 'other')

    await createSet(owner.token, { title: 'Mine' })
    await createSet(other.token, { title: 'Theirs' })

    const res = await request(app).get('/api/sets').set('Authorization', `Bearer ${owner.token}`)

    expect(res.status).toBe(200)
    const items = (res.body as { items: { title: string }[] }).items
    expect(items.map((item) => item.title)).toEqual(['Mine'])
  })

  it('excludes archived sets unless asked for them', async () => {
    const { token } = await registerTestUser(app)
    const active = await createSet(token, { title: 'Active' })
    const shelved = await createSet(token, { title: 'Shelved' })

    await request(app)
      .patch(`/api/sets/${shelved.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ archived: true })

    const activeList = await request(app).get('/api/sets').set('Authorization', `Bearer ${token}`)
    expect((activeList.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([
      active.id,
    ])

    const archivedList = await request(app)
      .get('/api/sets?archived=true')
      .set('Authorization', `Bearer ${token}`)
    expect((archivedList.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([
      shelved.id,
    ])
  })

  /**
   * Walks every page and asserts each set appears exactly once. This is the
   * property keyset pagination buys over `OFFSET`: with an offset cursor, a row
   * inserted or removed above the window between requests shifts everything after
   * it, so items get skipped or repeated.
   */
  it('paginates without skipping or repeating', async () => {
    const { token } = await registerTestUser(app)

    const created: string[] = []
    for (let index = 0; index < 7; index += 1) {
      const set = await createSet(token, { title: `Set ${String(index)}` })
      created.push(set.id)
    }

    const seen: string[] = []
    let cursor: string | null = null
    let guard = 0

    do {
      const url = cursor
        ? `/api/sets?limit=3&cursor=${encodeURIComponent(cursor)}`
        : '/api/sets?limit=3'
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      const page = res.body as { items: { id: string }[]; nextCursor: string | null }

      expect(page.items.length).toBeLessThanOrEqual(3)
      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor
      guard += 1
    } while (cursor && guard < 10)

    expect(seen).toHaveLength(created.length)
    expect(new Set(seen).size).toBe(created.length)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  it('caps the page size', async () => {
    const { token } = await registerTestUser(app)

    const res = await request(app)
      .get('/api/sets?limit=100000')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
  })

  it('rejects a malformed cursor with 400, not 500', async () => {
    const { token } = await registerTestUser(app)

    const res = await request(app)
      .get('/api/sets?cursor=bm90LWpzb24')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })
})

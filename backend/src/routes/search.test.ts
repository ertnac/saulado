import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import type { SearchResponse } from '@saulado/shared'
import { SEARCH_OFFSET_MAX, SNIPPET_START, SNIPPET_STOP } from '@saulado/shared'
import { createApp } from '../app.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

/**
 * Search integration tests (plan §6.1).
 *
 * These run against real Postgres full-text search, which is the point: the
 * generated `tsvector` column, `websearch_to_tsquery`, `ts_rank` and
 * `ts_headline` are all database behaviour, and a mock would assert only that
 * this file agrees with itself.
 *
 * The assertions worth having here are the ones that fail *silently* in a
 * screenshot:
 *
 * 1. **Ownership.** Search is the easiest place in the app to leak another
 *    user's rows, because the filter is the query rather than an id.
 * 2. **A stray keystroke is not a 500.** Users type `foo &` and `"` mid-thought.
 * 3. **Nothing HTML-shaped crosses the wire.** `ts_headline` wraps matches in
 *    delimiters that the server parses into segments; if raw markup or a bare
 *    delimiter reaches the client, the XSS defence has already failed.
 * 4. **Never-studied cards still appear.** The schedule join is a LEFT JOIN with
 *    the user predicate in its ON clause; moving it to WHERE makes it an inner
 *    join and hides every new card, which reads as an empty library.
 */

const app = createApp()

const auth = (token: string): string => `Bearer ${token}`

const CPU_PARAGRAPH = 'The CPU is the brain of the computer and executes instructions'
const CACHE_PARAGRAPH = 'Cache sits between the CPU and main memory'
const MITOCHONDRIA_PARAGRAPH = 'The mitochondria is the powerhouse of the cell'

afterAll(async () => {
  await cleanupTestUsers()
})

async function createSet(token: string, title: string): Promise<string> {
  const res = await request(app).post('/api/sets').set('Authorization', auth(token)).send({ title })

  expect(res.status).toBe(201)
  return (res.body as { set: { id: string } }).set.id
}

async function createCard(
  token: string,
  setId: string,
  card: { paragraph: string; tags?: string[] },
): Promise<string> {
  const res = await request(app)
    .post(`/api/sets/${setId}/cards`)
    .set('Authorization', auth(token))
    .send({
      paragraph: card.paragraph,
      // One blank on the first word, so the card is valid without the test
      // having to compute offsets it does not care about.
      answers: [{ startOffset: 0, endOffset: 3 }],
      tags: card.tags ?? [],
    })

  expect(res.status).toBe(201)
  return (res.body as { card: { id: string } }).card.id
}

async function search(token: string, query: string): Promise<SearchResponse> {
  const res = await request(app).get(`/api/search${query}`).set('Authorization', auth(token))

  expect(res.status).toBe(200)
  return res.body as SearchResponse
}

/** A user with two sets and three cards, which most cases below can share. */
async function seedLibrary(label: string): Promise<{
  token: string
  hardware: string
  biology: string
}> {
  const user = await registerTestUser(app, label)
  const hardware = await createSet(user.token, 'Hardware')
  const biology = await createSet(user.token, 'Biology')

  await createCard(user.token, hardware, {
    paragraph: CPU_PARAGRAPH,
    tags: ['exam', 'core'],
  })
  await createCard(user.token, hardware, {
    paragraph: CACHE_PARAGRAPH,
    tags: ['core'],
  })
  await createCard(user.token, biology, {
    paragraph: MITOCHONDRIA_PARAGRAPH,
    tags: ['exam'],
  })

  return { token: user.token, hardware, biology }
}

describe('GET /api/search', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/search?q=cpu')
    expect(res.status).toBe(401)
  })

  it('finds a card by a word in its paragraph', async () => {
    const { token } = await seedLibrary('search-basic')
    const body = await search(token, '?q=mitochondria')

    expect(body.total).toBe(1)
    expect(body.items[0]?.label).toBe(MITOCHONDRIA_PARAGRAPH)
    expect(body.query).toBe('mitochondria')
  })

  it('finds a card by a word unique to one paragraph', async () => {
    /*
      This used to search a card's title. Titles are gone, and with them the
      second field the vector indexed — so the guard that matters now is that a
      word appearing in exactly one paragraph returns exactly that card.
    */
    const { token } = await seedLibrary('search-unique')
    const body = await search(token, '?q=cache')

    expect(body.items.map((item) => item.label)).toEqual([CACHE_PARAGRAPH])
  })

  it('stems, so a search for a plural finds the singular', async () => {
    // The whole reason for `to_tsvector('english', ...)` over a LIKE scan.
    const { token } = await seedLibrary('search-stem')
    const body = await search(token, '?q=instruction')

    expect(body.items.map((item) => item.label)).toContain(CPU_PARAGRAPH)
  })

  it('still ranks on the paragraph after the vector was rebuilt', async () => {
    /*
      The regression guard for the migration that dropped `title` from the
      generated column. The old test asserted a title hit outranked a body hit,
      which is no longer a thing that can happen — there is one weighted term
      left.

      What is still assertable is that `ts_rank` reads the paragraph at all: a
      card naming the term twice must outrank one naming it once. If the rebuilt
      expression had lost `setweight`, or indexed the wrong column, relevance
      order here would be arbitrary rather than wrong — so this asserts the
      order, not merely that both cards came back.

      Seeded separately rather than from `seedLibrary`, whose card counts several
      cases below assert on exactly.
    */
    const user = await registerTestUser(app, 'search-rank')
    const set = await createSet(user.token, 'Hardware')

    await createCard(user.token, set, { paragraph: 'Cache sits next to main memory' })
    await createCard(user.token, set, {
      paragraph: 'Cache misses are expensive, so cache locality is what tuning targets',
    })

    const body = await search(user.token, '?q=cache&sort=relevance')

    expect(body.items).toHaveLength(2)
    expect(body.items[0]?.label).toContain('cache locality')
  })

  it('sorts by recency when asked, ignoring rank', async () => {
    const { token } = await seedLibrary('search-recent')
    const body = await search(token, '?q=cpu&sort=recent')

    expect(body.sort).toBe('recent')
    // Newest first: the cache card was created after the CPU card.
    expect(body.items[0]?.label).toBe(CACHE_PARAGRAPH)
  })

  it('returns snippet segments with the match flagged, not HTML', async () => {
    const { token } = await seedLibrary('search-snippet')
    const body = await search(token, '?q=powerhouse')
    const snippet = body.items[0]?.snippet ?? []

    expect(snippet.length).toBeGreaterThan(0)
    expect(snippet.some((segment) => segment.match)).toBe(true)
    expect(snippet.find((segment) => segment.match)?.text.toLowerCase()).toContain('powerhouse')

    // No delimiter and no tag survives into the payload. `ts_headline` can be
    // asked for `<b>` directly; the private-use delimiters exist precisely so
    // that the client is never handed a string it would be tempted to inject.
    const joined = snippet.map((segment) => segment.text).join('')
    expect(joined).not.toContain(SNIPPET_START)
    expect(joined).not.toContain(SNIPPET_STOP)
    expect(joined).not.toContain('<b>')
  })

  it('emits no markup for a paragraph containing a script tag', async () => {
    /*
      Two independent defences, and this asserts both.

      `ts_headline` reassembles the headline from parser tokens, and Postgres'
      default parser classifies `<script>` as a `tag` token, which is not emitted
      — so markup is gone before the string ever leaves the database. Then the
      delimiters are parsed into segments here, so what crosses the wire is
      `{text, match}` pairs rather than a string a client could inject.

      The side effect is a real fidelity limit worth knowing about: a paragraph
      about HTML loses its angle brackets *in the snippet only*. The stored
      paragraph is untouched, and the card view renders that, not this.
    */
    const user = await registerTestUser(app, 'search-xss')
    const setId = await createSet(user.token, 'Injection')
    await createCard(user.token, setId, {
      paragraph: 'The <script>alert(1)</script> tag is inert here',
    })

    const body = await search(user.token, '?q=inert')
    const joined = (body.items[0]?.snippet ?? []).map((segment) => segment.text).join('')

    expect(joined).not.toContain('<script>')
    expect(joined).not.toContain('</script>')
    expect(joined).not.toContain('<')
    // The prose around the tag is still there — the snippet is not empty.
    expect(joined).toContain('inert here')
  })

  it('preserves a paragraph verbatim in a browse snippet', async () => {
    // The contrast with the case above. Browse never calls `ts_headline` — the
    // snippet is sliced in JS from the stored paragraph — so the text is exact.
    // Still safe: it is a text segment, and no consumer is handed HTML.
    const user = await registerTestUser(app, 'browse-xss')
    const setId = await createSet(user.token, 'Injection')
    await createCard(user.token, setId, {
      paragraph: 'The <script>alert(1)</script> tag is inert here',
    })

    const body = await search(user.token, '')
    const snippet = body.items[0]?.snippet ?? []

    expect(snippet).toEqual([
      { text: 'The <script>alert(1)</script> tag is inert here', match: false },
    ])
  })

  it('browses the whole library when there is no query text', async () => {
    const { token } = await seedLibrary('search-browse')
    const body = await search(token, '')

    expect(body.total).toBe(3)
    expect(body.query).toBe('')
    // Nothing to rank against, so relevance is meaningless and recency is used.
    expect(body.sort).toBe('recent')
    // Browse snippets are the opening of the paragraph, unmatched.
    expect(body.items[0]?.snippet.every((segment) => !segment.match)).toBe(true)
  })

  it('treats a one-character query as a browse rather than a 400', async () => {
    // The palette fires on every debounced keystroke, so the first character of
    // a real search arrives on its own. A validation error mid-typing is worse
    // than one frame of unfiltered results.
    const { token } = await seedLibrary('search-short')
    const body = await search(token, '?q=c')

    expect(body.query).toBe('')
    expect(body.total).toBe(3)
  })

  it('survives punctuation that would break to_tsquery', async () => {
    /*
      `to_tsquery('english', 'foo &')` raises a syntax error, which would turn a
      half-typed query into a 500. `websearch_to_tsquery` never throws — it is
      the only one of the four parsers safe to hand raw user input.
    */
    const { token } = await seedLibrary('search-punct')

    for (const q of ['foo &', 'a | b', '"unclosed', ')(', '!', 'cpu OR', '<>']) {
      const res = await request(app)
        .get(`/api/search?q=${encodeURIComponent(q)}`)
        .set('Authorization', auth(token))

      expect(res.status, `query ${q} should not error`).toBe(200)
    }
  })

  it('narrows to one set', async () => {
    const { token, biology } = await seedLibrary('search-set')
    const body = await search(token, `?setId=${biology}`)

    expect(body.items.map((item) => item.label)).toEqual([MITOCHONDRIA_PARAGRAPH])
  })

  it('requires every tag, not any of them', async () => {
    /*
      `@>` ("contains all"), not `&&` ("overlaps any"). Chips are a narrowing:
      adding a second one must return a subset of what one returned, or the
      filter does the opposite of what the UI implies.
    */
    const { token } = await seedLibrary('search-tags')

    const one = await search(token, '?tags=core')
    const two = await search(token, '?tags=core&tags=exam')

    expect(one.total).toBe(2)
    expect(two.items.map((item) => item.label)).toEqual([CPU_PARAGRAPH])
  })

  it('includes cards that have never been studied', async () => {
    /*
      The regression guard for the LEFT JOIN. `card_schedules.user_id` belongs in
      the ON clause; in the WHERE it silently becomes an inner join and every
      never-studied card disappears — which for a new user is the entire library.
    */
    const { token } = await seedLibrary('search-unstudied')
    const body = await search(token, '?q=cpu')

    expect(body.total).toBeGreaterThan(0)
    expect(body.items.every((item) => item.dueState === 'new')).toBe(true)
    expect(body.items.every((item) => item.dueAt === null)).toBe(true)
  })

  it('filters to new cards by due state', async () => {
    const { token } = await seedLibrary('search-due')

    const isNew = await search(token, '?due=new')
    const due = await search(token, '?due=due')

    expect(isNew.total).toBe(3)
    // Nothing has been studied, so nothing has a due date yet.
    expect(due.total).toBe(0)
  })

  it('filters by creation date, inclusive of both bounds', async () => {
    const { token } = await seedLibrary('search-dates')
    const today = new Date().toISOString().slice(0, 10)

    const included = await search(token, `?createdFrom=${today}&createdTo=${today}`)
    expect(included.total).toBe(3)

    const excluded = await search(token, '?createdFrom=2000-01-01&createdTo=2000-01-02')
    expect(excluded.total).toBe(0)
  })

  it('rejects a date range that ends before it starts', async () => {
    // Zero results would make a UI bug look like an empty library.
    const { token } = await seedLibrary('search-badrange')
    const res = await request(app)
      .get('/api/search?createdFrom=2026-05-01&createdTo=2026-04-01')
      .set('Authorization', auth(token))

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('reports the total independently of the page size', async () => {
    // `COUNT(*) OVER ()` in the same scan. A total that equals the page length
    // would make "3 of 3" appear on page one of ten.
    const { token } = await seedLibrary('search-total')
    const body = await search(token, '?limit=1')

    expect(body.items).toHaveLength(1)
    expect(body.total).toBe(3)
    expect(body.limit).toBe(1)
  })

  it('pages without repeating or skipping a card', async () => {
    const { token } = await seedLibrary('search-page')

    const first = await search(token, '?limit=2&offset=0')
    const second = await search(token, '?limit=2&offset=2')

    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(1)
    expect(second.offset).toBe(2)

    const ids = [...first.items, ...second.items].map((item) => item.cardId)
    expect(new Set(ids).size).toBe(3)
  })

  it('rejects an offset past the cap', async () => {
    // Offset paging makes Postgres produce and discard every preceding row, so
    // an uncapped offset is a one-line request that ranks a whole library.
    const { token } = await seedLibrary('search-offsetcap')
    const res = await request(app)
      .get(`/api/search?offset=${String(SEARCH_OFFSET_MAX + 1)}`)
      .set('Authorization', auth(token))

    expect(res.status).toBe(400)
  })

  it('rejects a malformed set id rather than treating it as no filter', async () => {
    const { token } = await seedLibrary('search-badset')
    const res = await request(app)
      .get('/api/search?setId=not-a-uuid')
      .set('Authorization', auth(token))

    expect(res.status).toBe(400)
  })

  it('finds cards in archived sets, flagged as archived', async () => {
    // Archiving is "get this out of my way", not "delete it". A search that
    // cannot find a card the user knows they wrote is the worse failure.
    const user = await registerTestUser(app, 'search-archived')
    const setId = await createSet(user.token, 'Old term')
    await createCard(user.token, setId, {
      paragraph: 'The astrolabe measures the altitude of stars',
    })

    const archiveRes = await request(app)
      .patch(`/api/sets/${setId}`)
      .set('Authorization', auth(user.token))
      .send({ archived: true })
    expect(archiveRes.status).toBe(200)

    const body = await search(user.token, '?q=astrolabe')
    expect(body.total).toBe(1)
    expect(body.items[0]?.setArchived).toBe(true)
  })

  it('never returns another user’s cards', async () => {
    const { token: owner } = await seedLibrary('search-owner')
    const stranger = await registerTestUser(app, 'search-stranger')

    // The exact query that finds the owner's card, run as someone else.
    const found = await search(owner, '?q=mitochondria')
    expect(found.total).toBe(1)

    const body = await search(stranger.token, '?q=mitochondria')
    expect(body.total).toBe(0)
    expect(body.items).toEqual([])
  })

  it('does not leak another user’s cards through a browse', async () => {
    // The filter-only path is a separate SQL statement from the search path, so
    // the ownership predicate has to be proven twice.
    const { token: owner } = await seedLibrary('search-browse-owner')
    const stranger = await registerTestUser(app, 'search-browse-stranger')

    expect((await search(owner, '')).total).toBe(3)
    expect((await search(stranger.token, '')).total).toBe(0)
  })

  it('does not let a set id filter reach into another user’s set', async () => {
    // A set id is guessable in a way a query string is not, so the ownership
    // predicate has to hold even when the caller names the set directly.
    const { token: owner, biology } = await seedLibrary('search-crossset')
    const stranger = await registerTestUser(app, 'search-crossset-stranger')

    const body = await search(stranger.token, `?setId=${biology}`)
    expect(body.total).toBe(0)

    // Sanity: the id is real and does return a card to its owner.
    expect((await search(owner, `?setId=${biology}`)).total).toBe(1)
  })

  it('treats SQL as a search term, not as SQL', async () => {
    // Belt and braces over `Prisma.sql`, which sends every interpolation as a
    // bound parameter. If this ever stops being true, the users table is gone
    // and this assertion is the last thing that ran.
    const { token } = await seedLibrary('search-injection')
    const body = await search(token, `?q=${encodeURIComponent("'; DROP TABLE users; --")}`)

    expect(body.total).toBe(0)

    // The table is still there.
    expect((await search(token, '?q=cpu')).total).toBeGreaterThan(0)
  })
})

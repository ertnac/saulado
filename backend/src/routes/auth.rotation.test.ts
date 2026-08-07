import request from 'supertest'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { hashToken } from '../auth/tokens.js'
import { prisma } from '../db/client.js'
import {
  TEST_PASSWORD,
  asCookie,
  cleanupTestUsers,
  refreshCookie,
  testEmail,
} from '../test/helpers.js'

/**
 * Refresh rotation and theft detection.
 *
 * The most security-critical behaviour in Phase 2 and the least visible: every
 * failure mode here still looks like a working login. A broken rotation only
 * shows up as a session that dies, or one that outlives a leak.
 */

const app = createApp()

afterAll(async () => {
  await cleanupTestUsers()
})

async function register(): Promise<{ userId: string; refreshToken: string }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('rot'), password: TEST_PASSWORD })

  expect(res.status).toBe(201)
  const cookie = refreshCookie(res)
  if (!cookie) throw new Error('register did not set a refresh cookie')

  return { userId: (res.body as { user: { id: string } }).user.id, refreshToken: cookie }
}

/** Presents a refresh token the way a browser would. */
function refresh(token: string): request.Test {
  return request(app).post('/api/auth/refresh').set('Cookie', asCookie(token))
}

describe('POST /api/auth/refresh', () => {
  it('restores a session from the cookie alone', async () => {
    const { refreshToken } = await register()

    // The done-when criterion: no access token in hand, only the cookie — this
    // is the reopened tab.
    const res = await refresh(refreshToken)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      user: { id: expect.any(String) as unknown },
      accessToken: expect.any(String) as unknown,
    })
  })

  it('rotates the token on every use', async () => {
    const { refreshToken } = await register()

    const res = await refresh(refreshToken)
    const rotated = refreshCookie(res)

    expect(rotated).toBeTruthy()
    expect(rotated).not.toBe(refreshToken)
  })

  it('keeps the new token in the same family and retires the old one', async () => {
    const { refreshToken } = await register()

    const rotated = refreshCookie(await refresh(refreshToken))
    if (!rotated) throw new Error('refresh did not rotate')

    const [oldRow, newRow] = await Promise.all([
      prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } }),
      prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rotated) } }),
    ])

    expect(oldRow?.revokedAt).toBeInstanceOf(Date)
    expect(newRow?.revokedAt).toBeNull()
    // Same chain — this is what makes reuse detectable at all.
    expect(newRow?.familyId).toBe(oldRow?.familyId)
  })

  it('stores only the digest, never the token', async () => {
    const { refreshToken } = await register()

    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    })

    expect(row).not.toBeNull()
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain(refreshToken)
  })

  it('survives a long chain of rotations', async () => {
    const { refreshToken } = await register()
    let current = refreshToken

    for (let i = 0; i < 5; i += 1) {
      const res = await refresh(current)
      expect(res.status).toBe(200)
      const next = refreshCookie(res)
      if (!next) throw new Error(`rotation ${String(i)} set no cookie`)
      expect(next).not.toBe(current)
      current = next
    }

    // Five rotations, one family, exactly one live token at the end.
    const live = await prisma.refreshToken.findMany({
      where: { tokenHash: hashToken(current) },
    })
    expect(live).toHaveLength(1)
    expect(live[0]?.revokedAt).toBeNull()
  })

  it('records the user agent for the session', async () => {
    const { refreshToken } = await register()
    const familyId = (
      await prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashToken(refreshToken) },
      })
    ).familyId

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refreshToken))
      .set('User-Agent', 'saulado-test-agent/1.0')

    const newest = await prisma.refreshToken.findFirst({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
    })

    expect(newest?.userAgent).toBe('saulado-test-agent/1.0')
  })

  it('rejects a request with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh')

    // The mount-time session probe of a signed-out browser. Exactly one of these
    // per signed-out page load is correct behaviour, not a bug.
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })

  it('rejects an unknown token and clears the cookie', async () => {
    const res = await refresh('a-token-that-was-never-issued')

    expect(res.status).toBe(401)
    // Cleared so the client stops retrying a value the server will never accept.
    expect(refreshCookie(res)).toBe('')
  })

  it('rejects an expired token as TOKEN_EXPIRED', async () => {
    const { refreshToken } = await register()

    await prisma.refreshToken.update({
      where: { tokenHash: hashToken(refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await refresh(refreshToken)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_EXPIRED' } })
  })

  it('rejects a token whose account was deleted', async () => {
    const { userId, refreshToken } = await register()
    await prisma.user.delete({ where: { id: userId } })

    const res = await refresh(refreshToken)
    expect(res.status).toBe(401)

    /**
     * TOKEN_EXPIRED, not TOKEN_INVALID — and the reason is worth recording.
     *
     * `onDelete: Cascade` takes the refresh token rows with the user, so
     * `rotateSession` finds nothing and reports `unknown`, which the route maps
     * to TOKEN_EXPIRED. The handler's own "Account no longer exists" branch
     * (TOKEN_INVALID, routes/auth.ts:199) sits downstream of a *successful*
     * rotation, so reaching it needs a live token row whose user is gone — which
     * the cascade makes impossible while it is in place.
     *
     * Either way the client is signed out, so this is not a bug. Pinned so that
     * dropping the cascade is a visible behaviour change rather than a silent one.
     */
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_EXPIRED' } })
    expect(refreshCookie(res)).toBe('')
  })
})

describe('refresh token reuse', () => {
  it('revokes the whole family when a spent token is replayed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const { refreshToken: stolen } = await register()

      // The attacker refreshes first. They now hold a live token; the victim
      // holds a spent one.
      const attacker = refreshCookie(await refresh(stolen))
      if (!attacker) throw new Error('first refresh did not rotate')

      // The victim's client wakes up and presents the token it still has.
      const replay = await refresh(stolen)
      expect(replay.status).toBe(401)
      expect(replay.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
      expect(refreshCookie(replay)).toBe('')

      // The point of the whole mechanism: the attacker's *valid* token dies too.
      // Revoking only the replayed one would log out the victim and leave the
      // thief with the live session — precisely backwards.
      const attackerRetry = await refresh(attacker)
      expect(attackerRetry.status).toBe(401)
      expect(attackerRetry.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reuse detected'))
    } finally {
      warn.mockRestore()
    }
  })

  it('leaves no live token in a burned family', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const { refreshToken } = await register()
      const familyId = (
        await prisma.refreshToken.findUniqueOrThrow({
          where: { tokenHash: hashToken(refreshToken) },
        })
      ).familyId

      await refresh(refreshToken)
      await refresh(refreshToken)

      const rows = await prisma.refreshToken.findMany({ where: { familyId } })
      expect(rows.length).toBeGreaterThanOrEqual(2)
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it('does not touch a second login, which is its own family', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const email = testEmail('rot-two')
      const first = await request(app)
        .post('/api/auth/register')
        .send({ email, password: TEST_PASSWORD })
      const laptop = refreshCookie(first)

      const second = await request(app)
        .post('/api/auth/login')
        .send({ email, password: TEST_PASSWORD })
      const phone = refreshCookie(second)
      if (!laptop || !phone) throw new Error('missing refresh cookie')

      // Burn the laptop's family by replaying its token.
      await refresh(laptop)
      const replay = await refresh(laptop)
      expect(replay.status).toBe(401)

      // The phone is a separate chain and must be unaffected: theft of one
      // device's token is not grounds for signing the user out everywhere.
      const phoneRes = await refresh(phone)
      expect(phoneRes.status).toBe(200)
    } finally {
      warn.mockRestore()
    }
  })

  it('serialises concurrent refreshes of the same token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const { refreshToken } = await register()

      // Three tabs waking together. The find-then-write runs in a transaction,
      // so at most one can rotate; without it two would both succeed and the
      // family would be revoked on the next legitimate use.
      const results = await Promise.all([
        refresh(refreshToken),
        refresh(refreshToken),
        refresh(refreshToken),
      ])

      const succeeded = results.filter((res) => res.status === 200)
      expect(succeeded).toHaveLength(1)
      for (const res of results.filter((r) => r.status !== 200)) {
        expect(res.status).toBe(401)
      }
    } finally {
      warn.mockRestore()
    }
  })
})

describe('the Origin guard on refresh', () => {
  it('accepts a request with no Origin header', async () => {
    const { refreshToken } = await register()

    // curl, the test suite and server-to-server calls legitimately omit it, and
    // none of them is the CSRF threat model.
    const res = await refresh(refreshToken)

    expect(res.status).toBe(200)
  })

  it('accepts an allowlisted Origin', async () => {
    const { refreshToken } = await register()

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refreshToken))
      .set('Origin', 'http://localhost:5173')

    expect(res.status).toBe(200)
  })

  it('rejects an Origin outside the allowlist', async () => {
    const { refreshToken } = await register()

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refreshToken))
      .set('Origin', 'http://evil.example')

    // This check is what replaces SameSite once production needs None.
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })

  it('rejects a port that is merely close to the allowlisted one', async () => {
    const { refreshToken } = await register()

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refreshToken))
      .set('Origin', 'http://localhost:5174')

    // Exactly the failure a stale dev server caused: Vite drifts to 5174, login
    // still works, every refresh 401s. `strictPort: true` now prevents the drift;
    // this pins the behaviour that made it so confusing.
    expect(res.status).toBe(401)
  })

  it('does not consume the token when the Origin is rejected', async () => {
    const { refreshToken } = await register()

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refreshToken))
      .set('Origin', 'http://evil.example')

    // The guard returns before rotateSession, so a forged request must not cost
    // the user their session.
    const res = await refresh(refreshToken)
    expect(res.status).toBe(200)
  })
})

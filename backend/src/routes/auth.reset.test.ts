import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { hashToken } from '../auth/tokens.js'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import {
  TEST_PASSWORD,
  asCookie,
  cleanupTestUsers,
  outbox,
  refreshCookie,
  resetTokenFrom,
  testEmail,
} from '../test/helpers.js'

/**
 * Forgot password → reset password.
 *
 * Driven through the logging provider's outbox rather than by reading the
 * database, so the token under test is the one a user would actually receive —
 * the seam auth/email.ts was built for.
 */

const app = createApp()

const NEW_PASSWORD = 'lantern-marble-42-thicket'

afterAll(async () => {
  await cleanupTestUsers()
})

async function register(): Promise<{ email: string; userId: string; refreshToken: string }> {
  const email = testEmail('reset')
  const res = await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD })

  expect(res.status).toBe(201)
  const cookie = refreshCookie(res)
  if (!cookie) throw new Error('register did not set a refresh cookie')

  return { email, userId: (res.body as { user: { id: string } }).user.id, refreshToken: cookie }
}

/** Requests a reset and returns the token out of the resulting email. */
async function requestReset(email: string): Promise<string> {
  const before = outbox().length

  const res = await request(app).post('/api/auth/forgot-password').send({ email })
  expect(res.status).toBe(200)

  const sent = outbox().slice(before)
  expect(sent).toHaveLength(1)
  expect(sent[0]?.to).toBe(email)

  return resetTokenFrom(sent[0]?.text ?? '')
}

describe('POST /api/auth/forgot-password', () => {
  it('sends a reset link to a registered address', async () => {
    const { email } = await register()
    const before = outbox().length

    const res = await request(app).post('/api/auth/forgot-password').send({ email })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ message: expect.any(String) as unknown })

    const sent = outbox().slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('Reset your Saulado password')
    expect(sent[0]?.text).toContain(`${env.APP_URL}/reset-password?token=`)
  })

  it('answers identically for an address with no account, and sends nothing', async () => {
    const { email } = await register()

    const known = await request(app).post('/api/auth/forgot-password').send({ email })

    const before = outbox().length
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testEmail('nobody') })

    // Byte-identical responses: the form must not be a membership oracle. The
    // consequence is that a typo'd address shows success on screen and logs
    // nothing — the correct output, and the one that reads as a broken adapter.
    expect(unknown.status).toBe(200)
    expect(unknown.body).toEqual(known.body)
    expect(outbox().slice(before)).toHaveLength(0)
  })

  it('stores only the digest of the reset token', async () => {
    const { email, userId } = await register()
    const token = await requestReset(email)

    const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } })

    expect(record?.userId).toBe(userId)
    expect(record?.usedAt).toBeNull()
    expect(JSON.stringify(record)).not.toContain(token)
  })

  it('sets the expiry from the configured TTL', async () => {
    const { email } = await register()
    const token = await requestReset(email)

    const record = await prisma.passwordReset.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    })

    const minutes = (record.expiresAt.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(env.RESET_TOKEN_TTL_MINUTES - 2)
    expect(minutes).toBeLessThanOrEqual(env.RESET_TOKEN_TTL_MINUTES)
  })

  it('invalidates an outstanding token when a second link is requested', async () => {
    const { email } = await register()

    const first = await requestReset(email)
    const second = await requestReset(email)
    expect(second).not.toBe(first)

    // Otherwise three requests leave three usable tokens, and the oldest stays
    // valid for its full hour after the user has already reset with a newer one.
    const stale = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: first, password: NEW_PASSWORD })
    expect(stale.status).toBe(401)

    const fresh = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second, password: NEW_PASSWORD })
    expect(fresh.status).toBe(200)
  })

  it('validates the email before doing any work', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nope' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { email: expect.any(String) as unknown } },
    })
  })
})

describe('POST /api/auth/reset-password', () => {
  it('changes the password and retires the old one', async () => {
    const { email } = await register()
    const token = await requestReset(email)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: NEW_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ message: expect.any(String) as unknown })

    const withNew = await request(app)
      .post('/api/auth/login')
      .send({ email, password: NEW_PASSWORD })
    expect(withNew.status).toBe(200)

    const withOld = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
    expect(withOld.status).toBe(401)
  })

  it('works exactly once', async () => {
    const { email } = await register()
    const token = await requestReset(email)

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: NEW_PASSWORD })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'another-password-entirely-7' })
    expect(second.status).toBe(401)
    expect(second.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })

    // The second attempt must not have taken effect.
    const login = await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD })
    expect(login.status).toBe(200)
  })

  it('revokes every existing session', async () => {
    const { email, refreshToken } = await register()

    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
    const otherDevice = refreshCookie(secondLogin)
    if (!otherDevice) throw new Error('login did not set a refresh cookie')

    const token = await requestReset(email)
    await request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })

    // Someone may be resetting *because* an attacker holds their session, so a
    // reset that left other refresh tokens alive would be cosmetic.
    for (const cookie of [refreshToken, otherDevice]) {
      const res = await request(app).post('/api/auth/refresh').set('Cookie', asCookie(cookie))
      expect(res.status).toBe(401)
    }
  })

  it('clears the refresh cookie in the resetting browser', async () => {
    const { email, refreshToken } = await register()
    const token = await requestReset(email)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Cookie', asCookie(refreshToken))
      .send({ token, password: NEW_PASSWORD })

    expect(res.status).toBe(200)
    expect(refreshCookie(res)).toBe('')
  })

  it('rejects an expired token', async () => {
    const { email } = await register()
    const token = await requestReset(email)

    await prisma.passwordReset.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: NEW_PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })

    const login = await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD })
    expect(login.status).toBe(401)
  })

  it('gives one message for missing, used and expired tokens', async () => {
    const { email } = await register()

    const usedToken = await requestReset(email)
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: usedToken, password: NEW_PASSWORD })

    const expiredToken = await requestReset(email)
    await prisma.passwordReset.update({
      where: { tokenHash: hashToken(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const responses = await Promise.all(
      ['never-issued-at-all', usedToken, expiredToken].map((token) =>
        request(app).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }),
      ),
    )

    // Distinguishing them tells a token-guessing attacker which guesses were
    // once real.
    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual(responses[0]?.body)
    }
  })

  it('applies the password policy to the new password', async () => {
    const { email } = await register()
    const token = await requestReset(email)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { password: expect.any(String) as unknown } },
    })

    // Validation runs before the handler, so the token must still be unspent.
    const retry = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: NEW_PASSWORD })
    expect(retry.status).toBe(200)
  })

  it('requires a token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ password: NEW_PASSWORD })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { token: expect.any(String) as unknown } },
    })
  })
})

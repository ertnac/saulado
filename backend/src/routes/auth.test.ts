import { SignJWT } from 'jose'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import {
  TEST_PASSWORD,
  asCookie,
  cleanupTestUsers,
  refreshCookie,
  refreshCookieHeader,
  testEmail,
} from '../test/helpers.js'

/**
 * Register / login / me / logout.
 *
 * Rotation and the reset flow are in sibling files (`auth.rotation.test.ts`,
 * `auth.reset.test.ts`) — one suite covering all four would be several hundred
 * lines of setup before the first interesting assertion.
 *
 * Rate limiting is off here: `skip: () => env.isTest` in http/rate-limit.ts, so
 * the six wrong-password attempts below do not throttle. The limiter has its own
 * suite that forces it on.
 */

const app = createApp()

afterAll(async () => {
  await cleanupTestUsers()
})

/** Registers a user and returns the credentials plus the issued session. */
async function register(email = testEmail()): Promise<{
  email: string
  accessToken: string
  refreshToken: string
  userId: string
}> {
  const res = await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD })

  expect(res.status).toBe(201)

  const body = res.body as { user: { id: string }; accessToken: string }
  const cookie = refreshCookie(res)
  if (!cookie) throw new Error('register did not set a refresh cookie')

  return { email, accessToken: body.accessToken, refreshToken: cookie, userId: body.user.id }
}

describe('POST /api/auth/register', () => {
  it('creates the account and returns a session', async () => {
    const email = testEmail()
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      user: { email, emailVerifiedAt: null },
      settings: { darkMode: expect.any(Boolean) as unknown },
      accessToken: expect.any(String) as unknown,
      expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    })
  })

  it('never puts the password hash on the wire', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail(), password: TEST_PASSWORD })

    // Checked as serialised text, so a hash nested anywhere still trips it.
    expect(JSON.stringify(res.body)).not.toContain('$2b$')
    expect(res.body).not.toHaveProperty('user.passwordHash')
  })

  it('sets an HttpOnly refresh cookie scoped to the auth routes', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail(), password: TEST_PASSWORD })

    const header = refreshCookieHeader(res)
    expect(header).toBeTruthy()
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Path=/api/auth')
    // Unprefixed in dev and test — `__Secure-` without TLS is dropped silently.
    expect(header).not.toContain('__Secure-')
  })

  it('creates the settings row in the same transaction', async () => {
    const { userId } = await register()

    // A user with no settings row breaks every read that joins them, so this is
    // an invariant rather than a convenience.
    await expect(prisma.userSettings.findUnique({ where: { userId } })).resolves.not.toBeNull()
  })

  it('rejects a duplicate email with 409', async () => {
    const { email } = await register()

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      error: { code: 'EMAIL_TAKEN', fields: { email: expect.any(String) as unknown } },
    })
  })

  it('treats email as case- and whitespace-insensitive', async () => {
    const email = testEmail()
    await register(email)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `  ${email.toUpperCase()}  `, password: TEST_PASSWORD })

    // Citext plus normalizeEmail: one address, one account, however it is typed.
    expect(res.status).toBe(409)
  })

  it('rejects a password that fails the shared policy', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail(), password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { password: expect.any(String) as unknown } },
    })
    expect(refreshCookie(res)).toBeNull()
  })

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: TEST_PASSWORD })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { email: expect.any(String) as unknown } },
    })
  })

  it('reports both bad fields at once', async () => {
    const res = await request(app).post('/api/auth/register').send({})

    expect(res.status).toBe(400)
    const { fields } = (res.body as { error: { fields: Record<string, string> } }).error
    expect(Object.keys(fields).sort()).toEqual(['email', 'password'])
  })
})

describe('POST /api/auth/login', () => {
  it('returns a session for the right password', async () => {
    const { email } = await register()

    const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ user: { email }, accessToken: expect.any(String) as unknown })
    expect(refreshCookie(res)).toBeTruthy()
  })

  it('issues a session distinct from the one register handed out', async () => {
    const { email, refreshToken } = await register()

    const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD })

    // Each login starts its own rotation family, so signing in on a second
    // device must not hand over the first device's token.
    expect(refreshCookie(res)).not.toBe(refreshToken)
  })

  it('answers identically for a wrong password and an unknown email', async () => {
    const { email } = await register()

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'definitely-not-the-password' })

    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail('ghost'), password: TEST_PASSWORD })

    // Byte-identical on purpose. Any difference here — status, code, wording —
    // turns the login form into an account-existence oracle.
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPassword.body).toEqual(unknownEmail.body)
    expect(wrongPassword.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
  })

  it('sets no cookie on a failed attempt', async () => {
    const { email } = await register()

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-guess-1' })

    expect(refreshCookie(res)).toBeNull()
  })

  it('does not apply the password policy to an existing password', async () => {
    // Login must accept anything a user could have typed. Rejecting 'short' as
    // too short would both leak the policy and lock out grandfathered accounts.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail('ghost'), password: 'short' })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
  })
})

describe('GET /api/auth/me', () => {
  it('returns the caller for a valid bearer token', async () => {
    const { email, accessToken } = await register()

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ user: { email }, settings: expect.any(Object) as unknown })
    expect(res.body).not.toHaveProperty('accessToken')
  })

  it('rejects a missing or malformed Authorization header', async () => {
    const cases = [undefined, 'Bearer', 'Bearer ', 'Basic abc', 'token-without-scheme']

    for (const header of cases) {
      const req = request(app).get('/api/auth/me')
      if (header !== undefined) void req.set('Authorization', header)

      const res = await req
      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
    }
  })

  it('will not accept the refresh cookie as an access credential', async () => {
    const { refreshToken } = await register()

    // requireAuth reads the bearer header only. Accepting cookies here would
    // make every authenticated endpoint CSRF-reachable.
    const res = await request(app).get('/api/auth/me').set('Cookie', asCookie(refreshToken))

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })

  it('distinguishes an expired token from an invalid one', async () => {
    const { userId, accessToken } = await register()

    // The distinction drives the frontend: TOKEN_EXPIRED means "try a silent
    // refresh", TOKEN_INVALID means "go to login". Collapsing them makes the
    // client retry refreshes that can never succeed.
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setIssuer('saulado')
      .setAudience('saulado-app')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(new TextEncoder().encode(env.JWT_SECRET))

    const expiredRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`)
    expect(expiredRes.status).toBe(401)
    expect(expiredRes.body).toMatchObject({ error: { code: 'TOKEN_EXPIRED' } })

    // Same token, one character of the signature flipped.
    const tampered = `${accessToken.slice(0, -1)}${accessToken.endsWith('a') ? 'b' : 'a'}`
    const tamperedRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`)
    expect(tamperedRes.status).toBe(401)
    expect(tamperedRes.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })

  it('rejects a token signed with the wrong key', async () => {
    const { userId } = await register()

    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer('saulado')
      .setAudience('saulado-app')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('an-attacker-key-of-sufficient-length-32'))

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })

  it('rejects a token whose account has been deleted', async () => {
    const { userId, accessToken } = await register()
    await prisma.user.delete({ where: { id: userId } })

    // The JWT is still cryptographically valid for its full 15 minutes — the
    // reason the token carries only `sub` and is never treated as a user cache.
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the cookie and revokes the presented token', async () => {
    const { refreshToken } = await register()

    const res = await request(app).post('/api/auth/logout').set('Cookie', asCookie(refreshToken))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ message: expect.any(String) as unknown })
    // Cleared, not merely absent: the browser needs an expiry to drop it.
    expect(refreshCookie(res)).toBe('')
    expect(refreshCookieHeader(res)).toContain('Path=/api/auth')

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refreshToken))
    expect(replay.status).toBe(401)
  })

  it('is idempotent with no cookie at all', async () => {
    // A client clearing local state should never have to handle a failure here.
    const res = await request(app).post('/api/auth/logout')

    expect(res.status).toBe(200)
  })

  it('is idempotent when called twice with the same token', async () => {
    const { refreshToken } = await register()

    const first = await request(app).post('/api/auth/logout').set('Cookie', asCookie(refreshToken))
    const second = await request(app).post('/api/auth/logout').set('Cookie', asCookie(refreshToken))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })

  it('leaves other sessions for the same user alive', async () => {
    const { email, refreshToken: laptop } = await register()

    const phoneLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD })
    const phone = refreshCookie(phoneLogin)
    if (!phone) throw new Error('login did not set a refresh cookie')

    await request(app).post('/api/auth/logout').set('Cookie', asCookie(laptop))

    // Signing out of a laptop must not end the session on a phone — which is
    // why logout revokes one token and not the family.
    const res = await request(app).post('/api/auth/refresh').set('Cookie', asCookie(phone))
    expect(res.status).toBe(200)
  })
})

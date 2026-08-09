import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { hashToken } from '../auth/tokens.js'
import { prisma } from '../db/client.js'
import {
  TEST_PASSWORD,
  cleanupTestUsers,
  refreshCookie,
  refreshCookieHeader,
  testEmail,
} from '../test/helpers.js'

/**
 * The `X-Saulado-Client: native` gate (plan §4.2).
 *
 * React Native cannot use the httpOnly refresh cookie the web client relies on,
 * so native requests get the token in the JSON body instead and keep it in the
 * OS keychain. That is a deliberate weakening of one specific defence, and the
 * gate is what confines it: exactly one transport per request, chosen by an
 * explicit opt-in header and nothing else.
 *
 * Every assertion here is negative as well as positive. "Native gets a token in
 * the body" is easy to satisfy accidentally; "and no cookie", "and web still
 * gets no token" are the halves that actually hold the design together.
 */

const app = createApp()
const NATIVE = ['X-Saulado-Client', 'native'] as const

afterAll(async () => {
  await cleanupTestUsers()
})

interface AuthBody {
  accessToken: string
  refreshToken?: string
  user: { id: string }
}

function registerNative(label = 'native'): request.Test {
  return request(app)
    .post('/api/auth/register')
    .set(...NATIVE)
    .send({ email: testEmail(label), password: TEST_PASSWORD })
}

describe('native register and login', () => {
  it('returns the refresh token in the body and sets no cookie', async () => {
    const res = await registerNative()

    expect(res.status).toBe(201)
    const body = res.body as AuthBody
    expect(body.refreshToken).toEqual(expect.any(String))

    // The half that matters. A native response carrying both transports would
    // put one credential in two places with one lifetime, and the cookie would
    // be the copy nobody remembers to revoke.
    expect(refreshCookieHeader(res)).toBeNull()
  })

  it('issues a token that is a real session, not a placeholder', async () => {
    const body = (await registerNative()).body as AuthBody
    if (!body.refreshToken) throw new Error('native register returned no refresh token')

    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(body.refreshToken) },
    })

    expect(row).not.toBeNull()
    expect(row?.revokedAt).toBeNull()
  })

  it('logs in a native client the same way', async () => {
    const email = testEmail('native-login')
    await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD })

    const res = await request(app)
      .post('/api/auth/login')
      .set(...NATIVE)
      .send({ email, password: TEST_PASSWORD })

    expect(res.status).toBe(200)
    expect((res.body as AuthBody).refreshToken).toEqual(expect.any(String))
    expect(refreshCookieHeader(res)).toBeNull()
  })
})

describe('the web path is unchanged', () => {
  it('sets the cookie and keeps the token out of the body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail('web'), password: TEST_PASSWORD })

    expect(res.status).toBe(201)
    expect(refreshCookie(res)).toEqual(expect.any(String))

    // The whole reason the web client is safe from XSS-as-takeover. If this ever
    // starts passing a string, the gate has been widened by accident.
    expect((res.body as AuthBody).refreshToken).toBeUndefined()
  })

  it('ignores a header with the wrong value', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Saulado-Client', 'web')
      .send({ email: testEmail('web-header'), password: TEST_PASSWORD })

    // Exact match, not a truthy check: anything other than `native` is a web
    // client, including a typo'd or attacker-supplied value.
    expect((res.body as AuthBody).refreshToken).toBeUndefined()
    expect(refreshCookie(res)).toEqual(expect.any(String))
  })
})

describe('native refresh', () => {
  it('accepts the token from the body and rotates it there', async () => {
    const first = (await registerNative('native-refresh')).body as AuthBody
    if (!first.refreshToken) throw new Error('no refresh token to rotate')

    const res = await request(app)
      .post('/api/auth/refresh')
      .set(...NATIVE)
      .send({ refreshToken: first.refreshToken })

    expect(res.status).toBe(200)
    const second = res.body as AuthBody
    expect(second.refreshToken).toEqual(expect.any(String))
    expect(second.refreshToken).not.toBe(first.refreshToken)
    expect(refreshCookieHeader(res)).toBeNull()
  })

  it('applies reuse detection to the native transport too', async () => {
    const first = (await registerNative('native-reuse')).body as AuthBody
    if (!first.refreshToken) throw new Error('no refresh token to replay')

    const rotated = (
      await request(app)
        .post('/api/auth/refresh')
        .set(...NATIVE)
        .send({ refreshToken: first.refreshToken })
    ).body as AuthBody

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set(...NATIVE)
      .send({ refreshToken: first.refreshToken })

    expect(replay.status).toBe(401)

    // The rotation machinery is transport-agnostic, and this is what makes a
    // keychain token acceptable at all: stolen, it works once, then burns the
    // family and logs the thief out with the victim.
    const attackerRetry = await request(app)
      .post('/api/auth/refresh')
      .set(...NATIVE)
      .send({ refreshToken: rotated.refreshToken })

    expect(attackerRetry.status).toBe(401)
  })

  it('rejects a native refresh with no token in the body', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set(...NATIVE)
      .send({})

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })

  it('does not read a body token from a client that did not opt in', async () => {
    const native = (await registerNative('native-crossover')).body as AuthBody
    if (!native.refreshToken) throw new Error('no refresh token issued')

    // No header, so this is a web request that happens to carry a field named
    // refreshToken — the confused-deputy shape. It must be ignored outright,
    // not treated as a credential.
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: native.refreshToken })

    expect(res.status).toBe(401)
  })

  it('skips the Origin guard, which only defends the cookie', async () => {
    const body = (await registerNative('native-origin')).body as AuthBody
    if (!body.refreshToken) throw new Error('no refresh token issued')

    const res = await request(app)
      .post('/api/auth/refresh')
      .set(...NATIVE)
      .set('Origin', 'http://evil.example')
      .send({ refreshToken: body.refreshToken })

    // Not a hole: there is no ambient credential here for a forged cross-site
    // request to ride. The token is held in the keychain and sent deliberately,
    // which is the one thing CSRF cannot do.
    expect(res.status).toBe(200)
  })
})

describe('native logout', () => {
  it('revokes the token presented in the body', async () => {
    const body = (await registerNative('native-logout')).body as AuthBody
    if (!body.refreshToken) throw new Error('no refresh token issued')

    const res = await request(app)
      .post('/api/auth/logout')
      .set(...NATIVE)
      .send({ refreshToken: body.refreshToken })

    expect(res.status).toBe(200)

    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(body.refreshToken) },
    })
    expect(row?.revokedAt).toBeInstanceOf(Date)

    // And it is genuinely spent, not merely marked.
    const after = await request(app)
      .post('/api/auth/refresh')
      .set(...NATIVE)
      .send({ refreshToken: body.refreshToken })
    expect(after.status).toBe(401)
  })
})

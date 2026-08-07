import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { env } from '../config/env.js'
import { TEST_PASSWORD, testEmail } from '../test/helpers.js'

/**
 * The rate limiters, exercised against the real routes.
 *
 * Every other suite runs with them disabled — `skip: () => env.isTest` — because
 * dozens of login attempts from one address would otherwise make results depend
 * on execution order. That leaves the limiters themselves untested unless
 * something forces them on, which is what this file does.
 *
 * `skip` is called per request, so flipping `env.isTest` is enough; no separate
 * app or duplicated config is involved, and these are the same middleware
 * instances the routes use in production.
 *
 * Two consequences shape the tests below:
 *
 * - Limiter state is a process-wide MemoryStore, so each test needs its own key.
 *   The login and reset limiters key on IP **and** email, so a fresh email is a
 *   fresh budget. `registerLimiter` keys on IP alone and therefore has exactly
 *   one budget for this whole file — hence a single register test, and no other
 *   test here may touch `/register`.
 * - Failed logins run bcrypt via `burnPasswordTiming`, so each attempt costs a
 *   few hundred milliseconds. Attempt counts are kept to the minimum that proves
 *   the boundary.
 */

const app = createApp()

function forceLimiters(on: boolean): void {
  // `env` is `as const`, so assign through defineProperty rather than casting
  // away the readonly.
  Object.defineProperty(env, 'isTest', { value: !on, configurable: true, writable: true })
}

beforeEach(() => {
  forceLimiters(true)
})

afterEach(() => {
  forceLimiters(false)
})

describe('the limiters are disabled under NODE_ENV=test', () => {
  it('skips while isTest is true, which is why every other suite is unthrottled', async () => {
    forceLimiters(false)
    const email = testEmail('unthrottled')

    // Well past the 5-attempt login budget.
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-1' })
      expect(res.status).toBe(401)
    }
  })
})

describe('loginLimiter', () => {
  it('allows 5 attempts and rejects the 6th with 429', async () => {
    const email = testEmail('login-limit')

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-1' })
      expect(res.status).toBe(401)
    }

    const blocked = await request(app).post('/api/auth/login').send({ email, password: 'wrong-1' })

    expect(blocked.status).toBe(429)
    expect(blocked.body).toMatchObject({
      error: {
        code: 'RATE_LIMITED',
        message: expect.any(String) as unknown,
        // 15 minutes, so the client can say "about 15 minutes" rather than guess.
        retryAfter: 15 * 60,
      },
    })
  })

  it('keys on email as well as IP, so one target does not lock out another', async () => {
    const victim = testEmail('victim')

    for (let i = 0; i < 6; i += 1) {
      await request(app).post('/api/auth/login').send({ email: victim, password: 'wrong-1' })
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: victim, password: 'x' })
    expect(blocked.status).toBe(429)

    // IP alone would let one attacker behind one address lock every account they
    // can name — a denial of service against users, caused by the defence.
    const bystander = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail('bystander'), password: TEST_PASSWORD })
    expect(bystander.status).toBe(401)
  })

  it('normalises the email into the key', async () => {
    const email = testEmail('case-key')

    for (let i = 0; i < 6; i += 1) {
      await request(app).post('/api/auth/login').send({ email, password: 'wrong-1' })
    }

    // Otherwise varying capitalisation would hand out a fresh budget per spelling
    // of the same address.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), password: 'wrong-1' })

    expect(res.status).toBe(429)
  })

  it('advertises the budget in standard headers', async () => {
    const email = testEmail('headers')

    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-1' })

    expect(res.headers['ratelimit-limit']).toBe('5')
    expect(res.headers['ratelimit-remaining']).toBe('4')
    // legacyHeaders: false — the draft-spec names only.
    expect(res.headers['x-ratelimit-limit']).toBeUndefined()
  })
})

describe('passwordResetLimiter', () => {
  it('allows 5 requests per hour and rejects the 6th', async () => {
    const email = testEmail('reset-limit')

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/auth/forgot-password').send({ email })
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).post('/api/auth/forgot-password').send({ email })

    // Tighter than login because each request sends mail: unthrottled, this is a
    // free mail cannon pointed at any address.
    expect(blocked.status).toBe(429)
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMITED', retryAfter: 60 * 60 } })
  })

  it('rejects before the handler runs, so no mail is attempted', async () => {
    const email = testEmail('reset-nomail')

    for (let i = 0; i < 6; i += 1) {
      await request(app).post('/api/auth/forgot-password').send({ email })
    }

    const blocked = await request(app).post('/api/auth/forgot-password').send({ email })

    // Worth pinning because the failure is visible to a user as a red banner
    // instead of the usual success message — the limiter, not a broken adapter.
    expect(blocked.status).toBe(429)
    expect(blocked.body).not.toMatchObject({ message: expect.any(String) as unknown })
  })
})

describe('registerLimiter', () => {
  it('allows 10 per hour per IP and rejects the 11th', async () => {
    // Keyed on IP alone: the email is new by definition, so including it would
    // give every request a unique key and limit nothing. That also means this is
    // the only test in the file allowed to call /register.
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/api/auth/register')
        // Deliberately invalid, so the limiter is exercised without creating ten
        // users or paying bcrypt ten times. The limiter runs before validation.
        .send({ email: 'not-an-email', password: 'short' })
      expect(res.status).toBe(400)
    }

    const blocked = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail('reg-limit'), password: TEST_PASSWORD })

    expect(blocked.status).toBe(429)
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMITED', retryAfter: 60 * 60 } })
  })
})

describe('refreshLimiter', () => {
  it('has a ceiling high enough for a browser with many tabs', async () => {
    // 60 per 15 minutes. A legitimate tab refreshes every 15 minutes, so this
    // only bites at roughly 60 tabs — the limit exists to bound abuse, not to
    // punish someone with a dozen tabs open.
    const res = await request(app).post('/api/auth/refresh')

    expect(res.status).toBe(401)
    expect(res.headers['ratelimit-limit']).toBe('60')
  })
})

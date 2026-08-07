import { describe, expect, it } from 'vitest'
import { env } from '../config/env.js'
import { burnPasswordTiming, hashPassword, verifyPassword } from './password.js'

/**
 * bcrypt is slow on purpose, so these run at a few hundred ms each. That cost is
 * the thing being tested — see the cost-factor case below.
 */

const PASSWORD = 'correct-horse-battery-staple'

describe('hashPassword', () => {
  it('produces a bcrypt hash, not the password', async () => {
    const hash = await hashPassword(PASSWORD)

    expect(hash).not.toContain(PASSWORD)
    // $2b$ = bcrypt, then the cost, then a 53-char salt+digest.
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/)
  })

  it('bakes in the configured cost factor', async () => {
    // The plan requires >= 12 and env.ts enforces it, but the hash is where the
    // cost actually lives: a hash written at cost 10 stays verifiable at cost 10
    // forever, no matter what the config says afterwards.
    const cost = Number((await hashPassword(PASSWORD)).split('$')[2])

    expect(cost).toBe(env.BCRYPT_ROUNDS)
    expect(cost).toBeGreaterThanOrEqual(12)
  })

  it('salts, so the same password hashes differently every time', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)])

    expect(first).not.toBe(second)
    // Both still verify — the salt travels inside the hash.
    expect(await verifyPassword(PASSWORD, first)).toBe(true)
    expect(await verifyPassword(PASSWORD, second)).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('accepts the right password', async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const hash = await hashPassword(PASSWORD)

    expect(await verifyPassword('wrong-password-entirely', hash)).toBe(false)
    expect(await verifyPassword(`${PASSWORD} `, hash)).toBe(false)
    expect(await verifyPassword(PASSWORD.toUpperCase(), hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('is byte-exact on multibyte input', async () => {
    const unicode = 'пароль-日本語-🔐'
    const hash = await hashPassword(unicode)

    expect(await verifyPassword(unicode, hash)).toBe(true)
    expect(await verifyPassword('пароль-日本語-🔒', hash)).toBe(false)
  })

  it('returns false on a malformed hash rather than throwing', async () => {
    // A truncated or hand-edited column value must fail the login, not 500 it.
    expect(await verifyPassword(PASSWORD, 'not-a-bcrypt-hash')).toBe(false)
    expect(await verifyPassword(PASSWORD, '')).toBe(false)
  })
})

describe('burnPasswordTiming', () => {
  it('resolves without throwing on any input', async () => {
    // Called on login's user-not-found branch, where a throw would turn a
    // wrong-email attempt into a 500.
    await expect(burnPasswordTiming(PASSWORD)).resolves.toBeUndefined()
    await expect(burnPasswordTiming('')).resolves.toBeUndefined()
  })

  it('costs roughly what a real verify costs', async () => {
    // The point of the function. If it returned early, "unknown email" would
    // answer in ~1 ms against bcrypt's ~300 ms and the generic
    // INVALID_CREDENTIALS message would be undone by a stopwatch.
    const hash = await hashPassword(PASSWORD)

    const realStart = performance.now()
    await verifyPassword('some-wrong-guess', hash)
    const realMs = performance.now() - realStart

    const burnStart = performance.now()
    await burnPasswordTiming('some-wrong-guess')
    const burnMs = performance.now() - burnStart

    // Deliberately loose — CI schedulers are noisy, and the failure this guards
    // against is an order-of-magnitude gap, not a 20% one.
    expect(burnMs).toBeGreaterThan(realMs / 4)
    expect(burnMs).toBeLessThan(realMs * 4)
  })
})

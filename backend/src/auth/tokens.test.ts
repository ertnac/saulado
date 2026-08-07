import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generateFamilyId, generateToken, hashToken, safeCompareHex } from './tokens.js'

/**
 * These four functions are the trust anchor for refresh tokens and password
 * resets alike: both secrets are only ever compared as digests, so a weakness
 * here is invisible at every layer above.
 */

describe('generateToken', () => {
  it('produces 32 bytes of entropy', () => {
    // 32 bytes base64url-encoded, unpadded, is 43 characters.
    expect(generateToken()).toHaveLength(43)
    expect(Buffer.from(generateToken(), 'base64url')).toHaveLength(32)
  })

  it('stays inside the base64url alphabet', () => {
    // The token rides in a Set-Cookie value and a query string. Plain base64
    // would put `+`, `/` and `=` in both, where they need escaping and get
    // mangled by anything that decodes a URL twice.
    for (let i = 0; i < 50; i += 1) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()))
    expect(tokens.size).toBe(1000)
  })
})

describe('hashToken', () => {
  it('is a SHA-256 hex digest', () => {
    const token = generateToken()
    expect(hashToken(token)).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic, which is what makes lookup by digest possible', () => {
    // The property bcrypt does not have, and the reason it is not used here:
    // `WHERE token_hash = $1` needs the same input to yield the same digest.
    const token = generateToken()
    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('gives different digests to different tokens', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()))
  })

  it('does not leak the token', () => {
    const token = generateToken()
    expect(hashToken(token)).not.toContain(token)
  })
})

describe('safeCompareHex', () => {
  it('accepts identical digests', () => {
    const digest = hashToken('anything')
    expect(safeCompareHex(digest, digest)).toBe(true)
  })

  it('rejects different digests of the same length', () => {
    expect(safeCompareHex(hashToken('a'), hashToken('b'))).toBe(false)
  })

  it('rejects mismatched lengths instead of throwing', () => {
    // timingSafeEqual throws on unequal buffer lengths, so the guard has to run
    // first. Without it a truncated value crashes the request rather than
    // failing the comparison.
    expect(safeCompareHex(hashToken('a'), 'abc')).toBe(false)
    expect(safeCompareHex('', hashToken('a'))).toBe(false)
  })

  it('handles a digest differing only in its last character', () => {
    const digest = hashToken('a')
    const nudged = `${digest.slice(0, -1)}${digest.endsWith('0') ? '1' : '0'}`
    expect(safeCompareHex(digest, nudged)).toBe(false)
  })
})

describe('generateFamilyId', () => {
  it('is a UUID', () => {
    expect(generateFamilyId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('never repeats', () => {
    // A collision would splice two users' rotation chains together, so reuse
    // detection on one would revoke the other's sessions.
    const ids = new Set(Array.from({ length: 1000 }, () => generateFamilyId()))
    expect(ids.size).toBe(1000)
  })
})

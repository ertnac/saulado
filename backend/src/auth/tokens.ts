import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Opaque token primitives, shared by refresh tokens and password resets.
 *
 * Both are the same shape of secret: a high-entropy random string handed to one
 * party, stored only as a digest. Both are hashed with **SHA-256, not bcrypt**,
 * and that is deliberate:
 *
 * - bcrypt's cost exists to make brute-forcing *low-entropy* secrets expensive.
 *   A 256-bit random token has nothing to brute-force; the work factor buys no
 *   security and would add ~100 ms to every authenticated refresh.
 * - Lookup must be by digest (`WHERE token_hash = $1`). bcrypt salts each hash,
 *   so the same input yields a different digest every time and cannot be looked
 *   up — it can only be compared row by row. That turns an index seek into a
 *   full table scan.
 *
 * The property that matters is preimage resistance, which SHA-256 has.
 */

/** 32 bytes = 256 bits. base64url so it survives cookies, URLs, and JSON unescaped. */
const TOKEN_BYTES = 32

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Database lookups by hash do not need this, but comparing a computed digest to
 * one already in hand does — `===` on strings short-circuits at the first
 * differing byte and leaks how much of the value was correct.
 */
export function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/** Random UUID for grouping a rotation chain. */
export function generateFamilyId(): string {
  return crypto.randomUUID()
}

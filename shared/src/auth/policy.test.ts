import { describe, expect, it } from 'vitest'
import {
  checkPassword,
  EMAIL_MAX_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  passwordByteLength,
} from './policy.js'

describe('passwordByteLength', () => {
  it('counts ASCII as one byte per character', () => {
    expect(passwordByteLength('abcdef')).toBe(6)
  })

  it('counts multi-byte characters by their UTF-8 encoding, not String.length', () => {
    // "🧠" is 1 code point, 2 UTF-16 units, 4 UTF-8 bytes. String.length would
    // say 2 and under-report the bcrypt cost.
    expect('🧠'.length).toBe(2)
    expect(passwordByteLength('🧠')).toBe(4)
  })

  it('counts accented Latin as two bytes', () => {
    expect(passwordByteLength('café')).toBe(5)
  })
})

describe('checkPassword', () => {
  it('accepts a password at exactly the minimum length', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull()
  })

  it('rejects one character below the minimum', () => {
    const problem = checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))
    expect(problem?.code).toBe('TOO_SHORT')
  })

  it('rejects whitespace-only passwords before the length check', () => {
    // Long enough to pass TOO_SHORT, so this proves ordering matters.
    const problem = checkPassword(' '.repeat(PASSWORD_MIN_LENGTH + 5))
    expect(problem?.code).toBe('ALL_WHITESPACE')
  })

  it('rejects an empty password', () => {
    expect(checkPassword('')?.code).toBe('ALL_WHITESPACE')
  })

  it('accepts a password at exactly the byte limit', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MAX_BYTES))).toBeNull()
  })

  it('rejects one byte over the limit', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MAX_BYTES + 1))?.code).toBe('TOO_LONG')
  })

  it('measures the byte limit in bytes, not characters', () => {
    // 20 brains = 20 code points, 80 UTF-8 bytes. Well under any character
    // count you'd write, well over bcrypt's 72-byte truncation point.
    const emojiPassword = '🧠'.repeat(20)
    expect([...emojiPassword].length).toBe(20)
    expect(checkPassword(emojiPassword)?.code).toBe('TOO_LONG')
  })

  it('rejects common passwords regardless of case', () => {
    expect(checkPassword('password123')?.code).toBe('TOO_COMMON')
    expect(checkPassword('PASSWORD123')?.code).toBe('TOO_COMMON')
    expect(checkPassword('PaSsWoRd123')?.code).toBe('TOO_COMMON')
  })

  it('accepts a reasonable passphrase', () => {
    expect(checkPassword('correct horse battery staple')).toBeNull()
  })

  it('returns a human-readable message with every problem', () => {
    for (const candidate of ['', 'short', 'password123', 'a'.repeat(PASSWORD_MAX_BYTES + 1)]) {
      const problem = checkPassword(candidate)
      expect(problem).not.toBeNull()
      expect(problem?.message.length).toBeGreaterThan(0)
    }
  })
})

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com')
  })

  it('is idempotent', () => {
    const once = normalizeEmail('  User@Example.com ')
    expect(normalizeEmail(once)).toBe(once)
  })

  it('does not strip dots or plus-tags', () => {
    // Provider-specific aliasing rules. Applying Gmail's to every domain merges
    // accounts that are genuinely distinct elsewhere.
    expect(normalizeEmail('a.b+tag@example.com')).toBe('a.b+tag@example.com')
  })
})

describe('policy constants', () => {
  it('keeps the byte cap at bcrypt truncation point', () => {
    // If this ever rises above 72, bcrypt silently ignores the excess and two
    // different passwords start authenticating the same account.
    expect(PASSWORD_MAX_BYTES).toBe(72)
  })

  it('leaves room between the minimum and the cap', () => {
    expect(PASSWORD_MIN_LENGTH).toBeLessThan(PASSWORD_MAX_BYTES)
  })

  it('caps email at the RFC 5321 path limit', () => {
    expect(EMAIL_MAX_LENGTH).toBe(254)
  })
})

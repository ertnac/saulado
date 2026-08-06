/**
 * Password and email policy.
 *
 * This lives in `shared/` on purpose: the frontend needs it to give inline
 * feedback before submit, and the backend needs it because client-side
 * validation is a convenience, never a control. Two copies of these rules drift,
 * and the drift is always discovered as "the form said it was fine but the API
 * rejected it".
 */

/**
 * Minimum password length.
 *
 * NIST SP 800-63B favours length over composition rules — no forced
 * upper/lower/digit/symbol mix, which mostly produces `Password1!` and a sticky
 * note. Length plus a common-password check is the stronger pairing.
 */
export const PASSWORD_MIN_LENGTH = 10

/**
 * Maximum password length, in **bytes**, not characters.
 *
 * bcrypt silently truncates its input at 72 bytes. Left unchecked, every
 * password sharing the same first 72 bytes authenticates the same account, and
 * nothing anywhere reports a problem. Rejecting at the boundary is the honest
 * behaviour: a user who types a 200-character passphrase should be told it was
 * too long, not quietly given 72 bytes of it.
 *
 * Bytes rather than characters because the limit is on the UTF-8 encoding —
 * "🧠" is one character and four bytes.
 */
export const PASSWORD_MAX_BYTES = 72

/** Emails longer than this are rejected before they reach the database. */
export const EMAIL_MAX_LENGTH = 254

/**
 * Passwords rejected regardless of length.
 *
 * Deliberately tiny. A real deployment should check against a breach corpus
 * (k-anonymity against Have I Been Pwned, or a local zxcvbn dictionary); this
 * list only stops the handful that show up in casual testing and would be
 * embarrassing to accept. It is not a security control on its own.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '1234567890',
  '12345678901',
  '123456789012',
  'qwertyuiop',
  'letmein123',
  'iloveyou123',
  'welcome123',
  'admin12345',
  'abc123456789',
  'changeme123',
])

/**
 * UTF-8 byte length.
 *
 * Computed arithmetically from code points rather than via `TextEncoder`,
 * because this package compiles against `lib: ES2022` with no DOM and no
 * `@types/node` — it has to run unchanged in a browser bundle and in the API
 * process. Reaching for a platform global here would tie `shared/` to one of
 * them.
 *
 * The four ranges are UTF-8's own encoding boundaries. Surrogate pairs are
 * handled by iterating code points (the string iterator is code-point aware),
 * so an astral character is counted once as 4 bytes rather than twice as 3.
 */
export function passwordByteLength(password: string): number {
  let bytes = 0
  for (const char of password) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code <= 0xffff) bytes += 3
    else bytes += 4
  }
  return bytes
}

export type PasswordProblem =
  | { code: 'TOO_SHORT'; message: string }
  | { code: 'TOO_LONG'; message: string }
  | { code: 'TOO_COMMON'; message: string }
  | { code: 'ALL_WHITESPACE'; message: string }

/**
 * Returns the first problem with a password, or `null` if it passes.
 *
 * Returns rather than throws so the frontend can render it beside the field and
 * the backend can map it onto a 400 — the same check reaching two very
 * different consumers.
 */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.trim().length === 0) {
    return { code: 'ALL_WHITESPACE', message: 'Password cannot be only whitespace.' }
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      code: 'TOO_SHORT',
      message: `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
    }
  }

  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) {
    return {
      code: 'TOO_LONG',
      message: `Password is too long (limit is ${String(PASSWORD_MAX_BYTES)} bytes).`,
    }
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { code: 'TOO_COMMON', message: 'That password is too common. Choose another.' }
  }

  return null
}

/**
 * Canonical storage form for an email address.
 *
 * The column is CITEXT so uniqueness is already case-insensitive at the database
 * level; normalising here as well means the value we store is the value we
 * compare and the value we show back, rather than whatever casing the user
 * happened to type at registration.
 *
 * Note this does *not* strip dots or `+tags` from Gmail addresses. Treating
 * `a.b+x@gmail.com` and `ab@gmail.com` as one account is a provider-specific
 * rule that breaks on every provider that doesn't share it.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

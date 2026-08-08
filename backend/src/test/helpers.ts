import { randomBytes } from 'node:crypto'
import request, { type Response } from 'supertest'
import { REFRESH_COOKIE_NAME } from '../auth/cookies.js'
import { LoggingEmailProvider, emailProvider } from '../auth/email.js'
import { prisma } from '../db/client.js'

/**
 * Shared helpers for the integration suites.
 *
 * Not named `*.test.ts` on purpose — vitest's `include` would collect it as a
 * suite with no tests in it.
 *
 * These tests run against the **development database**, the same one `pnpm dev`
 * uses, because that is what `vitest.config.ts` points DATABASE_URL at. So
 * nothing here truncates a table: every helper is scoped to rows it created
 * itself, keyed by a per-run email suffix. A `TRUNCATE users` would take the
 * developer's own account with it.
 */

/** Unique per run, so a crashed suite cannot collide with the next one. */
const RUN_ID = randomBytes(4).toString('hex')

let counter = 0

/** A fresh address nothing else in the database can own. */
export function testEmail(label = 'user'): string {
  counter += 1
  return `saulado-${label}-${RUN_ID}-${String(counter)}@test.saulado.local`
}

/** Meets the shared password policy: >= 10 chars, not in the common list. */
export const TEST_PASSWORD = 'orbit-badger-97-quilt'

/**
 * Deletes the users this run created, and with them — via `onDelete: Cascade` on
 * every child model — their settings, refresh tokens and password resets.
 */
export async function cleanupTestUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { contains: `-${RUN_ID}-` } } })
}

/**
 * The raw refresh token from a `Set-Cookie` header.
 *
 * Returns null when the header is absent and '' when the cookie is being
 * cleared, because those are different outcomes: logout must clear, a rejected
 * login must not set anything at all.
 */
export function refreshCookie(res: Response): string | null {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  if (!header) return null

  const cookies = Array.isArray(header) ? header : [header]
  const found = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))
  if (found === undefined) return null

  return decodeURIComponent(found.slice(REFRESH_COOKIE_NAME.length + 1).split(';')[0] ?? '')
}

/** The full Set-Cookie line, for asserting HttpOnly / Path / SameSite. */
export function refreshCookieHeader(res: Response): string | null {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  if (!header) return null

  const cookies = Array.isArray(header) ? header : [header]
  return cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? null
}

/** Formats a token for a request's `Cookie` header. */
export function asCookie(token: string): string {
  return `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`
}

/**
 * The outbox of the logging email provider.
 *
 * Throws rather than skipping if a real provider is configured: silently passing
 * the reset tests without asserting anything would be worse, and a RESEND_API_KEY
 * in a test environment means the suite is about to mail strangers.
 */
export function outbox(): LoggingEmailProvider['outbox'] {
  if (!(emailProvider instanceof LoggingEmailProvider)) {
    throw new Error(
      `Reset tests need the logging email provider, got "${emailProvider.name}". ` +
        'Unset RESEND_API_KEY before running the suite.',
    )
  }
  return emailProvider.outbox
}

/**
 * Registers a throwaway user and returns their access token.
 *
 * The sets and cards suites need an owner for almost every assertion, and two of
 * them need a *second* owner to prove isolation. Taking the token from the
 * register response rather than logging in afterwards keeps it to one request.
 */
export async function registerTestUser(
  app: Parameters<typeof request>[0],
  label = 'owner',
): Promise<{ userId: string; email: string; token: string }> {
  const email = testEmail(label)
  const res = await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD })

  if (res.status !== 201) {
    throw new Error(`register failed (${String(res.status)}): ${JSON.stringify(res.body)}`)
  }

  const body = res.body as { user: { id: string }; accessToken: string }
  return { userId: body.user.id, email, token: body.accessToken }
}

/** The `?token=` value out of a reset email body. */
export function resetTokenFrom(text: string): string {
  const match = /[?&]token=([^\s&]+)/.exec(text)
  if (!match?.[1]) throw new Error(`No reset token in email body:\n${text}`)
  return decodeURIComponent(match[1])
}

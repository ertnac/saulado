import type { CookieOptions, Request, Response } from 'express'
import { env } from '../config/env.js'

/**
 * The refresh cookie.
 *
 * Cookie name prefixes are contracts the browser *enforces*: a cookie whose name
 * claims a prefix it does not satisfy is not downgraded, it is dropped entirely.
 * So the name has to follow from the attributes below, not the other way round.
 *
 * `__Host-` is the strongest prefix but demands path `/`, and we deliberately
 * scope this cookie to `/api/auth` — so it is off the table. `__Secure-` demands
 * only `Secure`, leaving path and domain free, which is exactly the guarantee
 * that still fits: it stops a network attacker on a sibling http:// origin from
 * overwriting the cookie.
 *
 * Unprefixed over plain http, because `__Secure-` without `Secure` is dropped —
 * and local dev has no TLS. Dev is the only place `cookieSecure` is false.
 */
export const REFRESH_COOKIE_NAME = env.cookieSecure ? '__Secure-saulado_rt' : 'saulado_rt'

const REFRESH_PATH = '/api/auth'

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    /**
     * Scoped to the auth routes rather than `/`. The cookie is only ever needed
     * by refresh and logout, so sending it on every API call is pure attack
     * surface — and with `SameSite=None` it would ride along on cross-site
     * requests to every endpoint.
     *
     * This scoping is why the name above cannot use `__Host-`; see there.
     */
    path: REFRESH_PATH,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  }
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  })
}

/**
 * Clearing must repeat the original attributes.
 *
 * A cookie is identified by (name, domain, path). `clearCookie` with different
 * options writes a *different* cookie with an expired date and leaves the real
 * one in place — a logout that appears to work and doesn't.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions())
}

export function readRefreshCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined
  const value = cookies?.[REFRESH_COOKIE_NAME]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Origin check for cookie-authenticated routes.
 *
 * `SameSite=None` is required in this deployment (see config/env.ts), and it
 * hands back the CSRF protection SameSite was providing. This replaces it: a
 * cross-site form post cannot set an `Origin` header of its choosing, so
 * requiring the header to be a known origin blocks the forged-request case.
 *
 * Requests with no Origin at all are allowed because non-browser clients (curl,
 * the test suite, server-to-server) legitimately omit it — and they are not the
 * threat model. CSRF is specifically an attack where a *browser* is tricked into
 * sending a request it already has cookies for, and browsers always send Origin
 * on cross-origin requests.
 */
export function hasAllowedOrigin(req: Request): boolean {
  const origin = req.get('origin')
  if (!origin) return true
  return env.corsOrigins.includes(origin)
}

// ── Native clients ──────────────────────────────────────────────────────────

/**
 * The header a native client sets to opt into body-carried refresh tokens.
 *
 * React Native cannot use the cookie above: there is no browser, Android's
 * OkHttp stack ignores `credentials: 'include'`, and cookie persistence across
 * app restarts is not guaranteed on either platform. So the token travels in
 * the JSON body instead and the app stores it in the OS keychain.
 */
const NATIVE_CLIENT_HEADER = 'x-saulado-client'
const NATIVE_CLIENT_VALUE = 'native'

/**
 * Whether to return the refresh token in the body instead of setting a cookie.
 *
 * This is a gate, not a hint, and it is the entire safety argument for putting
 * a long-lived credential in a response body. Without it every web response
 * would carry one too, where a browser cache, a proxy log, or a service worker
 * could retain it. Do not widen this to a user-agent sniff — an attacker
 * controls that header just as freely, but a cookie-bearing browser sending an
 * explicit opt-in header is not a request a cross-site page can forge.
 *
 * What makes the native path safe once the token is out is already built:
 * `rotateSession` replaces the token on every use and treats a second
 * presentation of a spent one as theft, revoking the whole family. A stolen
 * token is usable once before it burns itself and logs the attacker out.
 */
export function isNativeClient(req: Request): boolean {
  return req.get(NATIVE_CLIENT_HEADER) === NATIVE_CLIENT_VALUE
}

/**
 * The presented refresh token, from the body for native clients and the cookie
 * for everyone else.
 *
 * Native first, and only when the header says so. Reading the body
 * unconditionally would let a cross-site page supply a token of its own
 * choosing on a route that also accepts cookies — the confused-deputy shape
 * this whole design exists to avoid.
 */
export function readRefreshToken(req: Request): string | null {
  if (isNativeClient(req)) {
    const body = req.body as { refreshToken?: unknown } | undefined
    const token = body?.refreshToken
    return typeof token === 'string' && token.length > 0 ? token : null
  }
  return readRefreshCookie(req)
}

/**
 * Issues the refresh token by whichever transport the client asked for.
 *
 * Returns the token for native callers to merge into their JSON body, and
 * `undefined` for web, where it has already been written as a cookie. Exactly
 * one transport runs per request — a native response must not also carry a
 * `Set-Cookie`, or the token exists in two places with one lifetime.
 */
export function issueRefreshToken(req: Request, res: Response, token: string): string | undefined {
  if (isNativeClient(req)) return token
  setRefreshCookie(res, token)
  return undefined
}

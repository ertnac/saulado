import { jwtVerify, SignJWT } from 'jose'
import type { AccessTokenClaims } from '@saulado/shared'
import { env } from '../config/env.js'

/**
 * Access tokens.
 *
 * `jose` rather than `jsonwebtoken`: this package is native ESM, and
 * jsonwebtoken is CommonJS with a callback API that has to be promisified at
 * every call site. jose is also the library that tracks the JOSE RFCs, which
 * matters if this ever grows to asymmetric keys or key rotation.
 *
 * The token carries only `sub`. It is not a cache of the user record — every
 * field baked in here is a field that can be stale for the token's whole
 * lifetime, and a revoked or downgraded account should not keep its old
 * permissions for 15 minutes because they were copied into a JWT.
 */

const ALGORITHM = 'HS256'
const ISSUER = 'saulado'
const AUDIENCE = 'saulado-app'

const secret = new TextEncoder().encode(env.JWT_SECRET)

export const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MINUTES * 60

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${String(env.ACCESS_TOKEN_TTL_MINUTES)}m`)
    .sign(secret)
}

export type VerifyResult =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' }

/**
 * Verifies signature, expiry, issuer and audience.
 *
 * Distinguishes expired from invalid because the client acts on them
 * differently: expired means "try a silent refresh", invalid means "this token
 * is garbage, send the user to login". Collapsing both into one error makes the
 * frontend retry refreshes that can never succeed.
 */
export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    })

    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return { ok: false, reason: 'invalid' }
    }

    return {
      ok: true,
      claims: { sub: payload.sub, iat: payload.iat ?? 0, exp: payload.exp },
    }
  } catch (err) {
    const code = (err as { code?: string }).code
    return {
      ok: false,
      reason: code === 'ERR_JWT_EXPIRED' ? 'expired' : 'invalid',
    }
  }
}

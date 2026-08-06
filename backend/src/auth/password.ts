import bcrypt from 'bcrypt'
import { env } from '../config/env.js'

/**
 * A valid bcrypt hash of a value no user can produce.
 *
 * Used to keep login timing flat when the email does not exist. Without it,
 * "unknown email" returns in ~1 ms while "known email, wrong password" takes the
 * full bcrypt cost — a difference an attacker can measure to enumerate accounts,
 * which is exactly what the generic INVALID_CREDENTIALS message exists to
 * prevent. Doing the comparison anyway makes both paths cost the same.
 *
 * Generated once at module load rather than hardcoded, so the cost factor always
 * matches the configured one.
 */
const DUMMY_HASH = bcrypt.hashSync('$never-a-real-password$', env.BCRYPT_ROUNDS)

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Burns the same time a real password check would.
 *
 * Call this on the "user not found" branch of login. The result is discarded —
 * only the elapsed time matters.
 */
export async function burnPasswordTiming(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH)
}

import { z } from 'zod'
import {
  checkPassword,
  EMAIL_MAX_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_BYTES,
} from '@saulado/shared'

/**
 * Request schemas.
 *
 * Built from the shared policy rather than restating it, so the frontend's
 * inline validation and the server's enforcement cannot disagree.
 */

const email = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(EMAIL_MAX_LENGTH, 'Email is too long.')
  .email('Enter a valid email address.')
  .transform(normalizeEmail)

/**
 * Password field for *setting* a password. Runs the full policy.
 *
 * `.max` before `.superRefine` keeps a pathological multi-megabyte body from
 * being byte-counted at all.
 */
const newPassword = z
  .string()
  .min(1, 'Password is required.')
  .max(PASSWORD_MAX_BYTES * 4, 'Password is too long.')
  .superRefine((value, ctx) => {
    const problem = checkPassword(value)
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem.message })
  })

/**
 * Password field for *proving* a password.
 *
 * Deliberately does not apply the policy. Login must accept anything the user
 * might type, or tightening the rules later would lock out every existing
 * account whose password no longer complies — and the "your password is too
 * short" response on a login form tells an attacker their guess was the wrong
 * shape.
 */
const existingPassword = z.string().min(1, 'Password is required.').max(1024)

export const registerSchema = z.object({ email, password: newPassword })
export const loginSchema = z.object({ email, password: existingPassword })
export const forgotPasswordSchema = z.object({ email })
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.').max(512),
  password: newPassword,
})

/**
 * Re-exported for `account.schemas.ts`, which needs the same two fields for
 * changing an email or a password. Exported rather than duplicated so a change
 * to the email normalisation or the password policy reaches both routes.
 */
export { email as emailSchema, newPassword as passwordSchema }

export type RegisterBody = z.infer<typeof registerSchema>
export type LoginBody = z.infer<typeof loginSchema>
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>

import { z } from 'zod'
import {
  BLANK_WIDTH_MODES,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NEW_CARDS_PER_DAY_MAX,
  NEW_CARDS_PER_DAY_MIN,
  ACCOUNT_DELETE_CONFIRMATION,
  isValidTimeZone,
} from '@saulado/shared'
import { emailSchema, passwordSchema } from './auth.schemas.js'

/**
 * Request schemas for settings and account management (plan §6.4, §6.5).
 *
 * Bounds come from `@saulado/shared` so the number inputs and the API agree.
 */

export const updateSettingsSchema = z
  .object({
    darkMode: z.boolean().optional(),
    dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
    newCardsPerDay: z
      .number()
      .int()
      .min(NEW_CARDS_PER_DAY_MIN)
      .max(NEW_CARDS_PER_DAY_MAX)
      .optional(),
    notificationsEnabled: z.boolean().optional(),
    typoTolerance: z.boolean().optional(),
    blankWidthMode: z.enum(BLANK_WIDTH_MODES).optional(),
    /**
     * Validated against the runtime's own zone database, not a regex.
     *
     * An unrecognised zone is not a cosmetic problem: every due date, streak and
     * day boundary is computed in it, and `Intl` throws a `RangeError` on an
     * unknown name. Storing one would 500 every study route for that user, from
     * a screen with no way to fix it. `loadSettings` also falls back to UTC on
     * read — belt and braces, because a bad value could still arrive from a
     * restore or a seed script.
     */
    timezone: z.string().refine(isValidTimeZone, 'Not a timezone this server knows.').optional(),
    nickname: z.string().max(30).optional(),
    profileImage: z.string().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one setting to update.',
  })

/**
 * Re-authentication, required by every account mutation.
 *
 * Not `passwordSchema`: the current password was set under whatever policy was
 * in force when it was chosen, and running today's rules over it would lock out
 * anyone whose password predates a tightening. Only length is checked, and only
 * to keep an empty string out of bcrypt.
 */
const currentPassword = z.string().min(1, 'Enter your current password.').max(200)

export const changeEmailSchema = z.object({
  email: emailSchema,
  currentPassword,
})

/**
 * No password here, unlike every other account mutation.
 *
 * The token is the credential: it was mailed to the new address and proves the
 * holder can read it, which is the fact this step exists to establish. Requiring
 * the password again would mean the confirmation link only works in a
 * signed-in session — and the natural way to open mail sent to a *new* address
 * is on whatever device that mailbox is on, which is often not the signed-in
 * one. The dangerous half of the change was already gated: `POST /email`
 * demanded the password before this token was ever issued.
 */
export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1, 'Confirmation token is required.').max(512),
})

export const changePasswordSchema = z
  .object({
    currentPassword,
    newPassword: passwordSchema,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'That is already your password.',
    path: ['newPassword'],
  })

export const deleteAccountSchema = z.object({
  currentPassword,
  /**
   * Checked here as well as in the UI. A client-side confirmation is a
   * suggestion — `DELETE /api/account` is one curl away regardless of what the
   * form does, and this is the one irreversible action in the product.
   */
  confirmation: z.literal(ACCOUNT_DELETE_CONFIRMATION, {
    errorMap: () => ({ message: `Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm.` }),
  }),
})

export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>
export type ChangeEmailBody = z.infer<typeof changeEmailSchema>
export type ConfirmEmailChangeBody = z.infer<typeof confirmEmailChangeSchema>
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>
export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>

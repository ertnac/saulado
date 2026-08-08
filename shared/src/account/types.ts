import type { BlankWidthMode, PublicUser, UserSettings } from '../auth/types.js'
import type { CardAnswer } from '../cloze/types.js'
import type { SetColor } from '../cards/limits.js'

/**
 * Wire contracts for settings and account management (plan §6, sub-phases
 * 6.2–6.3).
 *
 * Types only, no Zod — same rule as the rest of `shared`.
 *
 * {@link UserSettings} itself lives in `auth/types.ts`, because it ships inside
 * `AuthResponse` on login. Only the *mutations* are here.
 */

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * PATCH semantics: every field optional, absent means "leave alone".
 *
 * No field is nullable, unlike `UpdateSetRequest.description` — every setting
 * has a real default and none of them can be cleared to nothing. "No timezone"
 * is not a state; it just means UTC, which is a value.
 */
export interface UpdateSettingsRequest {
  darkMode?: boolean
  dailyGoal?: number
  newCardsPerDay?: number
  notificationsEnabled?: boolean
  typoTolerance?: boolean
  blankWidthMode?: BlankWidthMode
  /** IANA zone name. Rejected if the runtime does not recognise it. */
  timezone?: string
}

export interface SettingsResponse {
  settings: UserSettings
}

/**
 * Bounds on the two numeric settings.
 *
 * Shared so the number input and the API agree. Zero is excluded from both: a
 * daily goal of zero makes the progress ring a divide-by-zero, and zero new
 * cards a day means a set can be added and never studied, with no feedback
 * explaining why.
 */
export const DAILY_GOAL_MIN = 1
export const DAILY_GOAL_MAX = 500
export const NEW_CARDS_PER_DAY_MIN = 1
export const NEW_CARDS_PER_DAY_MAX = 200

// ── Account ─────────────────────────────────────────────────────────────────

/**
 * Changing the email address.
 *
 * The current password is required even though the caller already holds a valid
 * access token. A token proves the session was authenticated at some point; it
 * does not prove the person holding it right now is the account owner. Email is
 * the password-reset channel, so an attacker who changes it owns the account
 * permanently — this is the single most valuable field to protect, and
 * re-authentication is the cheapest way to protect it.
 *
 * This request does **not** change the address. It sends a link to the new one,
 * and only {@link ConfirmEmailChangeRequest} applies the change — see that type
 * for why the two-step matters.
 */
export interface ChangeEmailRequest {
  email: string
  currentPassword: string
}

/**
 * Completing the change, from the link mailed to the new address.
 *
 * The two-step exists because of typos, not attackers. Applying the new address
 * on request means one transposed character silently moves the account to a
 * mailbox the user does not own: they cannot log in (they will type the address
 * they meant) and they cannot reset (the link goes to the typo). The account is
 * gone, from a form with no undo.
 *
 * Requiring the link to be clicked makes a typo a non-event — nothing happens,
 * the old address keeps working, and the user tries again.
 */
export interface ConfirmEmailChangeRequest {
  token: string
}

/**
 * Changing the password.
 *
 * Same reasoning as {@link ChangeEmailRequest}, plus one more: without the
 * current password, anyone with a borrowed token could lock the real owner out
 * by rotating the credential.
 */
export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

/**
 * Deleting the account.
 *
 * Two independent gates, because this is the one irreversible action in the
 * product:
 *
 * - `currentPassword` proves who is asking.
 * - `confirmation` proves they meant it. Typing the literal word is friction on
 *   purpose — a confirm dialog is dismissed by muscle memory, and the whole
 *   point is to interrupt that.
 */
export interface DeleteAccountRequest {
  currentPassword: string
  /** Must equal {@link ACCOUNT_DELETE_CONFIRMATION}, case-sensitively. */
  confirmation: string
}

/**
 * The word the user types to confirm deletion.
 *
 * Case-sensitive and checked server-side. A client-only check is a suggestion,
 * not a gate — `DELETE /api/account` is one curl away regardless of what the
 * form does.
 */
export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE'

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * The full data export (plan §6: *"Export and delete aren't polish"*).
 *
 * Two obligations in one file. The legal one is GDPR Art. 20 — data portability,
 * in "a structured, commonly used and machine-readable format". The practical
 * one matters more day to day: it is the thing that makes leaving cheap, and a
 * product that is cheap to leave is one people are willing to commit to.
 *
 * **What is deliberately absent: the password hash, session tokens and reset
 * tokens.** They are credentials, not personal data — a bcrypt hash in a file
 * sitting in someone's Downloads folder is an offline cracking target with no
 * upside to the person it belongs to.
 *
 * Answer *text* is present. It is the user's own writing, and an export that
 * omits it exports cards nobody can restore.
 */
export interface DataExport {
  /**
   * Bumped when a field is removed or changes meaning; adding one is not a
   * breaking change. Present from v1 so a future importer never has to guess
   * whether an unversioned file predates versioning.
   */
  formatVersion: 1
  /** ISO timestamp the export was generated. */
  exportedAt: string
  account: PublicUser
  settings: UserSettings
  sets: ExportedSet[]
  reviews: ExportedReview[]
  dailyStats: ExportedDayStat[]
}

export interface ExportedSet {
  id: string
  title: string
  description: string | null
  color: SetColor
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  cards: ExportedCard[]
}

/**
 * A card, with its schedule folded in.
 *
 * Nested under its set rather than listed flat, because the export doubles as
 * the human-readable copy — a flat card list keyed by `studySetId` is
 * machine-equivalent and unreadable.
 */
export interface ExportedCard {
  id: string
  title: string
  paragraph: string
  answers: CardAnswer[]
  tags: string[]
  createdAt: string
  updatedAt: string
  /** Null when the card has never been studied. */
  schedule: ExportedSchedule | null
}

export interface ExportedSchedule {
  /** `YYYY-MM-DD`. */
  dueAt: string
  intervalDays: number
  easeFactor: number
  repetitions: number
  lapses: number
  lastReviewedAt: string | null
}

/**
 * One review.
 *
 * Flat rather than nested under its card: the review log is the largest table by
 * far, and nesting it would make a card's entry grow without bound. `cardId`
 * refers into `sets[].cards[]`.
 */
export interface ExportedReview {
  cardId: string
  grade: number
  correct: boolean
  reviewedAt: string
  durationMs: number | null
}

export interface ExportedDayStat {
  /** `YYYY-MM-DD` in the timezone the user had at the time. */
  day: string
  reviews: number
  correct: number
  goalMet: boolean
}

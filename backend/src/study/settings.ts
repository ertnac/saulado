import type { UserSettings } from '@saulado/shared'
import { dayKeyInZone, isValidTimeZone, type DayKey } from '@saulado/shared'
import { prisma } from '../db/client.js'

/**
 * Reading a user's study settings.
 *
 * `user_settings` is created alongside the user, so the row should always exist.
 * "Should" is doing a lot of work in a system with migrations, restores and
 * seed scripts, though, and a missing settings row must not be the reason a
 * study session 500s — the defaults here are the same ones the column defaults
 * carry, so a user with no row studies identically to one with a default row.
 */

export const DEFAULT_SETTINGS: UserSettings = {
  darkMode: false,
  dailyGoal: 20,
  newCardsPerDay: 10,
  notificationsEnabled: true,
  typoTolerance: true,
  blankWidthMode: 'fixed',
  timezone: 'UTC',
}

export async function loadSettings(userId: string): Promise<UserSettings> {
  const row = await prisma.userSettings.findUnique({ where: { userId } })
  if (!row) return DEFAULT_SETTINGS

  return {
    darkMode: row.darkMode,
    dailyGoal: row.dailyGoal,
    newCardsPerDay: row.newCardsPerDay,
    notificationsEnabled: row.notificationsEnabled,
    typoTolerance: row.typoTolerance,
    blankWidthMode: row.blankWidthMode === 'proportional' ? 'proportional' : 'fixed',
    /**
     * A zone the runtime does not recognise falls back to UTC rather than
     * throwing. `Intl` rejects an unknown zone with a `RangeError`, and a stale
     * or mistyped value in one row would otherwise take down every study route
     * for that user with a 500 they cannot fix from the UI.
     */
    timezone: isValidTimeZone(row.timezone) ? row.timezone : 'UTC',
  }
}

/** The user's own "today" — the day boundary every due check is measured from. */
export function todayFor(settings: UserSettings, now: Date = new Date()): DayKey {
  return dayKeyInZone(now, settings.timezone)
}

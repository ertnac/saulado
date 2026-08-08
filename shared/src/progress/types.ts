import type { DayKey } from '../study/day.js'

/**
 * Wire contracts for the dashboard and the progress views (plan §5.1).
 *
 * Two endpoints, deliberately not one. `GET /api/dashboard` is on the critical
 * path of every app open and answers "what should I do now"; `GET /api/progress`
 * is a page the user navigates to and answers "how have I been doing". Folding
 * the second into the first would make the home screen wait on a 90-day scan it
 * does not render.
 *
 * The governing rule here is the mirror of the study contracts' one: **a zero
 * and an absence are different facts, and the wire format must keep them
 * apart.** A user who studied nothing yesterday has `reviews: 0` for yesterday;
 * a user who had not signed up yet has no entry at all. Collapsing those makes
 * a new account render as a wall of failure (saulado-ux §5), so every series
 * here is explicit about which days it covers.
 */

// ── Day series ──────────────────────────────────────────────────────────────

/**
 * One day's activity.
 *
 * Always present for every day in the requested window, including days with no
 * reviews — a gap in a bar chart reads as missing data, a zero reads as a rest
 * day, and only one of those is true. {@link fillDaySeries} is what guarantees
 * it, so no caller has to remember.
 *
 * `correct` is a count rather than a percentage because a percentage of zero
 * reviews is not 0%, it is undefined, and the difference matters when averaging
 * a range. Accuracy is derived at the point of display, where the empty case
 * can be rendered honestly.
 */
export interface DayStat {
  day: DayKey
  reviews: number
  correct: number
  /**
   * Whether the day's goal was met, as snapshotted when it was earned.
   *
   * Never recomputed against the current goal: lowering the daily goal must not
   * retroactively award days the user did not earn, and raising it must not
   * revoke days they did.
   */
  goalMet: boolean
}

/**
 * A streak, and the honest version of it.
 *
 * `current` counts consecutive days with at least one review, ending either
 * today or yesterday. Yesterday counts because a streak is not broken until a
 * day passes *without* study — at 09:00 a user who studied every day for a
 * month has not yet studied today, and telling them their streak is 0 would be
 * both wrong and punitive (plan §5.2: avoid loss-framing).
 *
 * `studiedToday` is what lets the UI say "2 days" and "study today to keep it"
 * without implying the streak has already been lost.
 */
export interface StreakSummary {
  current: number
  longest: number
  studiedToday: boolean
}

// ── GET /api/dashboard ──────────────────────────────────────────────────────

/** A set the user touched recently, with enough to render a row and a CTA. */
export interface RecentSet {
  id: string
  title: string
  cardCount: number
  /** Due today, uncapped — the same figure the library badge shows. */
  dueCount: number
  /** Null for a set that has never been studied. */
  lastStudiedAt: string | null
}

/** Today, measured against the user's own goal. */
export interface TodayProgress {
  reviews: number
  correct: number
  /** The *current* goal, for the ring's denominator. */
  goal: number
  /** Latched when earned, so it cannot be revoked by changing the goal. */
  goalMet: boolean
}

/**
 * Everything the dashboard renders, in one response (plan §5.1 — "one request,
 * not six").
 *
 * Six round-trips on the critical path would be six chances to half-render, and
 * a dashboard that fills in piecemeal shifts layout under the user four times
 * before settling.
 */
export interface DashboardResponse {
  /** Due today across every non-archived set. Uncapped. */
  totalDue: number
  /** Cards never seen. Not folded into `totalDue` — new work is not a debt. */
  newCards: number
  /**
   * Whether this user has ever studied anything.
   *
   * The single discriminator between "caught up" and "nothing here yet", which
   * are identical in every other field and read completely differently.
   */
  hasStudied: boolean
  streak: StreakSummary
  today: TodayProgress
  recentSets: RecentSet[]
  /** Exactly 7 entries, oldest first, ending today. Gaps filled with zeroes. */
  sparkline: DayStat[]
}

// ── GET /api/progress ───────────────────────────────────────────────────────

/** The ranges the progress page offers. Closed set, validated server-side. */
export const PROGRESS_RANGES = ['7d', '30d', '90d', '365d'] as const
export type ProgressRange = (typeof PROGRESS_RANGES)[number]

export function isProgressRange(value: unknown): value is ProgressRange {
  return typeof value === 'string' && (PROGRESS_RANGES as readonly string[]).includes(value)
}

/** How many days each range covers, inclusive of today. */
export const RANGE_DAYS: Record<ProgressRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
}

/**
 * Per-set totals over the window.
 *
 * Scoped to the window rather than all-time so the table agrees with the charts
 * beside it. A set studied heavily last year and not since would otherwise
 * dominate a 7-day view.
 */
export interface SetProgress {
  studySetId: string
  title: string
  reviews: number
  correct: number
  /**
   * Distinct cards in the set reviewed at least once *within the window*.
   *
   * Window-scoped like `reviews`, not all-time. "18 of 24" beside a 7-day chart
   * means eighteen cards seen this week; counting every card ever scheduled
   * would report a number the charts next to it cannot account for.
   */
  cardsStudied: number
  cardCount: number
}

export interface ProgressResponse {
  range: ProgressRange
  /** One entry per day in the window, oldest first. Never sparse. */
  days: DayStat[]
  /** Window totals, so the client is not re-summing what the server just read. */
  totals: {
    reviews: number
    correct: number
    /** Days with at least one review. The denominator for "days studied". */
    activeDays: number
  }
  streak: StreakSummary
  perSet: SetProgress[]
}

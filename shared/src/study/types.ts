import type { Grade, MatchType, Segment } from '../cloze/types.js'
import type { DayKey } from './day.js'

/**
 * Wire contracts for study sessions.
 *
 * The governing rule, and the reason this file is not simply `StudyCard` reused:
 * **the answers must not reach the browser before the user submits.** Grading
 * happens on the server (plan §4.1), so a session card carries the paragraph's
 * *text around* the blanks and nothing that would let a reader in devtools
 * recover what goes in them.
 *
 * That is why `SessionCard` has `segments` rather than `paragraph` + `answers`.
 * Reusing `StudyCard` here would ship `answerText` for every queued card, and
 * the leak would be invisible — the UI would look identical.
 */

// ── The queue ───────────────────────────────────────────────────────────────

/**
 * A card as the study view sees it.
 *
 * `segments` is the output of `renderCloze`, computed server-side. Text
 * segments are safe: they are the paragraph *minus* the answers.
 *
 * A blank segment's `answerLength` is the **reserved slot width**, not
 * necessarily the true answer length. Under the default `fixed` blank width
 * mode the server normalises every blank on a card to one width, so per-blank
 * answer lengths never leave the server at all (plan §2.7 — a short blank rules
 * out `photosynthesis` before the user has thought about it). Under
 * `proportional`, which the user opts into, it is the real length.
 *
 * Either way the width is known *before* submission, which is what makes a
 * reveal possible without reflowing the paragraph.
 */
export interface SessionCard {
  cardId: string
  studySetId: string
  title: string
  segments: Segment[]
  blankCount: number
  tags: string[]
  /** No schedule row yet — this is the user's first sight of the card. */
  isNew: boolean
  /** `lapses >= LEECH_THRESHOLD`. Surfaced so the user can rewrite the card. */
  isLeech: boolean
}

/**
 * A session in progress.
 *
 * `queue` holds only what is *left*, so `GET /api/study/sessions/:id` after a
 * refresh returns a resumable session rather than a full queue the user has
 * already worked through (plan §4.2, interruption recovery). Progress lives on
 * the server for the same reason: a client-held counter dies with the tab.
 */
export interface StudySession {
  id: string
  /** `null` when studying across every set. */
  studySetId: string | null
  startedAt: string
  completedAt: string | null
  queue: SessionCard[]
  progress: SessionProgress
}

export interface SessionProgress {
  /** Cards answered, counting a re-queued `again` card once per attempt. */
  answered: number
  /** Distinct cards planned for the session. Drives the `7 / 24` display. */
  total: number
  correct: number
}

// ── Submitting an answer ────────────────────────────────────────────────────

export interface BlankSubmission {
  ordinal: number
  submitted: string
}

export interface SubmitAnswerRequest {
  cardId: string
  blanks: BlankSubmission[]
  /** Time on this card. Recorded for the summary; `null` if unmeasured. */
  durationMs?: number | null
  /**
   * The "reveal answers" escape hatch. Grades `again` regardless of what is in
   * the inputs — a revealed card was not recalled, and letting a correct-looking
   * submission ride along with a reveal would inflate the schedule.
   */
  revealed?: boolean
  /**
   * Client-generated, one per card attempt.
   *
   * A double-tap on a phone, or a retry after a flaky connection, must not book
   * two reviews for one recall. Replaying a key returns the first result
   * verbatim and writes nothing.
   */
  idempotencyKey: string
}

/** One blank's verdict. Every blank is recorded, whatever the card grade. */
export interface BlankResult {
  ordinal: number
  submitted: string
  correct: boolean
  matchType: MatchType
  /**
   * The primary spelling — shown for `typo` (so the user learns the correct
   * form) and for `wrong` (so the reveal is useful). Safe to send *now*: the
   * answer has been submitted.
   */
  canonical: string
}

export interface AnswerResponse {
  results: BlankResult[]
  /** Derived server-side by `gradeCard`, or forced to `again` by a reveal. */
  grade: Grade
  correct: boolean
  /** When the card comes back, as a calendar day in the user's timezone. */
  dueAt: DayKey
  intervalDays: number
  /** Crossed `LEECH_THRESHOLD` on this review. */
  isLeech: boolean
  /** The card was pushed back into this session's queue for another attempt. */
  requeued: boolean
  progress: SessionProgress
}

// ── Finishing ───────────────────────────────────────────────────────────────

export interface SessionCardRef {
  cardId: string
  title: string
}

export interface SessionSummary {
  sessionId: string
  startedAt: string
  completedAt: string
  /** Distinct cards answered. A re-queued card counts once. */
  cardsSeen: number
  correctCards: number
  /** `0 … 1`. Zero cards seen gives `0`, never `NaN`. */
  accuracy: number
  durationMs: number
  /** Graded `again` or `hard` — the cards worth another look today. */
  toRevisit: SessionCardRef[]
  /** Reviews today across *all* sessions, against the user's goal. */
  reviewsToday: number
  dailyGoal: number
  goalMet: boolean
}

// ── Requests and responses ──────────────────────────────────────────────────

export interface StartSessionRequest {
  /** Omit to study every set. */
  studySetId?: string
}

export interface SessionResponse {
  session: StudySession
}

export interface SummaryResponse {
  summary: SessionSummary
}

/** Per-set due counts for the library's "Study" affordance. */
export interface DueCount {
  studySetId: string
  due: number
  newCards: number
}

export interface DueCountsResponse {
  counts: DueCount[]
  /**
   * Cards due across every set, *uncapped* and excluding new cards.
   *
   * This answers "how much is waiting", not "how much will this session serve".
   * Showing the capped figure would make a 300-card backlog read as whatever the
   * cap happens to be and look like it was shrinking on its own; folding in new
   * cards would make a freshly imported set read as overdue on day one.
   */
  totalDue: number
  /**
   * Cards this user has a schedule row for — i.e. has studied at least once.
   *
   * `counts` only carries sets with something due or new, so it is empty both for
   * a user who is caught up and for one who has never studied. Those two states
   * read completely differently ("caught up for today" is an achievement;
   * "nothing to study yet" is an invitation), and nothing else in the response
   * tells them apart.
   */
  scheduledCards: number
}

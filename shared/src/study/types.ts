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

// ── Modes ───────────────────────────────────────────────────────────────────

/**
 * How a session picks and orders its cards.
 *
 * - `spaced` — due cards plus interleaved new ones, capped. The scheduler's own
 *   session, reached from the dashboard.
 * - `sequential` — every card in the set subtree, in creation order. "Learn this
 *   set top to bottom."
 * - `shuffled` — the same pool, randomised. Tests recall rather than sequence.
 * - `retake` — a practice pass over the cards a prior session left blank.
 *   Records nothing.
 */
export type SessionMode = 'spaced' | 'sequential' | 'shuffled' | 'retake'

/**
 * The modes a client may ask for by name.
 *
 * `retake` is absent deliberately: a retake session is derived from
 * `retakeOf`, so a client cannot start one over an arbitrary pool and have it
 * silently skip recording.
 */
export type StartableMode = Exclude<SessionMode, 'retake'>

// ── The queue ───────────────────────────────────────────────────────────────

/**
 * The answering mode the user has selected for the session.
 */
export type AnsweringType = 'identification' | 'multiple-choice'

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
  segments: Segment[]
  blankCount: number
  tags: string[]
  /** No schedule row yet — this is the user's first sight of the card. */
  isNew: boolean
  /** `lapses >= LEECH_THRESHOLD`. Surfaced so the user can rewrite the card. */
  isLeech: boolean
  /**
   * Available choices for each blank when studying in multiple-choice mode.
   * `blankOptions[0]` contains the choices for the first blank.
   */
  blankOptions?: string[][]
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
  /** Which source built this queue. Needed to resume into the right mode. */
  mode: SessionMode
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
  /**
   * The set the card lives in, because that is where it is now opened.
   *
   * Per-ref rather than reusing the session's own `studySetId`: a session
   * started without one sweeps every set, and one started *with* one sweeps the
   * whole subtree — so in both cases the cards worth revisiting can come from
   * several different sets, and the session's id would send half these links to
   * the wrong page.
   */
  studySetId: string
  /**
   * A one-line label, derived server-side with `cardLabel(paragraph)`.
   *
   * Derived rather than shipping the paragraph: the summary lists every card
   * answered in the session, and a full paragraph per row is both far more bytes
   * than the row renders and the answers' surrounding context arriving after the
   * user has already been graded on it.
   */
  label: string
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
  /**
   * Which method produced this session.
   *
   * The summary screen reads it to caption a practice pass honestly: a retake's
   * Cards and Correct tiles are real counts of a pass that changed nothing, and
   * without a caption they read as progress the user did not earn.
   */
  mode: SessionMode
  /**
   * Cards the user left at least one blank empty on — the retake candidates.
   *
   * Distinct from {@link SessionSummary.toRevisit}, which is about *grades*: a
   * card answered wrong is worth revisiting but was attempted, and the user
   * already has their verdict on it. These were not attempted at all, which is
   * a different offer ("finish these") and a different pass (practice only).
   *
   * Always empty for a `retake` session — nothing it does is recorded, so there
   * is nothing to build a second list from.
   */
  unanswered: SessionCardRef[]
  /** Reviews today across *all* sessions, against the user's goal. */
  reviewsToday: number
  dailyGoal: number
  goalMet: boolean
}

// ── Requests and responses ──────────────────────────────────────────────────

export interface StartSessionRequest {
  /** Omit to study every set. Required for `sequential` and `shuffled`. */
  studySetId?: string
  /** Defaults to `spaced` server-side. */
  mode?: StartableMode
  /**
   * Start a retake pass over this session's unanswered cards.
   *
   * Mutually exclusive with `mode` — the server derives `retake` from this,
   * rather than trusting a client to name a mode that records nothing.
   */
  retakeOf?: string
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
  /**
   * One entry per set with something waiting, counting its **whole subtree**.
   *
   * A set's badge has to match what pressing Study next to it will serve, and
   * studying a set sweeps its descendants — so a parent holding no cards of its
   * own still reports its children's. This makes the entries deliberately
   * non-additive: a card in a grandchild appears in three of them. Use
   * {@link DueCountsResponse.totalDue} and {@link DueCountsResponse.totalNew}
   * for aggregates rather than summing this list.
   */
  counts: DueCount[]
  /**
   * Cards due across every set, *uncapped* and excluding new cards.
   *
   * This answers "how much is waiting", not "how much will this session serve".
   * Showing the capped figure would make a 300-card backlog read as whatever the
   * cap happens to be and look like it was shrinking on its own; folding in new
   * cards would make a freshly imported set read as overdue on day one.
   *
   * Summed from per-set *own* counts, so each card is counted exactly once.
   */
  totalDue: number
  /**
   * Never-studied cards across every set. Counted once each, as above.
   *
   * Separate from `totalDue` because they are different kinds of work: due cards
   * are a debt, new cards are an opportunity. The dashboard shows them as two
   * figures for that reason.
   */
  totalNew: number
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

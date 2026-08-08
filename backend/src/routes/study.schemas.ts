import { ANSWERS_MAX_PER_CARD } from '@saulado/shared'
import { z } from 'zod'

/**
 * Request schemas for study sessions.
 *
 * The interesting one is `submitAnswerSchema`. Everything the client sends about
 * a review is untrusted — including, notably, the grade, which is *not* in this
 * schema at all. A client that could name its own grade could mark every card
 * `easy` and push its whole deck a year out; grading is derived server-side from
 * the submitted text (see `study/grading.ts`).
 */

export const startSessionSchema = z.object({
  /** Omit to study across every set. */
  studySetId: z.string().uuid('Not a valid set id.').optional(),
})

const blankSubmission = z.object({
  ordinal: z.number().int('Not a valid blank.').min(0),
  /**
   * Not trimmed or normalised here.
   *
   * `checkAnswer` normalises both sides itself, and doing it early would hide
   * what the user actually typed — `results[].submitted` is echoed back into the
   * feedback UI, and showing someone a tidied version of their own answer beside
   * the verdict is confusing when the verdict is "wrong".
   */
  submitted: z.string().max(500, 'That answer is too long.'),
})

export const submitAnswerSchema = z.object({
  cardId: z.string().uuid('Not a valid card id.'),
  blanks: z
    .array(blankSubmission)
    .max(ANSWERS_MAX_PER_CARD, 'That is more blanks than a card can have.'),
  /**
   * Bounded because it is client-reported and lands in the summary's total.
   *
   * A negative or absurd value would not corrupt scheduling — nothing reads it
   * back — but it would make "you studied for 4,000 hours" a thing the summary
   * can say. The cap is one hour, which is far longer than any single card.
   */
  durationMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  revealed: z.boolean().optional(),
  /**
   * Client-generated, one per card attempt.
   *
   * Shape-checked only. The server never parses it — it is compared for equality
   * against the last key stored on the session row, so any stable opaque string
   * works. The cap keeps an unbounded string out of a `WHERE`.
   */
  idempotencyKey: z.string().min(8, 'Not a valid request key.').max(128),
})

export type StartSessionBody = z.infer<typeof startSessionSchema>
export type SubmitAnswerBody = z.infer<typeof submitAnswerSchema>

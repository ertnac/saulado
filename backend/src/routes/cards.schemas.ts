import { z } from 'zod'
import {
  ALT_ANSWERS_MAX_PER_ANSWER,
  ALT_ANSWER_MAX_LENGTH,
  ANSWERS_MAX_PER_CARD,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  PARAGRAPH_MAX_CODE_POINTS,
  PARAGRAPH_MIN_CODE_POINTS,
  SET_COLORS,
  SET_TITLE_MAX_LENGTH,
  TAGS_MAX_PER_CARD,
  TAG_MAX_LENGTH,
  codePointLength,
  normalizeParagraph,
  normalizeTags,
} from '@saulado/shared'

/**
 * Request schemas for sets and cards.
 *
 * Every bound comes from `@saulado/shared` rather than being restated here, so
 * the editor's live character counter and the server's rejection cannot
 * disagree. See `shared/src/cards/limits.ts` for why each number is what it is.
 */

const setTitle = z
  .string()
  .trim()
  .min(1, 'Give the set a title.')
  .max(SET_TITLE_MAX_LENGTH, `Keep the title under ${String(SET_TITLE_MAX_LENGTH)} characters.`)

/**
 * `null` moves the set to the root, an absent key leaves it where it is.
 *
 * `.nullable()` without `.optional()` would force every PATCH to send the field;
 * `.optional()` without `.nullable()` would trap a set inside its parent forever.
 * PATCH needs both, and the handler distinguishes them with an `in` check rather
 * than a truthiness test — `null` is a meaningful value here, not a missing one.
 *
 * Whether the parent exists, belongs to the caller, and leaves the set within
 * `SET_DEPTH_MAX` is `assertPlacement`'s job: none of it is answerable from the
 * request body alone.
 */
const setParentId = z.string().uuid('Not a valid set id.').nullable()

const setColor = z.enum(SET_COLORS)

export const createSetSchema = z.object({
  title: setTitle,
  parentId: setParentId.optional(),
  color: setColor.optional(),
})

export const updateSetSchema = z
  .object({
    title: setTitle.optional(),
    parentId: setParentId.optional(),
    color: setColor.optional(),
    archived: z.boolean().optional(),
  })
  // An empty PATCH is a client bug, not a no-op worth a 200: it usually means a
  // form serialised nothing. Rejecting it surfaces that instead of returning an
  // unchanged row and looking like success.
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to update.',
  })

/**
 * The paragraph, normalised before it is measured.
 *
 * Order matters. `normalizeParagraph` collapses CRLF to LF and applies NFC, both
 * of which change the code-point count — measuring first would reject a pasted
 * Windows paragraph that fits once normalised, and would let a decomposed one
 * through at the wrong length. Normalising here also means every offset the
 * client sent is validated against the exact string that gets stored.
 */
const paragraph = z
  .string()
  .min(1, 'Write the paragraph first.')
  // Cheap guard before the transform, so a multi-megabyte body is not
  // normalised and re-counted just to be thrown away.
  .max(PARAGRAPH_MAX_CODE_POINTS * 4, 'That paragraph is too long.')
  .transform(normalizeParagraph)
  .superRefine((value, ctx) => {
    const length = codePointLength(value)

    if (length < PARAGRAPH_MIN_CODE_POINTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Write the paragraph first.' })
      return
    }

    if (length > PARAGRAPH_MAX_CODE_POINTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `That paragraph is ${String(length)} characters — the limit is ${String(PARAGRAPH_MAX_CODE_POINTS)}.`,
      })
    }
  })

/**
 * One highlight as the client sends it: offsets and alternatives only.
 *
 * No `answerText`. The server slices the paragraph itself (plan §3.2), so a
 * client cannot claim the range covering "CPU" reads something else — and the
 * `validateAnswers` tripwire stays meaningful, since it compares server-derived
 * text against server-derived offsets rather than client data against itself.
 *
 * Bounds are checked against the paragraph in the handler, not here: at this
 * point the schema has the offsets but the whole-object refinement is where the
 * normalised paragraph and the offsets are both in scope.
 */
const answerInput = z.object({
  startOffset: z.number().int('Offsets must be whole numbers.').min(0),
  endOffset: z.number().int('Offsets must be whole numbers.').min(0),
  altAnswers: z
    .array(z.string().trim().min(1).max(ALT_ANSWER_MAX_LENGTH))
    .max(
      ALT_ANSWERS_MAX_PER_ANSWER,
      `Up to ${String(ALT_ANSWERS_MAX_PER_ANSWER)} alternatives per blank.`,
    )
    .optional(),
})

const answers = z
  .array(answerInput)
  .max(ANSWERS_MAX_PER_CARD, `A card can hold at most ${String(ANSWERS_MAX_PER_CARD)} blanks.`)

/**
 * Tags, canonicalised on the way in.
 *
 * `normalizeTags` lowercases, collapses inner whitespace and de-duplicates, so
 * "Cell Biology" and "cell  biology" cannot become two rows in the user's
 * autocomplete list. The cap is applied *after* normalisation — 20 tags that
 * collapse to 12 is a fine request, and counting first would reject it.
 */
const tags = z
  .array(z.string().max(TAG_MAX_LENGTH, `Keep tags under ${String(TAG_MAX_LENGTH)} characters.`))
  .transform(normalizeTags)
  .refine((list) => list.length <= TAGS_MAX_PER_CARD, {
    message: `Up to ${String(TAGS_MAX_PER_CARD)} tags per card.`,
  })

export const createCardSchema = z.object({
  paragraph,
  answers,
  tags: tags.optional(),
})

/**
 * PATCH for a card.
 *
 * `paragraph` and `answers` must arrive together when either changes: an edited
 * paragraph invalidates every stored offset, so accepting a new paragraph
 * against the old answers would persist exactly the corruption the offset model
 * exists to prevent. Re-anchoring happens client-side via `reanchorAnswers` so
 * the user can resolve orphans before saving; the server then re-derives and
 * re-validates from scratch.
 */
export const updateCardSchema = z
  .object({
    paragraph: paragraph.optional(),
    answers: answers.optional(),
    tags: tags.optional(),
    studySetId: z.string().uuid('Not a valid set id.').optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to update.',
  })
  .refine((body) => 'paragraph' in body === 'answers' in body, {
    message: 'Send the paragraph and its blanks together.',
    path: ['answers'],
  })

/**
 * Cursor pagination query.
 *
 * `limit` arrives as a string from the query string, so it is coerced then
 * bounded — without the ceiling, `?limit=100000` is a cheap way to make the
 * server serialise someone's whole library into one response.
 *
 * `cursor` is only shape-checked here, not decoded. It is base64url-encoded JSON
 * (see `encodeCursor`), so the character-class check is all a schema can usefully
 * say about it; whether the payload parses into a usable `(at, id)` pair is
 * `decodeCursor`'s job, and the handler turns a `null` from it into the same 400.
 * The length cap keeps a megabyte of base64 out of `JSON.parse`.
 */
export const listQuerySchema = z.object({
  cursor: z
    .string()
    .max(512, 'Not a valid cursor.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Not a valid cursor.')
    .optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
})

export const listSetsQuerySchema = listQuerySchema.extend({
  /**
   * Absent means active sets only.
   *
   * Archiving exists to get a set out of the way, so defaulting to "everything"
   * would defeat it. `?archived=true` asks for the archive specifically.
   */
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),

  /**
   * Which level of the tree to list. Absent means the roots.
   *
   * Roots-by-default rather than everything-by-default: the library drills down,
   * so a flat list of every set at every depth is a page nobody asks for, and
   * making it the default would mean each child appearing twice — once in its
   * parent and once at the top.
   *
   * A literal `root` is accepted alongside an absent value so a client can be
   * explicit. There is deliberately no "all levels" option; nothing needs one,
   * and adding it later is easier than removing it.
   */
  parent: z
    .union([z.literal('root'), z.literal('all'), z.string().uuid('Not a valid set id.')])
    .optional()
    .transform((value) => {
      if (value === 'all') return 'all'
      if (value === undefined || value === 'root') return null
      return value
    }),
})

export const listCardsQuerySchema = listQuerySchema.extend({
  /** Repeatable: `?tag=anatomy&tag=biology` narrows to cards carrying all of them. */
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return []
      return normalizeTags(Array.isArray(value) ? value : [value])
    }),
})

export type CreateSetBody = z.infer<typeof createSetSchema>
export type UpdateSetBody = z.infer<typeof updateSetSchema>
export type CreateCardBody = z.infer<typeof createCardSchema>
export type UpdateCardBody = z.infer<typeof updateCardSchema>
export type ListSetsQuery = z.infer<typeof listSetsQuerySchema>
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>

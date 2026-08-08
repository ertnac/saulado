/**
 * v1 limits for sets, cards and tags.
 *
 * Here rather than in the backend's Zod schemas for the same reason the password
 * policy is (see `auth/policy.ts`): the editor has to stop a user at 5,000 code
 * points *while they type*, and the API has to reject 5,001 regardless of what
 * the editor did. Two copies of the number drift, and the drift always surfaces
 * as "the editor let me write it but saving failed".
 */

/**
 * Longest paragraph a card may hold, in **code points**.
 *
 * Code points, not `String.length`, because every offset in the cloze engine is
 * a code point index (see `cloze/codepoints.ts`). A cap measured in UTF-16 units
 * would let a paragraph of emoji through at half the apparent length and reject
 * one of CJK text that fits.
 *
 * 5,000 is roughly two dense pages. Beyond that, recall-in-context stops being
 * the point — the paragraph wants splitting into several cards, which is a
 * Phase 10 suggestion rather than something to silently allow here.
 */
export const PARAGRAPH_MAX_CODE_POINTS = 5_000

/** Shortest paragraph worth making a card from. */
export const PARAGRAPH_MIN_CODE_POINTS = 1

/**
 * Most answers one card may carry.
 *
 * A 20-blank paragraph is not a study card, it is a fill-in-the-blank worksheet:
 * every blank has to be answered before the card can be graded, so the failure
 * mode is a card nobody ever completes. The cap is also what bounds the
 * `validateAnswers` overlap check, which is O(n log n) on this number.
 */
export const ANSWERS_MAX_PER_CARD = 20

/** Longest accepted alternative spellings per answer. */
export const ALT_ANSWERS_MAX_PER_ANSWER = 10

/** Longest a single alternative may be, in code points. */
export const ALT_ANSWER_MAX_LENGTH = 200

export const SET_TITLE_MAX_LENGTH = 120
export const SET_DESCRIPTION_MAX_LENGTH = 500
export const CARD_TITLE_MAX_LENGTH = 200

export const TAG_MAX_LENGTH = 40
export const TAGS_MAX_PER_CARD = 15

/**
 * Page sizes for cursor pagination.
 *
 * `DEFAULT` is what a client gets for omitting `limit`; `MAX` is the ceiling a
 * client can ask for. Without the ceiling, `?limit=100000` is an unauthenticated
 * -ish way to make the server serialise a user's entire library into one
 * response — cheap to ask for, expensive to answer.
 */
export const PAGE_SIZE_DEFAULT = 20
export const PAGE_SIZE_MAX = 50

/**
 * Colours a set may be tagged with.
 *
 * A closed list rather than free-form hex: arbitrary colour input has to be
 * validated for contrast in both themes or it produces unreadable text, and
 * "pick from eight" is a better interaction than a colour picker for something
 * this incidental. The values are Tailwind-ish names, resolved to classes in the
 * frontend — storing a class name here would couple the database to the CSS
 * framework.
 */
export const SET_COLORS = [
  'slate',
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const

export type SetColor = (typeof SET_COLORS)[number]

export const DEFAULT_SET_COLOR: SetColor = 'slate'

export function isSetColor(value: unknown): value is SetColor {
  return typeof value === 'string' && (SET_COLORS as readonly string[]).includes(value)
}

/**
 * Canonical form of a tag.
 *
 * Lowercased and inner whitespace collapsed, so "Cell Biology", "cell biology"
 * and "cell  biology" are one tag rather than three entries in the user's
 * autocomplete list. Applied on write, so the stored value is already canonical
 * and `GET /api/tags` can group on it without a functional index.
 */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Canonicalises and de-duplicates a tag list, preserving first-seen order.
 *
 * Order is preserved rather than sorted because the user typed them in an order
 * and re-sorting on save makes the field appear to shuffle itself.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }

  return out
}

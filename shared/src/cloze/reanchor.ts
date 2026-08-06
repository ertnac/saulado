import { codePointLength, toCodePoints } from './codepoints.js'
import { assignOrdinals } from './answers.js'
import type { AnswerRange, ReanchorResult } from './types.js'

/**
 * Re-anchors answers onto an edited paragraph.
 *
 * The nastiest edge case in the app (plan §2.1). Offsets are indices into an
 * exact string; the moment the user inserts a word at the top of the paragraph,
 * every offset below it is wrong. Doing nothing corrupts the card silently —
 * blanks appear mid-word, and `answerText` stops matching what it points at.
 *
 * Strategy: search for each answer's `answerText` in the new paragraph, nearest
 * to its old position first. Insertions and deletions elsewhere shift text
 * without changing it, so the old offset is a strong hint about where the
 * answer moved to.
 *
 * **Unmatched answers are returned as `orphaned`, never dropped.** The user is
 * shown "this highlight no longer matches — re-highlight or delete." Silently
 * discarding a highlight loses work the user did deliberately, and they would
 * have no way to know it happened.
 *
 * Deliberately NOT a diff algorithm. A proper Myers diff would handle answers
 * whose own text was edited — but that case is genuinely ambiguous (was
 * "mitochondria" → "mitochondrion" an edit to the answer, or a different word
 * that happens to be similar?), and guessing wrong writes bad data. Exact-match
 * relocation is predictable, and everything else is escalated to the user.
 */
export function reanchorAnswers<T extends AnswerRange>(
  oldParagraph: string,
  newParagraph: string,
  answers: readonly T[],
): ReanchorResult<T> {
  if (oldParagraph === newParagraph) {
    return { matched: [...answers], orphaned: [] }
  }

  const newPoints = toCodePoints(newParagraph)
  const newLength = newPoints.length
  const matched: T[] = []
  const orphaned: T[] = []

  // Claimed regions, so two identical answer texts can't both land on the same
  // occurrence. Processed in document order so earlier answers get first claim
  // on the earlier occurrence, which matches what a reader expects.
  const claimed: { start: number; end: number }[] = []

  const isClaimed = (start: number, end: number): boolean =>
    claimed.some((region) => start < region.end && region.start < end)

  const ordered = [...answers].sort((a, b) => a.startOffset - b.startOffset)

  for (const answer of ordered) {
    const needle = toCodePoints(answer.answerText)

    if (needle.length === 0 || needle.length > newLength) {
      orphaned.push(answer)
      continue
    }

    const found = findNearestOccurrence(newPoints, needle, answer.startOffset, isClaimed)

    if (found === null) {
      orphaned.push(answer)
      continue
    }

    claimed.push({ start: found, end: found + needle.length })
    matched.push({
      ...answer,
      startOffset: found,
      endOffset: found + needle.length,
    })
  }

  // Ordinals are positional, so an answer that moved past another must be
  // renumbered — otherwise blank 1 renders before blank 0.
  return { matched: assignOrdinals(matched), orphaned }
}

/**
 * Finds the occurrence of `needle` in `haystack` closest to `preferredStart`.
 *
 * Expands outward from the preferred position rather than scanning left to
 * right, so an answer near the end of a long paragraph isn't re-anchored to an
 * unrelated identical word near the beginning.
 *
 * Ties break toward the earlier position: for an insertion directly at the
 * answer's location, the pre-insertion offset is the more intuitive result.
 */
function findNearestOccurrence(
  haystack: readonly string[],
  needle: readonly string[],
  preferredStart: number,
  isClaimed: (start: number, end: number) => boolean,
): number | null {
  const lastStart = haystack.length - needle.length
  if (lastStart < 0) return null

  const matchesAt = (index: number): boolean => {
    if (index < 0 || index > lastStart) return false
    for (let i = 0; i < needle.length; i += 1) {
      if (haystack[index + i] !== needle[i]) return false
    }
    return !isClaimed(index, index + needle.length)
  }

  const anchor = Math.max(0, Math.min(preferredStart, lastStart))
  if (matchesAt(anchor)) return anchor

  const maxDistance = Math.max(anchor, lastStart - anchor)
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const before = anchor - distance
    if (before >= 0 && matchesAt(before)) return before

    const after = anchor + distance
    if (after <= lastStart && matchesAt(after)) return after
  }

  return null
}

/**
 * Cheap pre-check: can these answers survive the edit unchanged?
 *
 * True when the paragraph is untouched, or when every answer still slices to
 * exactly its stored text. Lets the editor skip re-anchoring entirely for the
 * common case of appending to the end of a paragraph.
 */
export function needsReanchoring(
  oldParagraph: string,
  newParagraph: string,
  answers: readonly AnswerRange[],
): boolean {
  if (oldParagraph === newParagraph) return false

  const newPoints = toCodePoints(newParagraph)
  const newLength = codePointLength(newParagraph)

  return answers.some((answer) => {
    if (answer.endOffset > newLength) return true
    const slice = newPoints.slice(answer.startOffset, answer.endOffset).join('')
    return slice !== answer.answerText
  })
}

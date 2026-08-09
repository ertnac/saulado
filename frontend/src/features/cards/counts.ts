import type { StudySet } from '@saulado/shared'

/**
 * How a set's two card counts are phrased.
 *
 * Nesting gives every set two numbers: the cards written directly in it, and the
 * cards in it *and everything under it* — the second being what pressing Study
 * will actually serve. Printing both unconditionally would put "0 cards · 40 in
 * sub-sets" on a folder and "12 cards · 12 in sub-sets" on a leaf, and the
 * second half of that is noise on the majority of sets.
 *
 * So the subtree figure appears only when it differs, and it is phrased as the
 * difference ("40 in sub-sets") rather than the total — the total is what the
 * user would otherwise have to compute the difference *from* to understand
 * where the cards actually are.
 */
export function cardCountLabel(set: StudySet): string {
  const own = `${String(set.cardCount)} ${set.cardCount === 1 ? 'card' : 'cards'}`
  const nested = set.subtreeCardCount - set.cardCount

  if (nested <= 0) return own

  return `${own} · ${String(nested)} in sub-sets`
}

/** `null` when a set has no children, so callers can drop the badge entirely. */
export function childCountLabel(set: StudySet): string | null {
  if (set.childCount === 0) return null

  return `${String(set.childCount)} ${set.childCount === 1 ? 'sub-set' : 'sub-sets'}`
}

/**
 * Bounded Levenshtein distance.
 *
 * The textbook implementation builds a full `(m+1) x (n+1)` matrix and is
 * O(m·n) in both time and memory. Answer checking runs on every keystroke-ish
 * interaction in a study session, and the only question ever asked is "is the
 * distance at most k?" — so this variant keeps two rows instead of a matrix and
 * bails out the moment the whole row exceeds the threshold.
 *
 * Returns the true distance when it's <= `maxDistance`, and `maxDistance + 1`
 * when it exceeds it. Callers must compare with `<=`, never use the return value
 * as an exact distance without checking the bound first.
 */
export function levenshtein(a: string, b: string, maxDistance = Infinity): number {
  if (a === b) return 0

  // Code points, not code units: an emoji is one edit, not two.
  const source = Array.from(a)
  const target = Array.from(b)

  // A length gap alone already costs that many edits.
  if (Math.abs(source.length - target.length) > maxDistance) {
    return maxDistance + 1
  }

  if (source.length === 0) return target.length
  if (target.length === 0) return source.length

  let previous = Array.from({ length: target.length + 1 }, (_, i) => i)
  let current = new Array<number>(target.length + 1)

  for (let i = 1; i <= source.length; i += 1) {
    current[0] = i
    let rowMinimum = i

    for (let j = 1; j <= target.length; j += 1) {
      const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1

      // Non-null assertions are safe: both rows are sized target.length + 1 and
      // every index below is within that range.
      const deletion = previous[j]! + 1
      const insertion = current[j - 1]! + 1
      const substitution = previous[j - 1]! + substitutionCost

      const cost = Math.min(deletion, insertion, substitution)
      current[j] = cost
      if (cost < rowMinimum) rowMinimum = cost
    }

    // Distance never decreases as rows are added, so once the best cell in a
    // row is past the threshold the final answer is too. This is the early exit
    // that makes the function cheap for the common "completely wrong" case.
    if (rowMinimum > maxDistance) return maxDistance + 1

    const swap = previous
    previous = current
    current = swap
  }

  const distance = previous[target.length]!
  return distance > maxDistance ? maxDistance + 1 : distance
}

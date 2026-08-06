/**
 * Code-point-safe string primitives.
 *
 * JavaScript strings are UTF-16, so `String.prototype.length` and `charAt`
 * count *code units*, not characters. Anything outside the Basic Multilingual
 * Plane — emoji, rarer CJK, mathematical symbols — occupies two code units as a
 * surrogate pair. Indexing such a string by code unit produces offsets that
 * slice a character in half:
 *
 *   "🧠 brain".length          // 8  — the emoji counts twice
 *   [..."🧠 brain"].length     // 7  — what a human would count
 *   "🧠 brain".slice(0, 1)     // "\uD83E" — a lone surrogate, not a character
 *
 * Offsets in this app are persisted and travel between the editor, the
 * database, and the renderer. A surrogate-splitting bug therefore does not
 * crash — it silently corrupts stored user data, and only for users who type
 * emoji or non-Latin scripts. Every offset in the cloze engine is a code point
 * index, and this module is the only place that conversion happens.
 *
 * Note: code points are still not *grapheme clusters*. "👨‍👩‍👧" is one visual
 * glyph but five code points. Grapheme segmentation needs `Intl.Segmenter` and
 * is deliberately out of scope — the browser's own selection API reports code
 * unit offsets we convert from, and it will not hand us a selection that splits
 * a grapheme.
 */

/**
 * Splits a string into code points.
 *
 * `Array.from` uses the string iterator, which is code-point aware. Prefer this
 * over `s.split('')`, which splits into code units and breaks surrogate pairs.
 */
export function toCodePoints(s: string): string[] {
  return Array.from(s)
}

/** Length in code points. The denominator for every offset in the engine. */
export function codePointLength(s: string): number {
  return toCodePoints(s).length
}

/**
 * Slices by code point index. `start` inclusive, `end` exclusive.
 *
 * Out-of-range indices clamp rather than throw, matching `String.slice`.
 * Negative indices are NOT supported — offsets in this app are always absolute,
 * and silently reinterpreting a negative as "from the end" would turn an
 * arithmetic bug into wrong-but-plausible data.
 */
export function sliceCodePoints(s: string, start: number, end?: number): string {
  const points = toCodePoints(s)
  const from = Math.max(0, start)
  const to = end === undefined ? points.length : Math.min(points.length, end)
  return points.slice(from, to).join('')
}

/**
 * Converts a UTF-16 code unit index (what the DOM Selection API reports) to a
 * code point index (what this engine stores).
 *
 * If the index lands inside a surrogate pair — which shouldn't happen from a
 * real selection, but can from arithmetic — it resolves to the index of the
 * character containing it rather than throwing.
 */
export function codeUnitToCodePoint(s: string, codeUnitIndex: number): number {
  if (codeUnitIndex <= 0) return 0

  let units = 0
  let points = 0

  for (const char of s) {
    if (units >= codeUnitIndex) break
    units += char.length
    points += 1
  }

  return points
}

/**
 * Converts a code point index back to a UTF-16 code unit index, for handing
 * offsets back to DOM APIs.
 */
export function codePointToCodeUnit(s: string, codePointIndex: number): number {
  if (codePointIndex <= 0) return 0

  let units = 0
  let points = 0

  for (const char of s) {
    if (points >= codePointIndex) break
    units += char.length
    points += 1
  }

  return units
}

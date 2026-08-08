import { afterEach, describe, expect, it } from 'vitest'
import {
  findOverlaps,
  PARAGRAPH_DECORATION_ATTR,
  readSelectionOffsets,
  resolveHighlight,
} from './selection'

/**
 * Word-boundary snapping itself is `snapToWordBoundaries` in `@saulado/shared`
 * and is tested there. What is tested here is that `resolveHighlight` applies it
 * in the right order relative to the overlap check.
 */

/**
 * Selection → code-point offset mapping.
 *
 * The interesting cases are all about the DOM *not* being one flat text node.
 * Once a paragraph carries highlights, `renderCloze` gives it alternating text
 * and `<mark>` children, so a drag across a highlight boundary starts in one text
 * node and ends in another. `buildParagraph` below reproduces that shape so the
 * walker is tested against the structure it will actually meet.
 *
 * jsdom implements Range and Selection well enough for this; what it cannot tell
 * us is how real touch selection behaves, which is why plan §3.3 insists on
 * device testing rather than treating these tests as sufficient.
 */

const PARAGRAPH = 'The CPU is the brain of the computer'

let root: HTMLElement | null = null

afterEach(() => {
  root?.remove()
  root = null
  window.getSelection()?.removeAllRanges()
})

/**
 * Renders a paragraph split into the given pieces, marking any piece flagged as a
 * highlight. Splitting into separate text nodes is the whole point — a single
 * `textContent` assignment would give one node and test nothing.
 *
 * Highlights reproduce `HighlightSurface`'s real shape, ordinal badge included.
 * The badge matters: its digits are text nodes under the paragraph that the
 * paragraph string does not contain, so a walker that counts them puts every
 * offset after the first highlight too high. Building it here means every test in
 * this file guards against that, not just the ones that name it.
 */
function buildParagraph(pieces: { text: string; highlight?: boolean }[]): HTMLElement {
  const element = document.createElement('p')
  let ordinal = 0

  for (const piece of pieces) {
    if (piece.highlight) {
      const button = document.createElement('button')
      const mark = document.createElement('mark')
      mark.textContent = piece.text

      const badge = document.createElement('sup')
      badge.setAttribute(PARAGRAPH_DECORATION_ATTR, '')
      badge.textContent = String(ordinal + 1)

      button.append(mark, badge)
      element.append(button)
      ordinal += 1
    } else {
      element.append(document.createTextNode(piece.text))
    }
  }

  document.body.append(element)
  root = element
  return element
}

/** A paragraph as one text node — the compose-mode shape. */
function flat(text = PARAGRAPH): HTMLElement {
  return buildParagraph([{ text }])
}

/**
 * Selects from `startUnits` to `endUnits`, counted in UTF-16 code units across
 * the element's text nodes — i.e. the way the paragraph reads, not the way the
 * DOM is chunked. Mirrors what a user drag produces.
 */
function selectUnits(element: HTMLElement, startUnits: number, endUnits: number): void {
  // Badges are skipped here for the same reason the production walker skips them:
  // the caller counts in paragraph coordinates, and a badge's digits are not part
  // of the paragraph. Counting them here would aim the selection at the wrong
  // characters and quietly agree with a walker that had the same bug.
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(`[${PARAGRAPH_DECORATION_ATTR}]`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const range = document.createRange()

  let consumed = 0
  let startSet = false

  while (walker.nextNode()) {
    const node = walker.currentNode
    const length = (node.textContent ?? '').length

    if (!startSet && startUnits <= consumed + length) {
      range.setStart(node, startUnits - consumed)
      startSet = true
    }

    if (startSet && endUnits <= consumed + length) {
      range.setEnd(node, endUnits - consumed)
      break
    }

    consumed += length
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

describe('readSelectionOffsets', () => {
  it('maps a selection in a single text node', () => {
    const element = flat()
    selectUnits(element, 4, 7)

    const result = readSelectionOffsets(element, PARAGRAPH)

    expect(result).toEqual({ ok: true, range: { startOffset: 4, endOffset: 7 } })
  })

  /**
   * The case that motivates the TreeWalker. "brain" sits in its own `<mark>`, so
   * "computer" begins in the *third* text node — its offset within that node is
   * 8, while its offset in the paragraph is 28. Accumulating the lengths of the
   * two preceding nodes (15 + 5) is what reconciles the two.
   */
  it('maps a selection in a node that follows a highlight', () => {
    const element = buildParagraph([
      { text: 'The CPU is the ' },
      { text: 'brain', highlight: true },
      { text: ' of the computer' },
    ])

    selectUnits(element, 28, 36)

    const result = readSelectionOffsets(element, PARAGRAPH)

    expect(result).toEqual({ ok: true, range: { startOffset: 28, endOffset: 36 } })
  })

  it('maps a selection that spans a highlight boundary', () => {
    const element = buildParagraph([
      { text: 'The ' },
      { text: 'CPU', highlight: true },
      { text: ' is the brain of the computer' },
    ])

    // "CPU is the brain" — starts inside the mark, ends two nodes later.
    selectUnits(element, 4, 20)

    const result = readSelectionOffsets(element, PARAGRAPH)

    expect(result).toEqual({ ok: true, range: { startOffset: 4, endOffset: 20 } })
  })

  it('handles a paragraph split into many adjacent highlights', () => {
    const element = buildParagraph([
      { text: 'The ' },
      { text: 'CPU', highlight: true },
      { text: ' is the ' },
      { text: 'brain', highlight: true },
      { text: ' of the ' },
      { text: 'computer', highlight: true },
    ])

    selectUnits(element, 15, 20)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({
      ok: true,
      range: { startOffset: 15, endOffset: 20 },
    })
  })

  /**
   * Browsers report a selection that lands on a node boundary against the *parent
   * element*, where the offset counts child nodes rather than characters. Setting
   * the range that way directly is the only way to exercise the element branch.
   */
  it('maps a range addressed against the element rather than a text node', () => {
    const element = buildParagraph([
      { text: 'The ' },
      { text: 'CPU', highlight: true },
      { text: ' is the brain of the computer' },
    ])

    const range = document.createRange()
    // "child 1 onwards" — the start of the <mark>, i.e. paragraph offset 4.
    range.setStart(element, 1)
    // "after child 2" — the end of the <mark>, i.e. paragraph offset 7.
    range.setEnd(element, 2)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({
      ok: true,
      range: { startOffset: 4, endOffset: 7 },
    })
  })

  /** "Past the last child" must count that child's text, not stop at its start. */
  it('maps an end offset that points past the last child', () => {
    const element = buildParagraph([
      { text: 'The CPU is the brain of the ' },
      { text: 'computer', highlight: true },
    ])

    const range = document.createRange()
    range.setStart(element, 1)
    range.setEnd(element, element.childNodes.length)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({
      ok: true,
      range: { startOffset: 28, endOffset: 36 },
    })
  })

  /**
   * The regression these decorations exist for. With the badge counted as
   * paragraph text, "brain" resolves to [16,21) — the user highlights "brain" and
   * the stored `answerText` becomes "rain ". One blank is enough to trigger it,
   * and the drift accumulates with each further blank.
   */
  it('ignores an ordinal badge when counting toward a later selection', () => {
    const element = buildParagraph([
      { text: 'The ' },
      { text: 'CPU', highlight: true },
      { text: ' is the brain of the computer' },
    ])

    selectUnits(element, 15, 20)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({
      ok: true,
      range: { startOffset: 15, endOffset: 20 },
    })
  })

  it('stays correct once badges reach two digits', () => {
    // Ten highlights put a "10" in the DOM, so the drift is no longer a fixed one
    // character per blank — it grows with the label's own width.
    const pieces: { text: string; highlight?: boolean }[] = [{ text: 'a' }]
    for (let i = 0; i < 10; i += 1) {
      pieces.push({ text: 'x', highlight: true }, { text: 'b' })
    }
    const paragraph = pieces.map((piece) => piece.text).join('')
    const element = buildParagraph(pieces)

    // The final "b", at the very end of the paragraph.
    const end = paragraph.length
    selectUnits(element, end - 1, end)

    expect(readSelectionOffsets(element, paragraph)).toEqual({
      ok: true,
      range: { startOffset: end - 1, endOffset: end },
    })
  })

  it('resolves a selection released over a badge to the end of its highlight', () => {
    // A drag past a highlight commonly ends with the boundary inside the badge.
    // That is a real position in the paragraph, not an outside-the-paragraph
    // rejection, and it is where the highlighted word ends.
    const element = buildParagraph([
      { text: 'The ' },
      { text: 'CPU', highlight: true },
      { text: ' is the brain of the computer' },
    ])

    const badge = element.querySelector(`[${PARAGRAPH_DECORATION_ATTR}]`)
    const range = document.createRange()
    range.setStart(element.firstChild as Node, 0)
    range.setEnd(badge?.firstChild as Node, 1)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({
      ok: true,
      range: { startOffset: 0, endOffset: 7 },
    })
  })

  it('reports a collapsed caret rather than a zero-length range', () => {
    const element = flat()
    selectUnits(element, 5, 5)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({ ok: false, reason: 'collapsed' })
  })

  it('reports a selection made outside the paragraph', () => {
    const element = flat()

    const outside = document.createElement('p')
    outside.textContent = 'Some other text on the page'
    document.body.append(outside)

    const range = document.createRange()
    range.setStart(outside.firstChild as Node, 0)
    range.setEnd(outside.firstChild as Node, 4)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({ ok: false, reason: 'outside' })

    outside.remove()
  })

  it('reports whitespace-only selections', () => {
    const element = flat()
    // Offset 3 is the single space between "The" and "CPU".
    selectUnits(element, 3, 4)

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({ ok: false, reason: 'whitespace' })
  })

  it('reports no selection at all', () => {
    const element = flat()
    window.getSelection()?.removeAllRanges()

    expect(readSelectionOffsets(element, PARAGRAPH)).toEqual({ ok: false, reason: 'no-selection' })
  })

  /**
   * The surrogate-pair case. In "A 🧠 thinks" the emoji is one code point but two
   * UTF-16 code units, so "thinks" starts at code unit 5 and code point 4.
   * Returning 5 would store an offset that slices the emoji in half on the way
   * back out.
   */
  it('converts past a surrogate pair to code points, not code units', () => {
    const paragraph = 'A 🧠 thinks'
    const element = flat(paragraph)

    selectUnits(element, 5, 11)

    expect(readSelectionOffsets(element, paragraph)).toEqual({
      ok: true,
      range: { startOffset: 4, endOffset: 10 },
    })
  })

  it('selects the emoji itself as a single code point', () => {
    const paragraph = 'A 🧠 thinks'
    const element = flat(paragraph)

    selectUnits(element, 2, 4)

    expect(readSelectionOffsets(element, paragraph)).toEqual({
      ok: true,
      range: { startOffset: 2, endOffset: 3 },
    })
  })
})

describe('findOverlaps', () => {
  const existing = [
    { startOffset: 4, endOffset: 7, ordinal: 0 },
    { startOffset: 15, endOffset: 20, ordinal: 1 },
  ]

  it('finds nothing for a clear range', () => {
    expect(findOverlaps({ startOffset: 27, endOffset: 35 }, existing)).toEqual([])
  })

  /** Half-open intervals: `[4,7)` and `[7,10)` touch but do not overlap. */
  it('treats adjacent ranges as non-overlapping', () => {
    expect(findOverlaps({ startOffset: 7, endOffset: 10 }, existing)).toEqual([])
    expect(findOverlaps({ startOffset: 1, endOffset: 4 }, existing)).toEqual([])
  })

  it('detects a partial overlap', () => {
    expect(findOverlaps({ startOffset: 6, endOffset: 10 }, existing)).toEqual([0])
  })

  it('detects containment in both directions', () => {
    expect(findOverlaps({ startOffset: 5, endOffset: 6 }, existing)).toEqual([0])
    expect(findOverlaps({ startOffset: 0, endOffset: 30 }, existing)).toEqual([0, 1])
  })

  it('falls back to array position when ordinals are absent', () => {
    expect(
      findOverlaps({ startOffset: 16, endOffset: 17 }, [
        { startOffset: 4, endOffset: 7 },
        { startOffset: 15, endOffset: 20 },
      ]),
    ).toEqual([1])
  })
})

describe('resolveHighlight', () => {
  it('returns the range when nothing collides', () => {
    const element = flat()
    selectUnits(element, 4, 7)

    expect(resolveHighlight(element, PARAGRAPH, [])).toEqual({
      ok: true,
      range: { startOffset: 4, endOffset: 7 },
    })
  })

  it('rejects an overlap and names the blanks involved', () => {
    const element = flat()
    selectUnits(element, 6, 10)

    expect(
      resolveHighlight(element, PARAGRAPH, [{ startOffset: 4, endOffset: 7, ordinal: 0 }]),
    ).toEqual({ ok: false, reason: 'overlap', ordinals: [0] })
  })

  /**
   * Ordering matters: an unsnapped [15,16) clears a blank on "rain" [16,20)
   * entirely, but snapping grows it to the whole word [15,20) — straight into
   * that blank. Checking overlaps first would store the collision.
   */
  it('snaps before checking overlaps, not after', () => {
    const element = flat()
    // "b" — the first letter of "brain", left of an existing partial-word blank.
    selectUnits(element, 15, 16)

    const existing = [{ startOffset: 16, endOffset: 20, ordinal: 0 }]

    expect(resolveHighlight(element, PARAGRAPH, existing, { snap: false })).toEqual({
      ok: true,
      range: { startOffset: 15, endOffset: 16 },
    })

    expect(resolveHighlight(element, PARAGRAPH, existing, { snap: true })).toEqual({
      ok: false,
      reason: 'overlap',
      ordinals: [0],
    })
  })

  it('passes the selection through untouched when snapping is off', () => {
    const element = flat()
    selectUnits(element, 28, 34)

    expect(resolveHighlight(element, PARAGRAPH, [], { snap: false })).toEqual({
      ok: true,
      range: { startOffset: 28, endOffset: 34 },
    })
  })
})

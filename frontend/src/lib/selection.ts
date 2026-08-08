import {
  codePointLength,
  codeUnitToCodePoint,
  rangesOverlap,
  sliceCodePoints,
  snapToWordBoundaries,
} from '@saulado/shared'

/**
 * Turning a browser text selection into code-point offsets.
 *
 * This is the seam between the DOM and the cloze engine, and it is the one place
 * in the frontend where getting it wrong corrupts stored data rather than just
 * looking wrong. Three separate coordinate systems meet here:
 *
 * 1. **The DOM**, which reports a selection as `(node, offset)` pairs where the
 *    offset counts UTF-16 code units *within a single text node*.
 * 2. **The paragraph string**, one flat run of text.
 * 3. **The engine**, which indexes everything by code point (see
 *    `shared/src/cloze/codepoints.ts` for why).
 *
 * The hard part is (1) → (2). Once a paragraph has highlights, its DOM is not one
 * text node — `renderCloze` produces alternating text and highlight segments, so
 * "brain" may live in its own `<mark>` with plain text either side. A selection
 * dragged across a highlight boundary therefore starts in one text node and ends
 * in another, and the raw `anchorOffset` of 3 means "3 units into *this* node",
 * not "3 units into the paragraph". Walking the container to accumulate the
 * lengths of every preceding text node is what makes the two agree.
 *
 * The functions here are deliberately pure over a root element, so they can be
 * tested in jsdom without rendering the whole editor.
 */

/** A selection resolved into the paragraph's own coordinate system. */
export interface OffsetRange {
  startOffset: number
  endOffset: number
}

/**
 * Why a selection could not be used, when it could not be.
 *
 * Distinct reasons rather than a bare `null`, because the editor says something
 * different for each: a collapsed caret is silent (the user just clicked), a
 * selection that strayed outside the paragraph is silent too, but one that
 * overlaps an existing blank gets an inline explanation. Plan §3.3 is explicit
 * that overlaps must not be a silent no-op.
 */
export type SelectionRejection =
  | { reason: 'no-selection' }
  | { reason: 'collapsed' }
  | { reason: 'outside' }
  | { reason: 'whitespace' }
  | { reason: 'overlap'; ordinals: number[] }

export type SelectionResult =
  { ok: true; range: OffsetRange } | ({ ok: false } & SelectionRejection)

/**
 * Attribute the editor stamps on each rendered highlight, carrying its ordinal.
 *
 * Lets a click resolve to a blank with `closest('[data-answer-ordinal]')` rather
 * than by mapping the click point to an offset and searching the answers — the
 * element the user actually hit already knows which blank it is.
 *
 * A data attribute rather than a class: classes are Tailwind's territory and get
 * rewritten freely, whereas this is read by behaviour.
 */
export const HIGHLIGHT_ORDINAL_ATTR = 'data-answer-ordinal'

/**
 * Marks an element whose text is chrome, not paragraph content.
 *
 * The editor renders a small ordinal badge inside each highlight, so the DOM
 * under the paragraph holds characters the paragraph string does not: a `<sup>`
 * reading "1". Counted as text, every offset after the first highlight comes out
 * too high by the badge's length — the user highlights "brain" and stores
 * "rain ", and the drift grows with each blank and again once badges reach two
 * digits.
 *
 * An explicit attribute rather than reusing `aria-hidden`: the two happen to
 * coincide on the badge today, but `aria-hidden` is an accessibility decision and
 * someone setting it for an unrelated reason should not silently move stored
 * offsets.
 */
export const PARAGRAPH_DECORATION_ATTR = 'data-cloze-decoration'

/**
 * Whether `node` sits inside a decoration, and so holds no paragraph text.
 *
 * `closest` deliberately looks past `root`: the marker sits on the decorating
 * element itself, and matching it wherever it appears above the node is what
 * makes nesting depth irrelevant.
 */
function isDecoration(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return element?.closest(`[${PARAGRAPH_DECORATION_ATTR}]`) != null
}

/** Walks the text nodes that make up the paragraph, skipping decorations. */
function paragraphTextWalker(root: Node): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isDecoration(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
}

/** Code-unit length of the paragraph text `node` holds, decorations excluded. */
function paragraphTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return isDecoration(node) ? 0 : (node.textContent ?? '').length
  }

  const walker = paragraphTextWalker(node)
  let units = 0
  while (walker.nextNode()) units += (walker.currentNode.textContent ?? '').length

  return units
}

/**
 * Code-unit index, within `root`'s paragraph text, of the first character inside
 * `node`.
 *
 * A `TreeWalker` rather than recursion: it visits text nodes in document order,
 * which is exactly the order their content appears in the paragraph, so the
 * caller never has to know how deeply the highlight spans happen to nest.
 *
 * `node.contains(current)` rather than `node === current`, so this answers for
 * elements as well as text nodes — a `<mark>` resolves to the position of the
 * first character it wraps. That is what lets one helper serve both branches of
 * {@link toParagraphUnits}.
 *
 * Returns `null` when `node` is not inside `root`: a selection that began in the
 * paragraph and ended in a sibling element is not a paragraph range, and
 * clamping it would silently invent an offset.
 */
function unitsBeforeStart(root: Node, node: Node): number | null {
  if (!root.contains(node)) return null

  const walker = paragraphTextWalker(root)
  let units = 0

  while (walker.nextNode()) {
    const current = walker.currentNode
    if (node === current || node.contains(current)) return units

    // The walker has moved past `node` without visiting it, so `node` holds no
    // paragraph text of its own — a badge, or an empty element. Its position is
    // where the text walked so far ends, which for a badge is the end of the
    // highlight it annotates. A drag released over the badge lands there rather
    // than being reported as outside the paragraph.
    if (node.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING) return units

    units += (current.textContent ?? '').length
  }

  return units
}

/**
 * Resolves a DOM `(container, offset)` pair to a code-unit index in the
 * paragraph.
 *
 * The two cases are genuinely different units. Against a text node the offset
 * counts characters; against an element it counts *child nodes*, which is how
 * browsers report a selection that lands exactly on a boundary. Reading "offset
 * 1 of a `<p>` with three children" as "1 character in" would be off by however
 * long the first child happens to be.
 */
function toParagraphUnits(root: Node, container: Node, offset: number): number | null {
  if (!root.contains(container)) return null

  if (container.nodeType === Node.TEXT_NODE) {
    const before = unitsBeforeStart(root, container)
    if (before === null) return null

    /**
     * A boundary inside a badge. `unitsBeforeStart` already resolved it to the end
     * of the highlight the badge annotates; adding the offset *within* the badge
     * would count its digits as paragraph characters, which is the whole thing
     * decorations exist to prevent.
     */
    return isDecoration(container) ? before : before + offset
  }

  const children = Array.from(container.childNodes)

  /**
   * `offset === children.length` means "after the last child", so the position is
   * the end of everything the container holds — its start plus the length of all
   * its text. Taking the last child's *start* here would drop that child's text
   * from the count, which is the bug this branch exists to avoid.
   */
  if (offset >= children.length) {
    const before = unitsBeforeStart(root, container)
    return before === null ? null : before + paragraphTextLength(container)
  }

  const child = children[offset]
  return child ? unitsBeforeStart(root, child) : null
}

/**
 * Reads the current window selection as code-point offsets into `paragraph`.
 *
 * `paragraph` is passed in rather than read from `root.textContent` on purpose:
 * the stored paragraph is the source of truth, and the rendered DOM may differ
 * from it (a trailing newline collapsed by CSS, a zero-width character injected
 * for layout). Converting against the string that will actually be saved is what
 * keeps the offsets meaningful after a round-trip.
 */
export function readSelectionOffsets(root: HTMLElement, paragraph: string): SelectionResult {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return { ok: false, reason: 'no-selection' }

  const range = selection.getRangeAt(0)
  if (range.collapsed) return { ok: false, reason: 'collapsed' }

  const startUnits = toParagraphUnits(root, range.startContainer, range.startOffset)
  const endUnits = toParagraphUnits(root, range.endContainer, range.endOffset)
  if (startUnits === null || endUnits === null) return { ok: false, reason: 'outside' }

  // A DOM Range is always ordered start-before-end, but a selection dragged
  // right-to-left can still surface swapped containers in some engines.
  const [lowUnits, highUnits] =
    startUnits <= endUnits ? [startUnits, endUnits] : [endUnits, startUnits]

  const startOffset = codeUnitToCodePoint(paragraph, lowUnits)
  const endOffset = codeUnitToCodePoint(paragraph, highUnits)

  if (startOffset >= endOffset) return { ok: false, reason: 'collapsed' }

  const total = codePointLength(paragraph)
  if (endOffset > total) return { ok: false, reason: 'outside' }

  // A selection of only spaces is almost always an accidental drag, and
  // `createAnswer` would reject it server-side anyway — catching it here lets the
  // editor say why instead of surfacing a validation error on save.
  if (sliceCodePoints(paragraph, startOffset, endOffset).trim().length === 0) {
    return { ok: false, reason: 'whitespace' }
  }

  return { ok: true, range: { startOffset, endOffset } }
}

/**
 * The ordinals of existing answers a candidate range would collide with.
 *
 * Overlap arithmetic itself lives in `rangesOverlap` in the shared engine, which
 * the API and the `EXCLUDE USING gist` constraint in the migration also stand
 * behind — three layers agreeing because they are the same rule, not three
 * hand-written copies of it. What this adds is *which* blanks were hit, so the
 * editor can name them instead of saying "that overlaps something".
 */
export function findOverlaps(
  candidate: OffsetRange,
  existing: readonly { startOffset: number; endOffset: number; ordinal?: number }[],
): number[] {
  const hits: number[] = []

  existing.forEach((answer, index) => {
    if (rangesOverlap(candidate, answer)) hits.push(answer.ordinal ?? index)
  })

  return hits
}

/**
 * Everything the editor needs to act on a selection, in one call.
 *
 * Bundled because the order matters and getting it wrong is subtle: snap *before*
 * checking overlaps, or a snapped range can grow into a neighbouring blank and be
 * stored anyway.
 *
 * Snapping is the touch path only (`snapToWordBoundaries` exists because a
 * long-press lands mid-word). A mouse or keyboard selection is precise enough to
 * trust, and snapping it would fight a user who deliberately highlighted a
 * prefix — "bio" in "biology" is a legitimate answer.
 */
export function resolveHighlight(
  root: HTMLElement,
  paragraph: string,
  existing: readonly { startOffset: number; endOffset: number; ordinal?: number }[],
  options: { snap?: boolean } = {},
): SelectionResult {
  const read = readSelectionOffsets(root, paragraph)
  if (!read.ok) return read

  const range = options.snap
    ? snapToWordBoundaries(paragraph, read.range.startOffset, read.range.endOffset)
    : read.range

  const ordinals = findOverlaps(range, existing)
  if (ordinals.length > 0) return { ok: false, reason: 'overlap', ordinals }

  return { ok: true, range }
}

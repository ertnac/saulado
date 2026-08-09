/**
 * Turns raw OCR text into the paragraphs a user reviews and imports.
 *
 * Tesseract emits a string where almost every *visual* line ends in a newline —
 * a paragraph of text comes back as a column of fragments. If those fragments
 * were handed to the editor as-is, the hard newlines would be code points every
 * answer offset has to index around, and the review dialog would read like a
 * page torn down its seams. So segmentation re-joins the visual lines into
 * prose, and marks the blocks that look like noise so the UI can render them
 * unchecked rather than pretending they are paragraphs.
 *
 * This is the contract between the OCR layer and the review dialog, and the
 * input to everything downstream (the composer, the card label, the editor's
 * offsets). `normalizeParagraph` runs here so the text the user sees in the
 * review list is byte-identical to what gets committed as a card.
 */

import { normalizeParagraph } from '../cloze/answers.js'
import { PARAGRAPH_MAX_CODE_POINTS } from '../cards/limits.js'
import { codePointLength, sliceCodePoints } from '../cloze/codepoints.js'
import { dewrap } from './dewrap.js'

/** A paragraph extracted from OCR text. */
export interface ExtractedParagraph {
  /**
   * Stable within one extraction — the client uses it as a React key.
   *
   * The block index qualifies: the list is rebuilt whole on every extraction,
   * and nothing else needs to address a paragraph.
   */
  id: string
  text: string
  /**
   * `unlikely` marks blocks that look like page furniture — a number, a
   * caption, a running head. Rendered unchecked, never dropped: OCR noise is a
   * coin flip and the user is the better judge of it.
   */
  confidence: 'likely' | 'unlikely'
}

/** Shorter than this and a block is a heading or a caption, not a paragraph. */
const UNLIKELY_MIN_CODE_POINTS = 40

/** Sentence-ending punctuation. A block with none of it did not end a thought. */
const SENTENCE_END = /[.!?…]/

/** Above this share of digits, the block is a page number or a table row. */
const UNLIKELY_DIGIT_SHARE = 0.4

/**
 * Breaks OCR output into paragraphs.
 *
 * Blocks are split on blank lines — OCR preserves a real paragraph gap as a
 * blank line — then de-wrapped, since a newline *inside* a block is a visual
 * line break rather than a thought boundary. A block is dropped when it
 * normalizes to nothing; every other block survives, truncated to the card
 * paragraph cap and marked `likely` or `unlikely` by its shape.
 */
export function segmentParagraphs(raw: string): ExtractedParagraph[] {
  // CRLF collapses here rather than in `normalizeParagraph` below, because the
  // split runs first: a block gap pasted from Windows is `\r\n\r\n`, and the
  // `\r` sitting between the two newlines would stop the split matching it.
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
  const paragraphs: ExtractedParagraph[] = []

  for (const block of blocks) {
    // Normalize before truncating, not after: normalization changes length
    // (NFC recomposes, CRLF collapses), so cutting first could leave a
    // paragraph over the cap that the composer would then reject.
    const text = truncate(normalizeParagraph(dewrap(block))).trim()
    if (text.length === 0) continue

    paragraphs.push({
      id: String(paragraphs.length),
      text,
      confidence: classify(text),
    })
  }

  return paragraphs
}

/**
 * Marks a block unlikely when it does not read like a paragraph.
 *
 * Three independent shapes of page furniture, any one of which is enough: too
 * short to be a sentence, no sentence-ending punctuation anywhere, or mostly
 * digits. Being wrong here is cheap in one direction only — an `unlikely`
 * paragraph is still listed and still tickable, so a false positive costs a
 * click while a false negative costs a junk card.
 */
function classify(text: string): 'likely' | 'unlikely' {
  const length = codePointLength(text)
  if (length < UNLIKELY_MIN_CODE_POINTS) return 'unlikely'
  if (!SENTENCE_END.test(text)) return 'unlikely'

  const digits = (text.match(/\d/gu) ?? []).length
  if (digits / length > UNLIKELY_DIGIT_SHARE) return 'unlikely'

  return 'likely'
}

/**
 * Truncates to the card paragraph cap on a code-point boundary.
 *
 * `String.prototype.slice` counts UTF-16 units and would split a surrogate
 * pair, dropping a lone replacement character into a paragraph the user is
 * about to highlight. This is the same cap the composer enforces, so a card
 * made from an over-long block matches what was reviewed rather than failing
 * to save.
 */
function truncate(block: string): string {
  return codePointLength(block) <= PARAGRAPH_MAX_CODE_POINTS
    ? block
    : sliceCodePoints(block, 0, PARAGRAPH_MAX_CODE_POINTS)
}

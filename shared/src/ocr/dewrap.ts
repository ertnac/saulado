/**
 * Undoes the line wrapping in OCR text, keeping paragraph gaps.
 *
 * Tesseract emits a newline at every *visual* line. Left in, a paragraph reads
 * as a column of fragments, and every newline is a code point each answer offset
 * downstream has to index around. This is the normalization that makes full-page
 * OCR output usable for highlighting.
 *
 * A blank line survives as a blank line. A newline inside a block is a wrap and
 * becomes a space; a blank line is a real paragraph boundary, and flattening the
 * two together turns a page into one unreadable wall of text. That distinction
 * is why the blocks are split out first rather than every newline being replaced
 * in place.
 *
 * The hyphen rule runs per block and consumes the break with it — otherwise the
 * wrap rule turns "chloro-\nplast" into "chloro plast", which is worse than
 * leaving the hyphen in. It requires a letter on both sides, so an em-dash at
 * the end of a line and a bulleted "- item" are left alone.
 */
export function dewrap(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{L})/gu, '$1$2')
        .replace(/[ \t]*\n[ \t]*/g, ' ')
        .trim(),
    )
    .filter((block) => block.length > 0)
    .join('\n\n')
}

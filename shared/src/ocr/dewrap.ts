/**
 * De-wraps OCR text: newlines become spaces, hyphenated line breaks are rejoined.
 *
 * Tesseract emits a newline at every visual line. Left in, the paragraph reads
 * as a column of fragments. This is the normalization that makes full-page OCR
 * output usable for highlighting.
 *
 * The hyphen rule runs first and consumes the break with it — otherwise the
 * general rule below turns "chloro-\nplast" into "chloro plast", which is worse
 * than leaving the hyphen in. It requires a letter on both sides, so an em-dash
 * at the end of a line and a bulleted "- item" are left alone.
 */
export function dewrap(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{L})/gu, '$1$2')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
}

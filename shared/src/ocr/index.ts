/**
 * OCR import contracts.
 *
 * Segmentation is a pure function over text, so it lives here rather than in
 * the frontend: it is the definition of what an imported paragraph *is*, and
 * the backend will need it the day import moves server-side or gains an API.
 */

export type { ExtractedParagraph } from './segment.js'
export { segmentParagraphs } from './segment.js'
export { dewrap } from './dewrap.js'
export { enhanceOcrText, enhanceNotesText } from './ocr-enhancer.js'
export { extractTextFromPdfStream } from './pdf.js'

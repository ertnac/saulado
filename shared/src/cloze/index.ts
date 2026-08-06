/**
 * The cloze engine — the offset model from plan §2.1.
 *
 * Everything here is pure: no DB, no DOM, no dates. That's what makes the
 * invariants testable in isolation, and it's why the same code runs in the
 * editor, the API validator, and the study renderer without divergence.
 */

export type {
  AnswerRange,
  CardAnswer,
  ClozeIssue,
  ClozeIssueCode,
  DraftAnswer,
  ReanchorResult,
  Segment,
} from './types.js'
export { ClozeError } from './types.js'

export {
  codePointLength,
  codePointToCodeUnit,
  codeUnitToCodePoint,
  sliceCodePoints,
  toCodePoints,
} from './codepoints.js'

export {
  answerAtOffset,
  answerLength,
  assignOrdinals,
  createAnswer,
  isCardAnswer,
  normalizeParagraph,
  rangesOverlap,
  refreshAnswerText,
  snapToWordBoundaries,
  validateAnswers,
} from './answers.js'

export { reconstructParagraph, renderCloze, renderClozeText } from './render.js'

export { needsReanchoring, reanchorAnswers } from './reanchor.js'

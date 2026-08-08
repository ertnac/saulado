/**
 * Set, card and tag contracts for the API.
 *
 * Mirrors `auth/` — shared types plus the constants the backend turns into Zod
 * schemas. The cloze engine stays where it is; these types reference its
 * `CardAnswer` rather than re-declaring an answer shape, so an answer can only
 * mean one thing across the editor, the wire and the database.
 */

export type {
  AnswerInput,
  CardResponse,
  CardsResponse,
  CreateCardRequest,
  CreateSetRequest,
  Page,
  SetResponse,
  SetsResponse,
  StudyCard,
  StudyCardSummary,
  StudySet,
  TagCount,
  TagsResponse,
  UpdateCardRequest,
  UpdateSetRequest,
} from './types.js'

export {
  ALT_ANSWERS_MAX_PER_ANSWER,
  ALT_ANSWER_MAX_LENGTH,
  ANSWERS_MAX_PER_CARD,
  CARD_TITLE_MAX_LENGTH,
  DEFAULT_SET_COLOR,
  PARAGRAPH_MAX_CODE_POINTS,
  PARAGRAPH_MIN_CODE_POINTS,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  SET_COLORS,
  SET_DESCRIPTION_MAX_LENGTH,
  SET_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TAGS_MAX_PER_CARD,
  isSetColor,
  normalizeTag,
  normalizeTags,
} from './limits.js'

export type { SetColor } from './limits.js'

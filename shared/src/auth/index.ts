export type {
  PublicUser,
  UserSettings,
  BlankWidthMode,
  RegisterRequest,
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  AuthResponse,
  MessageResponse,
  ApiErrorResponse,
  ApiErrorCode,
  AccessTokenClaims,
} from './types.js'

/** A value, not a type — `z.enum` and the settings form both need the tuple. */
export { BLANK_WIDTH_MODES } from './types.js'

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
  EMAIL_MAX_LENGTH,
  passwordByteLength,
  checkPassword,
  normalizeEmail,
  type PasswordProblem,
} from './policy.js'

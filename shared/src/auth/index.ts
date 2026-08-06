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

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
  EMAIL_MAX_LENGTH,
  passwordByteLength,
  checkPassword,
  normalizeEmail,
  type PasswordProblem,
} from './policy.js'

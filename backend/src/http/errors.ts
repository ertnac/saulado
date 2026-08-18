import type { ApiErrorCode, ApiErrorResponse } from '@saulado/shared'
import type { Response } from 'express'

/**
 * One error shape for the whole API.
 *
 * Every non-2xx body is `{ error: { code, message, ... } }`. The frontend
 * switches on `code`; `message` is for humans and may change wording without
 * breaking a client.
 */

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  EMAIL_TAKEN: 409,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
}

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get status(): number {
    return STATUS_BY_CODE[this.code]
  }
}

export function sendError(
  res: Response,
  code: ApiErrorCode,
  message: string,
  extra?: { fields?: Record<string, string>; retryAfter?: number },
): void {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(extra?.fields ? { fields: extra.fields } : {}),
      ...(extra?.retryAfter !== undefined ? { retryAfter: extra.retryAfter } : {}),
    },
  }
  res.status(STATUS_BY_CODE[code]).json(body)
}

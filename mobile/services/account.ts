import type { ConfirmEmailChangeRequest, MessageResponse } from '@saulado/shared'
import { request } from './api'

/**
 * Unauthorized on purpose — `request`, not `authorizedRequest`.
 *
 * The confirmation link is opened from whatever mail client holds the *new*
 * address, so the app instance that handles it is routinely not signed in — that
 * is why the backend serves this from `accountPublicRouter`. The token in the
 * body is the credential.
 *
 * The rest of `frontend/src/services/account.ts` arrives in Phase 5 with the
 * settings and account screens. This one function lands early because the
 * universal link that reaches it is Phase 2 work.
 */
export function confirmEmailChange(body: ConfirmEmailChangeRequest): Promise<MessageResponse> {
  return request<MessageResponse>('/api/account/email/confirm', { method: 'POST', body })
}

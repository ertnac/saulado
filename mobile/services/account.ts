import type {
  ChangeEmailRequest,
  ChangePasswordRequest,
  ConfirmEmailChangeRequest,
  DataExport,
  DeleteAccountRequest,
  MessageResponse,
  SearchFilters,
  SearchResponse,
  SettingsResponse,
  UpdateSettingsRequest,
} from '@saulado/shared'
import { authorizedRequest, request } from './api'

/**
 * Search, settings and account endpoints — a port of
 * `frontend/src/services/account.ts`. Same paths, same bodies, same shapes.
 *
 * One difference, forced by the runtime: `toQuery` is hand-rolled rather than
 * built on `URLSearchParams`, for the same reason `services/cards.ts` does it
 * that way. React Native ships a partial polyfill whose `set` throws "not
 * implemented" — only `append` and `toString` work — so the web version's
 * `params.set(...)` would be a runtime error on the first search rather than a
 * compile error here.
 */

/**
 * Builds the query string from a filter object.
 *
 * Absent and empty are both omitted rather than sent as `&q=`, because the two
 * mean the same thing to the server (browse) and an empty parameter would make
 * otherwise-identical requests produce different cache keys. Array values repeat
 * the key, which is what the backend's `tags` schema expects.
 */
function toQuery(filters: SearchFilters): string {
  const parts: string[] = []

  // Annotated because `Object.entries` on a type with no index signature falls
  // back to the `[string, any][]` overload, which would make every value below
  // an implicit `any`.
  const entries = Object.entries(filters) as [string, string | string[] | number | undefined][]

  for (const [key, value] of entries) {
    if (value === undefined || value === '') continue

    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
    }
  }

  return parts.join('&')
}

export function search(filters: SearchFilters, signal?: AbortSignal): Promise<SearchResponse> {
  const query = toQuery(filters)
  return authorizedRequest<SearchResponse>(`/api/search${query ? `?${query}` : ''}`, {
    ...(signal ? { signal } : {}),
  })
}

export function getSettings(): Promise<SettingsResponse> {
  return authorizedRequest<SettingsResponse>('/api/settings')
}

export function updateSettings(patch: UpdateSettingsRequest): Promise<SettingsResponse> {
  return authorizedRequest<SettingsResponse>('/api/settings', { method: 'PATCH', body: patch })
}

export function changeEmail(body: ChangeEmailRequest): Promise<MessageResponse> {
  return authorizedRequest<MessageResponse>('/api/account/email', { method: 'POST', body })
}

/**
 * Unauthorized on purpose — `request`, not `authorizedRequest`.
 *
 * The confirmation link is opened from whatever mail client holds the *new*
 * address, so the app instance that handles it is routinely not signed in — that
 * is why the backend serves this from `accountPublicRouter`. The token in the
 * body is the credential.
 */
export function confirmEmailChange(body: ConfirmEmailChangeRequest): Promise<MessageResponse> {
  return request<MessageResponse>('/api/account/email/confirm', { method: 'POST', body })
}

export function changePassword(body: ChangePasswordRequest): Promise<MessageResponse> {
  return authorizedRequest<MessageResponse>('/api/account/password', { method: 'POST', body })
}

export function exportData(): Promise<DataExport> {
  return authorizedRequest<DataExport>('/api/account/export')
}

export function deleteAccount(body: DeleteAccountRequest): Promise<void> {
  return authorizedRequest<void>('/api/account', { method: 'DELETE', body })
}

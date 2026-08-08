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
 * Search, settings and account endpoints (plan §6).
 *
 * Thin like the rest of `services/` — every shape comes from `@saulado/shared`,
 * so a contract change is a compile error rather than a screen quietly rendering
 * `undefined`.
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
  const params = new URLSearchParams()

  // Annotated because `Object.entries` on a type with no index signature falls
  // back to the `[string, any][]` overload, which would make every value below
  // an implicit `any` — including the ones handed straight to `append`.
  const entries = Object.entries(filters) as [string, string | string[] | number | undefined][]

  for (const [key, value] of entries) {
    if (value === undefined || value === '') continue

    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
      continue
    }

    params.set(key, String(value))
  }

  return params.toString()
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
 * address, which is routinely not the signed-in browser. Sending a bearer token
 * would be harmless but pointless; the token in the body is the credential.
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

import type {
  AnswerResponse,
  DueCountsResponse,
  SessionResponse,
  SubmitAnswerRequest,
  SummaryResponse,
  StartSessionRequest,
} from '@saulado/shared'

import { authorizedRequest } from './api'

/**
 * The study endpoints, one function each.
 *
 * A straight port of `frontend/src/services/study.ts` — same paths, same
 * bodies, same shapes. Only the import changes, because the native client
 * carries its token in SecureStore rather than a cookie and `authorizedRequest`
 * is where that difference already lives.
 */

export function startSession(body: StartSessionRequest = {}): Promise<SessionResponse> {
  return authorizedRequest<SessionResponse>('/api/study/sessions', {
    method: 'POST',
    body,
  })
}

export function getSession(sessionId: string): Promise<SessionResponse> {
  return authorizedRequest<SessionResponse>(`/api/study/sessions/${encodeURIComponent(sessionId)}`)
}

export function submitAnswer(
  sessionId: string,
  body: SubmitAnswerRequest,
): Promise<AnswerResponse> {
  return authorizedRequest<AnswerResponse>(
    `/api/study/sessions/${encodeURIComponent(sessionId)}/answers`,
    { method: 'POST', body },
  )
}

export function completeSession(sessionId: string): Promise<SummaryResponse> {
  return authorizedRequest<SummaryResponse>(
    `/api/study/sessions/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST' },
  )
}

export function getDueCounts(): Promise<DueCountsResponse> {
  return authorizedRequest<DueCountsResponse>('/api/study/due')
}

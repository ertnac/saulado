import type {
  AnswerResponse,
  DueCountsResponse,
  SessionResponse,
  StartSessionRequest,
  SubmitAnswerRequest,
  SummaryResponse,
} from '@saulado/shared'
import { authorizedRequest } from './api'

/**
 * Typed wrappers over the study endpoints.
 *
 * Thin like `services/cards.ts` — every shape comes from `@saulado/shared`, so a
 * contract change is a compile error rather than a runtime surprise. Note what
 * is *absent* from `SubmitAnswerRequest`: there is no `grade` field. The client
 * reports what the user typed and the server decides what it was worth.
 */

export function startSession(body: StartSessionRequest): Promise<SessionResponse> {
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

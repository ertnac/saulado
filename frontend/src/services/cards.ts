import type {
  CardResponse,
  CardsResponse,
  CreateCardRequest,
  CreateSetRequest,
  SetResponse,
  SetsResponse,
  TagsResponse,
  UpdateCardRequest,
  UpdateSetRequest,
} from '@saulado/shared'
import { authorizedRequest } from './api'

/**
 * Typed wrappers over the sets, cards and tags endpoints.
 *
 * Thin on purpose, like `services/auth.ts` — the value is that every shape comes
 * from `@saulado/shared`, so a backend contract change is a frontend compile
 * error rather than a runtime surprise. Caching, invalidation and optimistic
 * updates live in `features/cards/queries.ts`; this module only speaks HTTP.
 */

/** Builds a query string, omitting anything absent. Repeats `tag` per value. */
function toQuery(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue

    if (Array.isArray(value)) {
      // `?tag=a&tag=b` — repeated keys, which is what `listCardsQuerySchema`
      // parses. A comma-joined single value would arrive as one tag named "a,b".
      for (const item of value) search.append(key, item)
      continue
    }

    search.set(key, String(value))
  }

  const query = search.toString()
  return query.length > 0 ? `?${query}` : ''
}

// ── Sets ────────────────────────────────────────────────────────────────────

export interface ListSetsParams {
  cursor?: string
  limit?: number
  /** Absent means active sets only; archiving exists to get a set out of the way. */
  archived?: boolean
}

export function listSets(params: ListSetsParams = {}): Promise<SetsResponse> {
  const { archived, ...rest } = params
  // Sent only when true: the server reads the *presence* of `archived=true`, and
  // `archived=false` is the same request as omitting it.
  return authorizedRequest<SetsResponse>(
    `/api/sets${toQuery({ ...rest, archived: archived ? 'true' : undefined })}`,
  )
}

export function getSet(id: string): Promise<SetResponse> {
  return authorizedRequest<SetResponse>(`/api/sets/${encodeURIComponent(id)}`)
}

export function createSet(body: CreateSetRequest): Promise<SetResponse> {
  return authorizedRequest<SetResponse>('/api/sets', { method: 'POST', body })
}

export function updateSet(id: string, body: UpdateSetRequest): Promise<SetResponse> {
  return authorizedRequest<SetResponse>(`/api/sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  })
}

export function deleteSet(id: string): Promise<void> {
  return authorizedRequest<void>(`/api/sets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── Cards ───────────────────────────────────────────────────────────────────

export interface ListCardsParams {
  cursor?: string
  limit?: number
  /** Repeatable. Multiple tags narrow the list — the server uses `hasEvery`. */
  tag?: string[]
}

export function listCards(setId: string, params: ListCardsParams = {}): Promise<CardsResponse> {
  return authorizedRequest<CardsResponse>(
    `/api/sets/${encodeURIComponent(setId)}/cards${toQuery({ ...params })}`,
  )
}

export function getCard(id: string): Promise<CardResponse> {
  return authorizedRequest<CardResponse>(`/api/cards/${encodeURIComponent(id)}`)
}

export function createCard(setId: string, body: CreateCardRequest): Promise<CardResponse> {
  return authorizedRequest<CardResponse>(`/api/sets/${encodeURIComponent(setId)}/cards`, {
    method: 'POST',
    body,
  })
}

export function updateCard(id: string, body: UpdateCardRequest): Promise<CardResponse> {
  return authorizedRequest<CardResponse>(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  })
}

export function deleteCard(id: string): Promise<void> {
  return authorizedRequest<void>(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── Tags ────────────────────────────────────────────────────────────────────

export function listTags(): Promise<TagsResponse> {
  return authorizedRequest<TagsResponse>('/api/tags')
}

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
 * A port of `frontend/src/services/cards.ts` — same paths, same bodies, same
 * shapes, same reasons. Two things differ, both forced by the runtime.
 *
 * `toQuery` is hand-rolled rather than built on `URLSearchParams`. React
 * Native ships a partial polyfill whose `set` and `get` throw
 * "not implemented" — only `append` and `toString` work — so the web version's
 * `search.set(...)` would be a runtime error on the first list request rather
 * than a compile error here.
 *
 * Everything else is identical, including the two decisions worth not
 * re-deriving: `archived` is sent only when true, because the server reads the
 * *presence* of `archived=true` and `archived=false` is the same request as
 * omitting it; and `tag` repeats per value, because `listCardsQuerySchema`
 * parses repeated keys and a comma-join would arrive as one tag named "a,b".
 */

function toQuery(params: Record<string, string | number | string[] | undefined>): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue

    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ── Sets ────────────────────────────────────────────────────────────────────

export interface ListSetsParams {
  cursor?: string
  limit?: number
  /** Absent means active sets only; archiving exists to get a set out of the way. */
  archived?: boolean
  /**
   * Absent lists the **root** sets; a set id lists that set's direct children.
   *
   * Not a filter narrowing one list but a different slice of the tree, which is
   * why the library drills down rather than flattening: a flat list of every
   * depth would show a child once under its parent and again on its own.
   */
  parent?: string
}

export function listSets(params: ListSetsParams = {}): Promise<SetsResponse> {
  const { archived, ...rest } = params
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

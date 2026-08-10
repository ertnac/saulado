import type {
  CardResponse,
  CardsResponse,
  CreateCardRequest,
  CreateSetRequest,
  SetResponse,
  SetsResponse,
  StudyCardSummary,
  StudySet,
  UpdateCardRequest,
  UpdateSetRequest,
} from '@saulado/shared'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import * as api from '../services/cards'

/**
 * Caching, invalidation and optimistic updates for sets and cards — a port of
 * `frontend/src/features/cards/queries.ts`.
 *
 * Only the import path differs. Every key, every patch and every invalidation
 * rule is the same as the web's, deliberately: the two clients talk to one API
 * and one of them being cleverer about staleness only produces two different
 * sets of bugs.
 *
 * It lives in `hooks/` rather than a new `features/` tree because that is where
 * this app keeps its hooks, and it is a file of hooks.
 *
 * Which mutations are optimistic is a choice, not a policy. Renames, archive
 * toggles and deletes are: the server cannot tell the client anything it does
 * not already know. Creates are not: the server assigns the id and derives every
 * `answerText` from the paragraph, so an optimistic card would be a guess at
 * data the client is specifically not trusted to produce.
 */

// ── Keys ────────────────────────────────────────────────────────────────────

export const setKeys = {
  all: ['sets'] as const,
  lists: () => [...setKeys.all, 'list'] as const,
  /**
   * One entry per *request*, not one list filtered several ways. Archived sets
   * and a set's children come from different requests; sharing an entry would
   * flash a parent's children into the root list on refetch.
   *
   * Both dimensions ride in one object at the same position, so `lists()` stays
   * a two-element prefix matching every variant — which is what lets the
   * optimistic patches reach a set wherever it happens to be cached.
   */
  list: (options: { archived: boolean; parent: string | null }) =>
    [...setKeys.lists(), options] as const,
  details: () => [...setKeys.all, 'detail'] as const,
  detail: (id: string) => [...setKeys.details(), id] as const,
}

export const cardKeys = {
  all: ['cards'] as const,
  lists: () => [...cardKeys.all, 'list'] as const,
  /**
   * Tags are sorted into the key so `?tag=a&tag=b` and `?tag=b&tag=a` — the same
   * request, since the server uses `hasEvery` — share one entry. Copied before
   * sorting: sorting the caller's array would reorder their UI as a side effect.
   */
  list: (setId: string, tags: readonly string[] = []) =>
    [...cardKeys.lists(), setId, [...tags].sort()] as const,
  details: () => [...cardKeys.all, 'detail'] as const,
  detail: (id: string) => [...cardKeys.details(), id] as const,
}

export const tagKeys = {
  all: ['tags'] as const,
}

// ── Cache helpers ───────────────────────────────────────────────────────────

/**
 * Rewrites every page of every matching infinite list.
 *
 * Optimistic edits have to reach into pages: a card the user renames may sit on
 * page three, and replacing only `pages[0]` leaves the old text on screen.
 */
function patchPages<T>(
  client: QueryClient,
  queryKey: readonly unknown[],
  patch: (items: T[]) => T[],
): void {
  client.setQueriesData<InfiniteData<{ items: T[]; nextCursor: string | null }>>(
    { queryKey },
    (data) =>
      data
        ? { ...data, pages: data.pages.map((page) => ({ ...page, items: patch(page.items) })) }
        : data,
  )
}

/** Applies `patch` to the set with `id` wherever it is cached — lists and detail. */
function patchSet(client: QueryClient, id: string, patch: (set: StudySet) => StudySet): void {
  patchPages<StudySet>(client, setKeys.lists(), (items) =>
    items.map((item) => (item.id === id ? patch(item) : item)),
  )

  client.setQueryData<SetResponse>(setKeys.detail(id), (data) =>
    data ? { set: patch(data.set) } : data,
  )
}

/**
 * Adjusts a set's denormalised card counts.
 *
 * They live on the set row so the list need not fetch them per set, which means
 * adding or removing a card leaves them stale in a way the user sees at once —
 * delete the last card and the set still claims "1 card". Clamped at zero.
 *
 * Ancestors' subtree totals move too and are deliberately not patched: the
 * client would have to know the chain, and the screen showing those numbers is
 * one navigation and a refetch away.
 */
function shiftCardCount(client: QueryClient, setId: string, delta: number): void {
  patchSet(client, setId, (set) => ({
    ...set,
    cardCount: Math.max(0, set.cardCount + delta),
    subtreeCardCount: Math.max(0, set.subtreeCardCount + delta),
  }))
}

// ── Set queries ─────────────────────────────────────────────────────────────

/**
 * A page of sets, with "Load more" driven by the server's cursor.
 *
 * `parent` defaults to the roots, matching the API. Passing a set id lists that
 * set's direct children, which is how the set screen renders its sub-sets.
 */
export function useSets(options: { archived?: boolean; parent?: string | null } = {}) {
  const archived = options.archived ?? false
  const parent = options.parent ?? null

  return useInfiniteQuery({
    queryKey: setKeys.list({ archived, parent }),
    queryFn: ({ pageParam }) =>
      api.listSets({
        cursor: pageParam,
        archived: archived ? true : undefined,
        parent: parent ?? undefined,
      }),
    // `undefined` rather than `null`: react-query treats `undefined` as "no more
    // pages" and `hasNextPage` stays true for any other value, including null.
    getNextPageParam: (last: SetsResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useSet(id: string | undefined) {
  return useQuery({
    queryKey: setKeys.detail(id ?? ''),
    queryFn: () => api.getSet(id as string),
    // Guards the route-param case: `/sets/[setId]` can render for one frame with
    // the param still undefined, and `/api/sets/undefined` is a 404 the user
    // would read as "set not found".
    enabled: id !== undefined && id.length > 0,
  })
}

// ── Set mutations ───────────────────────────────────────────────────────────

/**
 * Creates a set.
 *
 * Not optimistic: the id comes from the server and the UI navigates to it. An
 * invented id would have to be swapped out mid-navigation, and getting that
 * wrong strands the user on a route for a set that never existed.
 *
 * Every list is invalidated, not only the one the new set lands in: creating a
 * child changes its parent's `childCount` and `subtreeCardCount`, and the parent
 * sits in a different list from the child.
 */
export function useCreateSet(): UseMutationResult<SetResponse, Error, CreateSetRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateSetRequest) => api.createSet(body),
    onSuccess: (data) => {
      // Seed the detail cache so navigating straight to the new set renders
      // immediately instead of spinning for data we are holding.
      client.setQueryData<SetResponse>(setKeys.detail(data.set.id), data)
      void client.invalidateQueries({ queryKey: setKeys.lists() })
    },
  })
}

/**
 * Renames a set — optimistically.
 *
 * The id travels in the variables rather than being bound at hook creation,
 * because a list needs one mutation for every row and hooks cannot be called in
 * a loop. Callers pass `{ id, body }`.
 *
 * The rollback keeps the *whole* previous cache rather than inverting the patch:
 * an inverse edit assumes nothing else changed in between, and a background
 * refetch landing mid-flight breaks that assumption quietly.
 *
 * ponytail: the web version also patches `parentId`, `color` and `archivedAt`
 * because its UI can move, recolour and archive a set. This one cannot yet, so
 * it patches the one field it can change. Widen it alongside that UI, and copy
 * the web's `'parentId' in body` test when you do — the API distinguishes moving
 * a set to the root (null) from leaving it alone (absent), and `??` would treat
 * an intentional null as the second.
 */
export function useRenameSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSetRequest }) => api.updateSet(id, body),

    onMutate: async ({ id, body }) => {
      // In-flight refetches are cancelled first: one resolving after the patch
      // would overwrite it with pre-edit server state, and the user would watch
      // their rename undo itself.
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = client.getQueriesData({ queryKey: setKeys.all })

      patchSet(client, id, (set) => ({ ...set, title: body.title ?? set.title }))

      return { previous }
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: setKeys.all })
    },
  })
}

// ── Card queries ────────────────────────────────────────────────────────────

export function useCards(setId: string | undefined, tags: readonly string[] = []) {
  return useInfiniteQuery({
    queryKey: cardKeys.list(setId ?? '', tags),
    queryFn: ({ pageParam }) =>
      api.listCards(setId as string, {
        cursor: pageParam,
        // An empty array serialises to no query params anyway, but `undefined`
        // keeps the request byte-identical to an unfiltered one.
        tag: tags.length > 0 ? [...tags] : undefined,
      }),
    getNextPageParam: (last: CardsResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: setId !== undefined && setId.length > 0,
  })
}

/**
 * One card, with its answers.
 *
 * The list carries `StudyCardSummary` — no answers — so this is the fetch the
 * editor needs before it can render highlights. Seeding it from a list entry
 * would produce a card whose `answers` array is missing, which the editor would
 * faithfully render as a paragraph with no blanks.
 */
export function useCard(id: string | undefined) {
  return useQuery({
    queryKey: cardKeys.detail(id ?? ''),
    queryFn: () => api.getCard(id as string),
    enabled: id !== undefined && id.length > 0,
  })
}

// ── Card mutations ──────────────────────────────────────────────────────────

/**
 * Creates a card.
 *
 * Not optimistic, for a reason specific to this app: the server slices every
 * `answerText` out of the paragraph itself, and the client deliberately does not
 * send it (see `AnswerInput`). An optimistic card would have to invent that
 * text, which is exactly the client-supplied answer the offset model exists to
 * reject.
 */
export function useCreateCard(
  setId: string,
): UseMutationResult<CardResponse, Error, CreateCardRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateCardRequest) => api.createCard(setId, body),
    onSuccess: (data) => {
      client.setQueryData<CardResponse>(cardKeys.detail(data.card.id), data)
      void client.invalidateQueries({ queryKey: cardKeys.lists() })
      shiftCardCount(client, setId, 1)
      if (data.card.tags.length > 0) void client.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

/**
 * Edits a card.
 *
 * Optimistic on the summary fields only. `paragraph` is patched because it is
 * what the row is labelled with (`cardLabel` derives the label from it), but
 * `answers` are left to the server response: they come back with server-derived
 * text, so patching them from the request would briefly show text that is not
 * what was stored.
 */
export function useUpdateCard(id: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateCardRequest) => api.updateCard(id, body),

    onMutate: async (body: UpdateCardRequest) => {
      await client.cancelQueries({ queryKey: cardKeys.all })
      const previous = client.getQueriesData({ queryKey: cardKeys.all })

      patchPages<StudyCardSummary>(client, cardKeys.lists(), (items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                paragraph: body.paragraph ?? item.paragraph,
                tags: body.tags ?? item.tags,
                answerCount: body.answers?.length ?? item.answerCount,
              }
            : item,
        ),
      )

      return { previous }
    },

    onError: (_error, _body, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data)
    },

    onSuccess: (data, body) => {
      client.setQueryData<CardResponse>(cardKeys.detail(id), data)
      if (body.tags !== undefined) void client.invalidateQueries({ queryKey: tagKeys.all })
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: cardKeys.lists() })
    },
  })
}

/**
 * Deletes a card.
 *
 * `setId` is a parameter rather than read from the cache, because the row it
 * would be read from is the one being removed — and after an optimistic delete
 * there is nothing left to ask which set the card belonged to.
 */
export function useDeleteCard(setId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteCard(id),

    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: cardKeys.all })
      // The set caches are captured too, because `shiftCardCount` edits them and
      // a rollback restoring only the card caches would leave the set claiming
      // one card fewer than it has.
      const previous = [
        ...client.getQueriesData({ queryKey: cardKeys.all }),
        ...client.getQueriesData({ queryKey: setKeys.all }),
      ]

      patchPages<StudyCardSummary>(client, cardKeys.lists(), (items) =>
        items.filter((item) => item.id !== id),
      )
      client.removeQueries({ queryKey: cardKeys.detail(id) })
      shiftCardCount(client, setId, -1)

      return { previous }
    },

    onError: (_error, _id, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data)
    },

    onSuccess: () => {
      void client.invalidateQueries({ queryKey: tagKeys.all })
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: cardKeys.lists() })
    },
  })
}

/**
 * Flattens an infinite query's pages into one list.
 *
 * Components render a list, not a paginated structure — every consumer would
 * otherwise write the same `data?.pages.flatMap(...)` and the `?? []` that stops
 * it being undefined on first render.
 */
export function flattenPages<T>(
  data: InfiniteData<{ items: T[]; nextCursor: string | null }> | undefined,
): T[] {
  return data?.pages.flatMap((page) => page.items) ?? []
}

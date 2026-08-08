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
import * as api from '@/services/cards'

/**
 * Caching, invalidation and optimistic updates for sets and cards.
 *
 * `services/cards.ts` speaks HTTP and nothing else; everything about *when* to
 * refetch and what the UI shows in the meantime lives here. Keeping the split
 * means a component never has to know a cache exists, and the invalidation rules
 * are all readable in one file instead of scattered across call sites.
 *
 * Which mutations are optimistic is a deliberate choice rather than a blanket
 * policy. Renames, archive toggles and deletes are optimistic: the server cannot
 * tell the client anything it does not already know, so waiting on a round trip
 * only adds lag to an action the user expects to feel instant. Creates are not:
 * the server assigns the id and derives every `answerText` from the paragraph
 * (plan §3.2), so an optimistic card would be a guess at data the client is
 * specifically not trusted to produce — and the id it invented would be the one
 * the UI then navigates to.
 */

// ── Keys ────────────────────────────────────────────────────────────────────

/**
 * Query keys, as factories rather than inline arrays.
 *
 * Every key starts with the same root so `invalidateQueries({ queryKey: setKeys.all })`
 * catches lists and details together. Hand-written arrays at call sites drift —
 * one `['sets', id]` against one `['set', id]` is a cache miss that looks like a
 * loading bug.
 */
export const setKeys = {
  all: ['sets'] as const,
  lists: () => [...setKeys.all, 'list'] as const,
  /**
   * Archived sets are a separate cache entry, not a filter applied to one list.
   * They are different result sets from different requests, and sharing an entry
   * would show archived sets flashing into the active list on refetch.
   */
  list: (archived: boolean) => [...setKeys.lists(), { archived }] as const,
  details: () => [...setKeys.all, 'detail'] as const,
  detail: (id: string) => [...setKeys.details(), id] as const,
}

export const cardKeys = {
  all: ['cards'] as const,
  lists: () => [...cardKeys.all, 'list'] as const,
  /**
   * Tags are sorted into the key so `?tag=a&tag=b` and `?tag=b&tag=a` — the same
   * request, since the server uses `hasEvery` — share one cache entry instead of
   * refetching whenever the chip order changes. Copied before sorting: sorting
   * the caller's array in place would reorder their UI as a side effect.
   */
  list: (setId: string, tags: readonly string[] = []) =>
    [...cardKeys.lists(), setId, [...tags].sort()] as const,
  /**
   * Every cached list for one set, whatever tag filter produced it.
   *
   * Three elements, not four: key filters match by prefix, so
   * `['cards','list',setId]` catches `['cards','list',setId,['computing']]` while
   * `cardKeys.list(setId)` — which ends in an empty tag array — would only ever
   * match the unfiltered list and quietly leave the filtered ones behind.
   */
  listsForSet: (setId: string) => [...cardKeys.lists(), setId] as const,
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
 * Optimistic edits have to reach into pages, not just the top-level result: a
 * card the user renames may sit on page three, and replacing only `pages[0]`
 * would leave the old title on screen until the next refetch. `undefined` pages
 * are passed through — a list that was never fetched has nothing to patch.
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
 * Adjusts a set's denormalised `cardCount`.
 *
 * The count lives on the set row so the list does not have to fetch it per set
 * (plan §4.3), which means adding or removing a card leaves it stale in a way the
 * user sees immediately — delete the last card and the set still claims "1 card".
 * Clamped at zero so a double-fire cannot render "-1 cards".
 */
function shiftCardCount(client: QueryClient, setId: string, delta: number): void {
  patchSet(client, setId, (set) => ({
    ...set,
    cardCount: Math.max(0, set.cardCount + delta),
  }))
}

// ── Set queries ─────────────────────────────────────────────────────────────

/**
 * A page of sets, with "Load more" driven by the server's cursor.
 *
 * `useInfiniteQuery` rather than a page-number query because the API is keyset
 * paginated: there is no page 3 to ask for, only "what follows this cursor".
 * That is also what keeps the list stable while the user is creating sets —
 * an offset would shift every subsequent page under them.
 */
export function useSets(options: { archived?: boolean } = {}) {
  const archived = options.archived ?? false

  return useInfiniteQuery({
    queryKey: setKeys.list(archived),
    queryFn: ({ pageParam }) =>
      api.listSets({ cursor: pageParam, archived: archived ? true : undefined }),
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
    // Guards the route-param case: `/sets/:id` can render for one frame with the
    // param still undefined, and a request to `/api/sets/undefined` is a 404 the
    // user would see as "set not found".
    enabled: id !== undefined && id.length > 0,
  })
}

// ── Set mutations ───────────────────────────────────────────────────────────

/**
 * Creates a set.
 *
 * Not optimistic: the id comes from the server and the UI navigates to it. An
 * invented id would have to be swapped out mid-navigation, and getting that wrong
 * strands the user on a route for a set that never existed.
 */
export function useCreateSet(): UseMutationResult<SetResponse, Error, CreateSetRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateSetRequest) => api.createSet(body),
    onSuccess: (data) => {
      // Seed the detail cache from the response so navigating straight to the new
      // set renders immediately instead of showing a spinner for data we hold.
      client.setQueryData<SetResponse>(setKeys.detail(data.set.id), data)
      void client.invalidateQueries({ queryKey: setKeys.lists() })
    },
  })
}

/**
 * Renames, recolours, archives or restores a set — optimistically.
 *
 * The id travels in the mutation variables rather than being bound at hook
 * creation, because the sets list needs one mutation for every row and hooks
 * cannot be called in a loop. Callers pass `{ id, body }`.
 *
 * The rollback keeps the *whole* previous cache rather than trying to invert the
 * patch: an inverse edit assumes nothing else changed in between, and a
 * background refetch landing mid-flight breaks that assumption quietly.
 */
export function useUpdateSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSetRequest }) => api.updateSet(id, body),

    onMutate: async ({ id, body }) => {
      // In-flight refetches are cancelled first: one that resolves after the
      // optimistic patch would overwrite it with the pre-edit server state, and
      // the user would watch their rename undo itself.
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = client.getQueriesData({ queryKey: setKeys.all })

      patchSet(client, id, (set) => ({
        ...set,
        title: body.title ?? set.title,
        // `'description' in body` rather than `?? set.description`, because the
        // API distinguishes clearing a description (null) from leaving it alone
        // (absent) — and `??` would treat an intentional null as "leave alone".
        description: 'description' in body ? (body.description ?? null) : set.description,
        color: body.color ?? set.color,
        archivedAt:
          body.archived === undefined
            ? set.archivedAt
            : body.archived
              ? (set.archivedAt ?? new Date().toISOString())
              : null,
      }))

      // Archiving moves the set between two separately-cached lists, and neither
      // one can be patched into agreement — the archived list may never have been
      // fetched. Removing it from the list it is leaving is the honest optimistic
      // step; `onSettled` refetches both.
      if (body.archived !== undefined) {
        patchPages<StudySet>(client, setKeys.list(!body.archived), (items) =>
          items.filter((item) => item.id !== id),
        )
      }

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

/**
 * Deletes a set and everything in it.
 *
 * The card caches go too. `removeQueries` rather than `invalidateQueries` for
 * those: invalidating would refetch cards for a set that no longer exists, and
 * every one of those requests is a 404 the error boundary would surface.
 */
export function useDeleteSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.deleteSet(id),

    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = client.getQueriesData({ queryKey: setKeys.all })

      patchPages<StudySet>(client, setKeys.lists(), (items) =>
        items.filter((item) => item.id !== id),
      )
      client.removeQueries({ queryKey: setKeys.detail(id) })

      return { previous }
    },

    onError: (_error, _id, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data)
    },

    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: cardKeys.listsForSet(id) })
      // Cards carried tags, and the deleted ones may have been the last users of
      // theirs — the tag filter would otherwise offer a tag matching nothing.
      void client.invalidateQueries({ queryKey: tagKeys.all })
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: setKeys.lists() })
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
        // An empty array would serialise to no query params anyway, but sending
        // `undefined` keeps the request identical to an unfiltered one.
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

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: () => api.listTags(),
    // Tag counts drift constantly and nothing depends on them being exact — the
    // filter bar is a navigation aid, not a report.
    staleTime: 5 * 60_000,
  })
}

// ── Card mutations ──────────────────────────────────────────────────────────

/**
 * Creates a card.
 *
 * Not optimistic, for a reason specific to this app: the server slices every
 * `answerText` out of the paragraph itself, and the client deliberately does not
 * send it (see `AnswerInput`). An optimistic card would have to invent that text,
 * which is exactly the client-supplied answer the offset model exists to reject.
 */
export function useCreateCard(
  setId: string,
): UseMutationResult<CardResponse, Error, CreateCardRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateCardRequest) => api.createCard(setId, body),
    onSuccess: (data) => {
      client.setQueryData<CardResponse>(cardKeys.detail(data.card.id), data)
      // Every tag filter for this set is invalidated, not just the active one:
      // the new card may carry a tag the user is currently filtered to.
      void client.invalidateQueries({ queryKey: cardKeys.lists() })
      shiftCardCount(client, setId, 1)
      if (data.card.tags.length > 0) void client.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

/**
 * Edits a card.
 *
 * Optimistic on the summary fields only. `paragraph` and `answers` are left to
 * the server response: the answers come back with server-derived text and any
 * normalisation the server applied to the paragraph, so patching them from the
 * request would briefly show text that is not what was stored.
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
                title: body.title ?? item.title,
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

      // A move changes which set owns the card, so both counts are wrong and the
      // source set's list still holds the row.
      if (body.studySetId !== undefined && body.studySetId !== data.card.studySetId) {
        void client.invalidateQueries({ queryKey: setKeys.all })
      }
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
      // a rollback that restored only the card caches would leave the set
      // claiming one card fewer than it has. Refetching instead would depend on
      // something being mounted to observe the query.
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

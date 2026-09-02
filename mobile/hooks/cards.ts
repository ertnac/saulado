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
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import * as api from '../services/cards'
import * as offlineData from '../lib/offline/data-source'
import { useAuthStore } from '../stores/auth'
import { loadAuthCache } from '../services/auth-cache'

async function resolveUserId(): Promise<string> {
  const storeUser = useAuthStore.getState().user
  if (storeUser?.id) return storeUser.id
  const cached = await loadAuthCache()
  if (cached?.user?.id) return cached.user.id
  try {
    const db = await offlineData.getDatabase()
    const row = await db.getFirstAsync<{ user_id: string }>(
      'SELECT user_id FROM study_sets WHERE user_id IS NOT NULL LIMIT 1',
    )
    if (row?.user_id) return row.user_id
  } catch {
    // Database may not be initialized yet
  }
  return 'local-user'
}

function isNetworkError(error: unknown): boolean {
  if (!onlineManager.isOnline()) return true
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('connection refused') ||
      msg.includes('timeout') ||
      msg.includes('aborted') ||
      msg.includes('abort') ||
      msg.includes('transient') ||
      msg.includes('offline') ||
      msg.includes('unauthorized') ||
      msg.includes('authentication required')
    )
  }
  return true
}

// ── Keys ────────────────────────────────────────────────────────────────────

export const setKeys = {
  all: ['sets'] as const,
  lists: () => [...setKeys.all, 'list'] as const,
  list: (options: { archived: boolean; parent: string | null }) =>
    [...setKeys.lists(), options] as const,
  details: () => [...setKeys.all, 'detail'] as const,
  detail: (id: string) => [...setKeys.details(), id] as const,
}

export const cardKeys = {
  all: ['cards'] as const,
  lists: () => [...cardKeys.all, 'list'] as const,
  list: (setId: string, tags: readonly string[] = []) =>
    [...cardKeys.lists(), setId, [...tags].sort()] as const,
  details: () => [...cardKeys.all, 'detail'] as const,
  detail: (id: string) => [...cardKeys.details(), id] as const,
}

export const tagKeys = {
  all: ['tags'] as const,
}

// ── Cache helpers ───────────────────────────────────────────────────────────

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

function patchSet(client: QueryClient, id: string, patch: (set: StudySet) => StudySet): void {
  patchPages<StudySet>(client, setKeys.lists(), (items) =>
    items.map((item) => (item.id === id ? patch(item) : item)),
  )

  client.setQueryData<SetResponse>(setKeys.detail(id), (data) =>
    data ? { set: patch(data.set) } : data,
  )
}

function shiftCardCount(client: QueryClient, setId: string, delta: number): void {
  patchSet(client, setId, (set) => ({
    ...set,
    cardCount: Math.max(0, set.cardCount + delta),
    subtreeCardCount: Math.max(0, set.subtreeCardCount + delta),
  }))
}

// ── Set queries ─────────────────────────────────────────────────────────────

export function useSets(options: { archived?: boolean; parent?: string | null } = {}) {
  const archived = options.archived ?? false
  const parent = options.parent ?? null

  return useInfiniteQuery({
    queryKey: setKeys.list({ archived, parent }),
    queryFn: async ({ pageParam }) => {
      const userId = await resolveUserId()
      if (!onlineManager.isOnline() && userId) {
        const offlineSets = await offlineData.getSets(userId, parent)
        return {
          items: offlineSets,
          nextCursor: null,
        }
      }

      try {
        const res = await api.listSets({
          cursor: pageParam,
          archived: archived ? true : undefined,
          parent: parent ?? undefined,
        })
        if (userId) {
          for (const s of res.items) {
            void offlineData.mirrorSetToSQLite(userId, s)
          }
          const localSets = await offlineData.getSets(userId, parent)
          const unsyncedSets = localSets.filter(
            (ls) => ls.id.startsWith('temp-set-') || !res.items.some((s) => s.id === ls.id),
          )
          if (unsyncedSets.length > 0) {
            return {
              ...res,
              items: [...unsyncedSets, ...res.items],
            }
          }
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const offlineSets = await offlineData.getSets(userId, parent)
          return {
            items: offlineSets,
            nextCursor: null,
          }
        }
        throw error
      }
    },
    getNextPageParam: (last: SetsResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  })
}

export function useSet(id: string | undefined) {
  return useQuery({
    queryKey: setKeys.detail(id ?? ''),
    queryFn: async () => {
      const userId = await resolveUserId()
      const isTemp = id?.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId && id) {
        const offlineSet = await offlineData.getSet(userId, id)
        if (offlineSet) return { set: offlineSet }
      }

      try {
        const res = await api.getSet(id as string)
        if (userId && res.set) {
          void offlineData.mirrorSetToSQLite(userId, res.set)
        }
        return res
      } catch (error) {
        if (userId && id && isNetworkError(error)) {
          const offlineSet = await offlineData.getSet(userId, id)
          if (offlineSet) return { set: offlineSet }
        }
        throw error
      }
    },
    enabled: id !== undefined && id.length > 0,
  })
}

// ── Set mutations ───────────────────────────────────────────────────────────

export function useCreateSet(): UseMutationResult<SetResponse, Error, CreateSetRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (body: CreateSetRequest) => {
      const userId = await resolveUserId()
      if (!onlineManager.isOnline() && userId) {
        const created = await offlineData.createSet(userId, body)
        return { set: created }
      }

      try {
        const res = await api.createSet(body)
        if (userId && res.set) {
          void offlineData.mirrorSetToSQLite(userId, res.set)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const created = await offlineData.createSet(userId, body)
          return { set: created }
        }
        throw error
      }
    },
    onSuccess: (data) => {
      client.setQueryData<SetResponse>(setKeys.detail(data.set.id), data)
      client.setQueriesData<InfiniteData<SetsResponse>>({ queryKey: setKeys.lists() }, (old) => {
        if (!old || old.pages.length === 0) {
          return {
            pageParams: [undefined],
            pages: [{ items: [data.set], nextCursor: null }],
          }
        }
        const firstPage = old.pages[0]
        if (!firstPage) return old
        return {
          ...old,
          pages: [
            {
              ...firstPage,
              items: [data.set, ...firstPage.items.filter((item) => item.id !== data.set.id)],
            },
            ...old.pages.slice(1),
          ],
        }
      })
      void client.invalidateQueries({ queryKey: setKeys.lists() })
    },
  })
}

export function useRenameSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateSetRequest }) => {
      const userId = await resolveUserId()
      const isTemp = id.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        const updated = await offlineData.updateSet(userId, id, body)
        return { set: updated }
      }

      try {
        const res = await api.updateSet(id, body)
        if (userId && res.set) {
          void offlineData.mirrorSetToSQLite(userId, res.set)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const updated = await offlineData.updateSet(userId, id, body)
          return { set: updated }
        }
        throw error
      }
    },

    onMutate: async ({ id, body }) => {
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

export function useArchiveSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const userId = await resolveUserId()
      const isTemp = id.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        const updated = await offlineData.updateSet(userId, id, { archived: archive })
        return { set: updated }
      }

      try {
        const res = await api.updateSet(id, { archived: archive })
        if (userId && res.set) {
          void offlineData.mirrorSetToSQLite(userId, res.set)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const updated = await offlineData.updateSet(userId, id, { archived: archive })
          return { set: updated }
        }
        throw error
      }
    },

    onMutate: async ({ id, archive }) => {
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = client.getQueriesData({ queryKey: setKeys.all })

      const archivedAt = archive ? new Date().toISOString() : null
      patchSet(client, id, (set) => ({ ...set, archivedAt }))

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

export function useDeleteSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await resolveUserId()
      const isTemp = id.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        await offlineData.deleteSet(userId, id)
        return { success: true }
      }

      try {
        await api.deleteSet(id)
        if (userId) {
          await offlineData.deleteSet(userId, id)
        }
        return { success: true }
      } catch (error) {
        if (userId && isNetworkError(error)) {
          await offlineData.deleteSet(userId, id)
          return { success: true }
        }
        throw error
      }
    },

    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = client.getQueriesData({ queryKey: setKeys.all })

      patchPages<StudySet>(client, setKeys.lists(), (items) =>
        items.filter((item) => item.id !== id),
      )
      client.removeQueries({ queryKey: setKeys.detail(id) })

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
    queryFn: async ({ pageParam }) => {
      const userId = await resolveUserId()
      const isTemp = setId?.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId && setId) {
        const offlineCards = await offlineData.getCards(userId, setId)
        const summaries: StudyCardSummary[] = offlineCards.map((c) => ({
          id: c.id,
          studySetId: c.studySetId,
          paragraph: c.paragraph,
          tags: c.tags,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          answerCount: c.answers?.length ?? 0,
        }))
        return {
          items: summaries,
          nextCursor: null,
        }
      }

      try {
        const res = await api.listCards(setId as string, {
          cursor: pageParam,
          tag: tags.length > 0 ? [...tags] : undefined,
        })
        if (userId && setId && res.items) {
          for (const c of res.items) {
            void offlineData.mirrorCardToSQLite(userId, setId, {
              id: c.id,
              studySetId: c.studySetId,
              paragraph: c.paragraph,
              answers: [],
              tags: c.tags,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
            })
          }
          const localCards = await offlineData.getCards(userId, setId)
          const unsyncedCards: StudyCardSummary[] = localCards
            .filter(
              (lc) => lc.id.startsWith('temp-card-') || !res.items.some((c) => c.id === lc.id),
            )
            .map((c) => ({
              id: c.id,
              studySetId: c.studySetId,
              paragraph: c.paragraph,
              tags: c.tags,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              answerCount: c.answers?.length ?? 0,
            }))
          if (unsyncedCards.length > 0) {
            return {
              ...res,
              items: [...unsyncedCards, ...res.items],
            }
          }
        }
        return res
      } catch (error) {
        if (userId && setId && isNetworkError(error)) {
          const offlineCards = await offlineData.getCards(userId, setId)
          const summaries: StudyCardSummary[] = offlineCards.map((c) => ({
            id: c.id,
            studySetId: c.studySetId,
            paragraph: c.paragraph,
            tags: c.tags,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            answerCount: c.answers?.length ?? 0,
          }))
          return {
            items: summaries,
            nextCursor: null,
          }
        }
        throw error
      }
    },
    getNextPageParam: (last: CardsResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: setId !== undefined && setId.length > 0,
  })
}

export function usePrefetchCards() {
  const client = useQueryClient()
  return (setId: string, tags: readonly string[] = []) => {
    if (!setId) return
    void client.prefetchInfiniteQuery({
      queryKey: cardKeys.list(setId, tags),
      queryFn: ({ pageParam }) =>
        api.listCards(setId, {
          cursor: pageParam,
          tag: tags.length > 0 ? [...tags] : undefined,
        }),
      initialPageParam: undefined as string | undefined,
    })
  }
}

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: () => api.listTags(),
    staleTime: 5 * 60_000,
  })
}

export function useCard(id: string | undefined) {
  return useQuery({
    queryKey: cardKeys.detail(id ?? ''),
    queryFn: async () => {
      const userId = await resolveUserId()
      const isTemp = id?.startsWith('temp-card-')
      if ((isTemp || !onlineManager.isOnline()) && userId && id) {
        const offlineCard = await offlineData.getCard(userId, id)
        if (offlineCard) {
          return { card: offlineCard }
        }
      }

      try {
        const res = await api.getCard(id as string)
        if (userId && res.card) {
          void offlineData.mirrorCardToSQLite(userId, res.card.studySetId, res.card)
        }
        return res
      } catch (error) {
        if (userId && id && isNetworkError(error)) {
          const offlineCard = await offlineData.getCard(userId, id)
          if (offlineCard) {
            return { card: offlineCard }
          }
        }
        throw error
      }
    },
    enabled: id !== undefined && id.length > 0,
  })
}

// ── Card mutations ──────────────────────────────────────────────────────────

export function useCreateCard(
  setId: string,
): UseMutationResult<CardResponse, Error, CreateCardRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (body: CreateCardRequest) => {
      const userId = await resolveUserId()
      const isTemp = setId.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        const card = await offlineData.createCard(userId, setId, body)
        return { card }
      }

      try {
        const res = await api.createCard(setId, body)
        if (userId && res.card) {
          void offlineData.mirrorCardToSQLite(userId, setId, res.card)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const card = await offlineData.createCard(userId, setId, body)
          return { card }
        }
        throw error
      }
    },
    onSuccess: (data) => {
      client.setQueryData<CardResponse>(cardKeys.detail(data.card.id), data)

      const summary: StudyCardSummary = {
        id: data.card.id,
        studySetId: data.card.studySetId,
        paragraph: data.card.paragraph,
        tags: data.card.tags,
        createdAt: data.card.createdAt,
        updatedAt: data.card.updatedAt,
        answerCount: data.card.answers?.length ?? 0,
      }

      client.setQueriesData<
        InfiniteData<{ items: StudyCardSummary[]; nextCursor?: string | null }>
      >({ queryKey: cardKeys.list(setId) }, (oldData) => {
        if (!oldData || oldData.pages.length === 0) {
          return {
            pageParams: [undefined],
            pages: [{ items: [summary], nextCursor: null }],
          }
        }
        const newPages = [...oldData.pages]
        const firstPage = newPages[0]
        if (!firstPage) return oldData

        newPages[0] = {
          ...firstPage,
          items: [summary, ...firstPage.items.filter((c) => c.id !== summary.id)],
        }
        return { ...oldData, pages: newPages }
      })

      shiftCardCount(client, setId, 1)
      void client.invalidateQueries({ queryKey: cardKeys.lists() })
      void client.invalidateQueries({ queryKey: setKeys.all })
      if (data.card.tags.length > 0) void client.invalidateQueries({ queryKey: tagKeys.all })
    },
  })
}

export function useUpdateCard(id: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (body: UpdateCardRequest) => {
      const userId = await resolveUserId()
      const isTemp =
        id.startsWith('temp-card-') || (body.studySetId?.startsWith('temp-set-') ?? false)
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        const card = await offlineData.updateCard(userId, body.studySetId ?? '', id, body)
        return { card }
      }

      try {
        const res = await api.updateCard(id, body)
        if (userId && res.card) {
          void offlineData.mirrorCardToSQLite(userId, res.card.studySetId, res.card)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const card = await offlineData.updateCard(userId, body.studySetId ?? '', id, body)
          return { card }
        }
        throw error
      }
    },

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

export function useDeleteCard(setId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (cardId: string) => {
      const userId = await resolveUserId()
      const isTemp = cardId.startsWith('temp-card-') || setId.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        await offlineData.deleteCard(userId, setId, cardId)
        return { success: true }
      }

      try {
        await api.deleteCard(cardId)
        if (userId) {
          await offlineData.deleteCard(userId, setId, cardId)
        }
        return { success: true }
      } catch (error) {
        if (userId && isNetworkError(error)) {
          await offlineData.deleteCard(userId, setId, cardId)
          return { success: true }
        }
        throw error
      }
    },

    onMutate: async (cardId: string) => {
      await client.cancelQueries({ queryKey: cardKeys.all })
      const previous = [
        ...client.getQueriesData({ queryKey: cardKeys.all }),
        ...client.getQueriesData({ queryKey: setKeys.all }),
      ]

      patchPages<StudyCardSummary>(client, cardKeys.lists(), (items) =>
        items.filter((item) => item.id !== cardId),
      )
      client.removeQueries({ queryKey: cardKeys.detail(cardId) })
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

export function flattenPages<T>(
  data:
    InfiniteData<{ items: T[]; nextCursor: string | null }> | { items: T[] }[] | undefined | null,
): T[] {
  if (!data) return []
  if (Array.isArray(data)) {
    return (data as { items: T[] }[]).flatMap((page) => page?.items ?? [])
  }
  return data.pages?.flatMap((page) => page?.items ?? []) ?? []
}

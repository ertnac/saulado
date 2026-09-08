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
import { useOfflineSetsStore } from '../stores/offline-sets'
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
  list: (options: { archived?: boolean; parent?: string | null } = {}) =>
    [
      ...setKeys.lists(),
      { archived: options.archived ?? false, parent: options.parent ?? null },
    ] as const,
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
        // When offline, ONLY return downloaded sets or sets created locally
        const offlineSets = await offlineData.getSets(userId, parent, { downloadedOnly: true })
        const setsMap = new Map<string, StudySet>()

        for (const s of offlineSets) {
          if (s?.id) setsMap.set(s.id, s)
        }

        const offlineStoreSets = useOfflineSetsStore.getState().sets
        if (offlineStoreSets) {
          for (const entry of Object.values(offlineStoreSets)) {
            const isAvailableOffline =
              entry.isDownloaded ||
              entry.syncStatus?.startsWith('pending_') ||
              entry.setId.startsWith('temp-set-')
            if (isAvailableOffline && entry.metadata && !setsMap.has(entry.metadata.id)) {
              const s = entry.metadata
              if (parent === null ? !s.parentId : s.parentId === parent) {
                setsMap.set(s.id, s)
              }
            }
          }
        }

        const filtered = Array.from(setsMap.values()).filter((s) =>
          archived ? s.archivedAt !== null : s.archivedAt === null,
        )

        return {
          items: filtered,
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
          const offlineSets = await offlineData.getSets(userId, parent, { downloadedOnly: true })
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

export function useAllSets(options: { archived?: boolean } = {}) {
  const archived = options.archived ?? false
  const client = useQueryClient()

  return useQuery({
    queryKey: [...setKeys.all, 'all-sets', { archived }],
    queryFn: async () => {
      const isOnline = onlineManager.isOnline()
      const setsMap = new Map<string, StudySet>()

      // 1. If online, gather sets from React Query cache (instant, zero network)
      if (isOnline) {
        try {
          const cachedLists = client.getQueriesData<InfiniteData<SetsResponse>>({
            queryKey: setKeys.lists(),
          })
          for (const [_key, data] of cachedLists) {
            if (data?.pages) {
              for (const page of data.pages) {
                if (page?.items) {
                  for (const s of page.items) {
                    if (s?.id) setsMap.set(s.id, s)
                  }
                }
              }
            }
          }

          const cachedDetails = client.getQueriesData<SetResponse>({
            queryKey: setKeys.details(),
          })
          for (const [_key, data] of cachedDetails) {
            if (data?.set?.id) setsMap.set(data.set.id, data.set)
          }
        } catch {
          // Cache read fallback
        }
      }

      // 2. Gather sets from offline sets store (only downloaded or temp/pending when offline)
      try {
        const offlineSets = useOfflineSetsStore.getState().sets
        if (offlineSets) {
          for (const entry of Object.values(offlineSets)) {
            const isAvailableOffline =
              entry.isDownloaded ||
              entry.syncStatus?.startsWith('pending_') ||
              entry.setId.startsWith('temp-set-')
            if ((isOnline || isAvailableOffline) && entry?.metadata?.id) {
              setsMap.set(entry.metadata.id, entry.metadata)
            }
          }
        }
      } catch {
        // Offline store fallback
      }

      // 3. Gather sets from SQLite local database (offline & synced)
      const userId = await resolveUserId()
      if (userId) {
        try {
          const localSets = await offlineData.getSets(userId, undefined, {
            downloadedOnly: !isOnline,
          })
          for (const s of localSets) {
            if (s?.id) setsMap.set(s.id, s)
          }
          if (userId !== 'local-user' && setsMap.size === 0) {
            const guestSets = await offlineData.getSets('local-user', undefined, {
              downloadedOnly: !isOnline,
            })
            for (const s of guestSets) {
              if (s?.id) setsMap.set(s.id, s)
            }
          }
        } catch {
          // SQLite fallback
        }
      }

      // 4. If online, fetch from remote API safely (compatible with Render & local backends)
      if (onlineManager.isOnline()) {
        try {
          // Fetch root sets without parent param (100% accepted by all backend schemas)
          const rootRes = await api.listSets({
            limit: 50,
            archived: archived ? true : undefined,
          })
          if (rootRes?.items && Array.isArray(rootRes.items)) {
            for (const s of rootRes.items) {
              if (s?.id) {
                setsMap.set(s.id, s)
                if (userId) void offlineData.mirrorSetToSQLite(userId, s)
              }
            }

            // Fetch direct children of sets that report children
            const parentsWithKids = rootRes.items.filter((s) => s.childCount > 0)
            if (parentsWithKids.length > 0) {
              const childLists = await Promise.all(
                parentsWithKids.map((p) =>
                  api
                    .listSets({
                      limit: 50,
                      archived: archived ? true : undefined,
                      parent: p.id,
                    })
                    .then((r) => r.items ?? [])
                    .catch(() => [] as StudySet[]),
                ),
              )
              const level2Sets: StudySet[] = []
              for (const cl of childLists) {
                for (const cs of cl) {
                  if (cs?.id) {
                    setsMap.set(cs.id, cs)
                    level2Sets.push(cs)
                    if (userId) void offlineData.mirrorSetToSQLite(userId, cs)
                  }
                }
              }

              // Fetch level 3 children if any level 2 sets have children
              const level2Parents = level2Sets.filter((s) => s.childCount > 0)
              if (level2Parents.length > 0) {
                const grandChildLists = await Promise.all(
                  level2Parents.map((p) =>
                    api
                      .listSets({
                        limit: 50,
                        archived: archived ? true : undefined,
                        parent: p.id,
                      })
                      .then((r) => r.items ?? [])
                      .catch(() => [] as StudySet[]),
                  ),
                )
                for (const gcl of grandChildLists) {
                  for (const gcs of gcl) {
                    if (gcs?.id) {
                      setsMap.set(gcs.id, gcs)
                      if (userId) void offlineData.mirrorSetToSQLite(userId, gcs)
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('[useAllSets] Failed fetching remote sets, using cached/local:', err)
        }
      }

      const allSets = Array.from(setsMap.values())
      return allSets.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    },
    staleTime: 10_000,
  })
}

export function useSet(id: string | undefined) {
  const client = useQueryClient()
  return useQuery({
    queryKey: setKeys.detail(id ?? ''),
    queryFn: async () => {
      const userId = await resolveUserId()
      const isTemp = id?.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId && id) {
        const offlineSet = await offlineData.getSet(userId, id)
        if (offlineSet) return { set: offlineSet }

        const offlineEntry = useOfflineSetsStore.getState().sets[id]
        if (offlineEntry?.metadata) {
          void offlineData.mirrorSetToSQLite(userId, offlineEntry.metadata)
          return { set: offlineEntry.metadata }
        }

        const allLists = client.getQueriesData<InfiniteData<SetsResponse>>({
          queryKey: setKeys.lists(),
        })
        for (const [_key, data] of allLists) {
          if (data?.pages) {
            for (const page of data.pages) {
              const found = page.items?.find((s) => s.id === id)
              if (found) {
                void offlineData.mirrorSetToSQLite(userId, found)
                return { set: found }
              }
            }
          }
        }
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

          const offlineEntry = useOfflineSetsStore.getState().sets[id]
          if (offlineEntry?.metadata) {
            void offlineData.mirrorSetToSQLite(userId, offlineEntry.metadata)
            return { set: offlineEntry.metadata }
          }
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

export function useMoveSet() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const userId = await resolveUserId()
      const isTemp = id.startsWith('temp-set-') || (parentId?.startsWith('temp-set-') ?? false)
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        const updated = await offlineData.updateSet(userId, id, { parentId })
        return { set: updated }
      }

      try {
        const res = await api.updateSet(id, { parentId })
        if (userId && res.set) {
          void offlineData.mirrorSetToSQLite(userId, res.set)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const updated = await offlineData.updateSet(userId, id, { parentId })
          return { set: updated }
        }
        throw error
      }
    },

    onMutate: async ({ id, parentId }) => {
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = client.getQueriesData({ queryKey: setKeys.all })

      let movingSet: StudySet | undefined
      const detail = client.getQueryData<SetResponse>(setKeys.detail(id))
      if (detail?.set) {
        movingSet = { ...detail.set, parentId }
      } else {
        const allLists = client.getQueriesData<InfiniteData<SetsResponse>>({
          queryKey: setKeys.lists(),
        })
        for (const [_key, data] of allLists) {
          if (data?.pages) {
            for (const page of data.pages) {
              const found = page.items?.find((s) => s.id === id)
              if (found) {
                movingSet = { ...found, parentId }
                break
              }
            }
          }
          if (movingSet) break
        }
      }

      const oldParentId = movingSet?.parentId ?? null

      patchSet(client, id, (set) => ({ ...set, parentId }))
      patchPages<StudySet>(client, setKeys.lists(), (items) =>
        items.filter((item) => item.id !== id),
      )

      if (movingSet) {
        const setToAdd = { ...movingSet, parentId }
        patchPages<StudySet>(client, setKeys.list({ parent: parentId }), (items) => {
          if (items.some((item) => item.id === id)) return items
          return [setToAdd, ...items]
        })
      }

      if (oldParentId && oldParentId !== parentId) {
        patchSet(client, oldParentId, (set) => ({
          ...set,
          childCount: Math.max(0, set.childCount - 1),
        }))
      }
      if (parentId && parentId !== oldParentId) {
        patchSet(client, parentId, (set) => ({
          ...set,
          childCount: set.childCount + 1,
        }))
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
  const client = useQueryClient()
  return useInfiniteQuery({
    queryKey: cardKeys.list(setId ?? '', tags),
    queryFn: async ({ pageParam }) => {
      const userId = await resolveUserId()
      const isTemp = setId?.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId && setId) {
        const offlineCards = await offlineData.getCards(userId, setId)
        if (offlineCards.length > 0) {
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

        const cached = client.getQueryData<InfiniteData<CardsResponse>>(cardKeys.list(setId, tags))
        if (cached?.pages && cached.pages.length > 0) {
          const cachedItems = cached.pages.flatMap((p) => p.items ?? [])
          if (cachedItems.length > 0) {
            for (const item of cachedItems) {
              void offlineData.mirrorCardToSQLite(userId, setId, {
                id: item.id,
                studySetId: setId,
                paragraph: item.paragraph,
                answers: [],
                tags: item.tags,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              })
            }
            return {
              items: cachedItems,
              nextCursor: null,
            }
          }
        }

        return {
          items: [],
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
          if (offlineCards.length > 0) {
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

          const cached = client.getQueryData<InfiniteData<CardsResponse>>(
            cardKeys.list(setId, tags),
          )
          if (cached?.pages && cached.pages.length > 0) {
            const cachedItems = cached.pages.flatMap((p) => p.items ?? [])
            if (cachedItems.length > 0) {
              return {
                items: cachedItems,
                nextCursor: null,
              }
            }
          }

          return {
            items: [],
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

export async function createCardOfflineAware(
  setId: string,
  body: CreateCardRequest,
): Promise<CardResponse> {
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
}

export function useCreateCard(
  setId: string,
): UseMutationResult<CardResponse, Error, CreateCardRequest> {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateCardRequest) => createCardOfflineAware(setId, body),
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

export function useMoveCard() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      cardId,
      sourceSetId,
      targetSetId,
    }: {
      cardId: string
      sourceSetId: string
      targetSetId: string
    }) => {
      const userId = await resolveUserId()
      const isTemp =
        cardId.startsWith('temp-card-') ||
        targetSetId.startsWith('temp-set-') ||
        sourceSetId.startsWith('temp-set-')
      if ((isTemp || !onlineManager.isOnline()) && userId) {
        const card = await offlineData.updateCard(userId, sourceSetId, cardId, {
          studySetId: targetSetId,
        })
        return { card }
      }

      try {
        const res = await api.updateCard(cardId, { studySetId: targetSetId })
        if (userId && res.card) {
          void offlineData.mirrorCardToSQLite(userId, targetSetId, res.card)
        }
        return res
      } catch (error) {
        if (userId && isNetworkError(error)) {
          const card = await offlineData.updateCard(userId, sourceSetId, cardId, {
            studySetId: targetSetId,
          })
          return { card }
        }
        throw error
      }
    },

    onMutate: async ({ cardId, sourceSetId, targetSetId }) => {
      await client.cancelQueries({ queryKey: cardKeys.all })
      await client.cancelQueries({ queryKey: setKeys.all })
      const previous = [
        ...client.getQueriesData({ queryKey: cardKeys.all }),
        ...client.getQueriesData({ queryKey: setKeys.all }),
      ]

      let movingCard: StudyCardSummary | undefined
      const sourceLists = client.getQueriesData<InfiniteData<CardsResponse>>({
        queryKey: cardKeys.list(sourceSetId),
      })
      for (const [_key, data] of sourceLists) {
        if (data?.pages) {
          for (const page of data.pages) {
            const found = page.items?.find((c) => c.id === cardId)
            if (found) {
              movingCard = { ...found, studySetId: targetSetId }
              break
            }
          }
        }
        if (movingCard) break
      }

      if (!movingCard) {
        const detail = client.getQueryData<CardResponse>(cardKeys.detail(cardId))
        if (detail?.card) {
          movingCard = {
            id: detail.card.id,
            studySetId: targetSetId,
            paragraph: detail.card.paragraph,
            tags: detail.card.tags,
            createdAt: detail.card.createdAt,
            updatedAt: new Date().toISOString(),
            answerCount: detail.card.answers?.length ?? 0,
          }
        }
      }

      patchPages<StudyCardSummary>(client, cardKeys.list(sourceSetId), (items) =>
        items.filter((c) => c.id !== cardId),
      )

      if (movingCard) {
        const cardToAdd = movingCard
        patchPages<StudyCardSummary>(client, cardKeys.list(targetSetId), (items) => {
          if (items.some((c) => c.id === cardId)) return items
          return [cardToAdd, ...items]
        })

        client.setQueryData<CardResponse>(cardKeys.detail(cardId), (old) =>
          old ? { card: { ...old.card, studySetId: targetSetId } } : old,
        )
      }

      shiftCardCount(client, sourceSetId, -1)
      shiftCardCount(client, targetSetId, 1)

      return { previous }
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data)
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: cardKeys.all })
      void client.invalidateQueries({ queryKey: setKeys.all })
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

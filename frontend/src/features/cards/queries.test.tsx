import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type {
  CardResponse,
  CardsResponse,
  SetResponse,
  SetsResponse,
  StudyCard,
  StudyCardSummary,
  StudySet,
} from '@saulado/shared'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import {
  cardKeys,
  flattenPages,
  setKeys,
  useCreateCard,
  useDeleteCard,
  useDeleteSet,
  useUpdateCard,
  useUpdateSet,
} from './queries'

/**
 * The cache layer for sets and cards.
 *
 * `services/cards.ts` is a thin fetch wrapper and is mocked wholesale here — what
 * needs testing is what happens to the cache, because that is where the bugs a
 * user actually sees live: a rename that undoes itself on refetch, a card count
 * that goes stale after a delete, a "load more" that refetches page one.
 *
 * Every mutation is driven through a real `QueryClient` rather than a stub, so the
 * `onMutate`/`onError` contract is exercised as react-query will actually run it.
 */

vi.mock('@/services/cards')

const mocked = vi.mocked(api)

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/** Retry off: a rejected mutation should surface immediately, not after backoff. */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function set(overrides: Partial<StudySet> = {}): StudySet {
  return {
    id: 'set-1',
    title: 'Hardware',
    parentId: null,
    color: 'blue',
    archivedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    cardCount: 2,
    subtreeCardCount: 2,
    childCount: 0,
    ...overrides,
  }
}

function summary(overrides: Partial<StudyCardSummary> = {}): StudyCardSummary {
  return {
    id: 'card-1',
    studySetId: 'set-1',
    paragraph: 'The CPU is the brain of the computer',
    tags: ['computing'],
    answerCount: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function card(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id: 'card-1',
    studySetId: 'set-1',
    paragraph: 'The CPU is the brain of the computer',
    answers: [
      { id: 'a1', ordinal: 0, startOffset: 4, endOffset: 7, answerText: 'CPU', altAnswers: [] },
    ],
    tags: ['computing'],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Seeds an infinite list the way react-query stores one — pages, not a flat array. */
function seedSets(client: QueryClient, archived: boolean, ...pages: StudySet[][]): void {
  client.setQueryData<InfiniteData<SetsResponse>>(setKeys.list({ archived, parent: null }), {
    pages: pages.map((items, index) => ({
      items,
      nextCursor: index < pages.length - 1 ? `cursor-${String(index)}` : null,
    })),
    pageParams: pages.map((_, index) => (index === 0 ? undefined : `cursor-${String(index - 1)}`)),
  })
}

function seedCards(client: QueryClient, setId: string, ...pages: StudyCardSummary[][]): void {
  client.setQueryData<InfiniteData<CardsResponse>>(cardKeys.list(setId), {
    pages: pages.map((items, index) => ({
      items,
      nextCursor: index < pages.length - 1 ? `cursor-${String(index)}` : null,
    })),
    pageParams: pages.map((_, index) => (index === 0 ? undefined : `cursor-${String(index - 1)}`)),
  })
}

function cachedSets(client: QueryClient, archived: boolean): StudySet[] {
  return flattenPages(
    client.getQueryData<InfiniteData<SetsResponse>>(setKeys.list({ archived, parent: null })),
  )
}

function cachedCards(client: QueryClient, setId: string): StudyCardSummary[] {
  return flattenPages(client.getQueryData<InfiniteData<CardsResponse>>(cardKeys.list(setId)))
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useUpdateSet', () => {
  it('shows the new title before the server answers', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])

    // Never resolves — the optimistic patch has to be visible while in flight,
    // which is the entire point of doing it.
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { title: 'Computer Hardware' } })

    await waitFor(() => {
      expect(cachedSets(client, false)[0]?.title).toBe('Computer Hardware')
    })
  })

  it('patches the detail cache as well as the list', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])
    client.setQueryData<SetResponse>(setKeys.detail('set-1'), { set: set() })
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { title: 'Renamed' } })

    await waitFor(() => {
      expect(client.getQueryData<SetResponse>(setKeys.detail('set-1'))?.set.title).toBe('Renamed')
    })
  })

  it('changes the color when updated', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { color: 'green' } })

    await waitFor(() => {
      expect(cachedSets(client, false)[0]?.color).toBe('green')
    })
  })

  it('leaves the color alone when the field is absent', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { title: 'Renamed' } })

    await waitFor(() => {
      expect(cachedSets(client, false)[0]?.color).toBe('blue')
    })
  })

  it('takes an archived set out of the active list', async () => {
    const client = makeClient()
    seedSets(client, false, [set(), set({ id: 'set-2', title: 'Biology' })])
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { archived: true } })

    await waitFor(() => {
      expect(cachedSets(client, false).map((s) => s.id)).toEqual(['set-2'])
    })
  })

  it('takes a restored set out of the archived list', async () => {
    const client = makeClient()
    seedSets(client, true, [set({ archivedAt: '2026-08-02T00:00:00.000Z' })])
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { archived: false } })

    await waitFor(() => {
      expect(cachedSets(client, true)).toEqual([])
    })
  })

  it('puts the old title back when the request fails', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])
    mocked.updateSet.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { title: 'Computer Hardware' } })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(cachedSets(client, false)[0]?.title).toBe('Hardware')
  })

  it('patches a set sitting on a later page', async () => {
    // Only rewriting pages[0] would leave the old title on screen for anyone who
    // had scrolled — the bug that makes `patchPages` walk every page.
    const client = makeClient()
    seedSets(client, false, [set({ id: 'set-9' })], [set()])
    mocked.updateSet.mockReturnValue(new Promise<SetResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateSet(), { wrapper: wrapper(client) })
    result.current.mutate({ id: 'set-1', body: { title: 'Renamed' } })

    await waitFor(() => {
      expect(cachedSets(client, false)[1]?.title).toBe('Renamed')
    })
  })
})

describe('useDeleteSet', () => {
  it('removes the set from the list immediately', async () => {
    const client = makeClient()
    seedSets(client, false, [set(), set({ id: 'set-2' })])
    mocked.deleteSet.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteSet(), { wrapper: wrapper(client) })
    result.current.mutate('set-1')

    await waitFor(() => {
      expect(cachedSets(client, false).map((s) => s.id)).toEqual(['set-2'])
    })
  })

  it('drops the cards cached for a deleted set instead of refetching them', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])
    seedCards(client, 'set-1', [summary()])
    mocked.deleteSet.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteSet(), { wrapper: wrapper(client) })
    result.current.mutate('set-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(client.getQueryData(cardKeys.list('set-1'))).toBeUndefined()
  })

  it('restores the set when the delete fails', async () => {
    const client = makeClient()
    seedSets(client, false, [set()])
    mocked.deleteSet.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useDeleteSet(), { wrapper: wrapper(client) })
    result.current.mutate('set-1')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(cachedSets(client, false).map((s) => s.id)).toEqual(['set-1'])
  })
})

describe('useCreateCard', () => {
  it('seeds the detail cache from the response', async () => {
    // Navigating straight to the new card should render, not spin, for data the
    // create call already returned.
    const client = makeClient()
    mocked.createCard.mockResolvedValue({ card: card({ id: 'card-9' }) })

    const { result } = renderHook(() => useCreateCard('set-1'), { wrapper: wrapper(client) })
    result.current.mutate({ paragraph: 'The CPU is the brain of the computer', answers: [] })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(client.getQueryData<CardResponse>(cardKeys.detail('card-9'))?.card.id).toBe('card-9')
  })

  it('raises the set card count so the list stops understating it', async () => {
    const client = makeClient()
    seedSets(client, false, [set({ cardCount: 2 })])
    mocked.createCard.mockResolvedValue({ card: card({ id: 'card-9' }) })

    const { result } = renderHook(() => useCreateCard('set-1'), { wrapper: wrapper(client) })
    result.current.mutate({ paragraph: 'The CPU is the brain of the computer', answers: [] })

    await waitFor(() => {
      expect(cachedSets(client, false)[0]?.cardCount).toBe(3)
    })
  })

  it('does not write a card into the list before the server answers', async () => {
    // The server derives every `answerText` from the paragraph; an optimistic row
    // would have to invent that text, which is the one thing the client is not
    // trusted to supply.
    const client = makeClient()
    seedCards(client, 'set-1', [summary()])
    mocked.createCard.mockReturnValue(new Promise<CardResponse>(() => undefined))

    const { result } = renderHook(() => useCreateCard('set-1'), { wrapper: wrapper(client) })
    result.current.mutate({ paragraph: 'New paragraph', answers: [] })

    await waitFor(() => {
      expect(result.current.isPending).toBe(true)
    })
    expect(cachedCards(client, 'set-1')).toHaveLength(1)
  })
})

describe('useUpdateCard', () => {
  it('shows the new paragraph in the list before the server answers', async () => {
    const client = makeClient()
    seedCards(client, 'set-1', [summary()])
    mocked.updateCard.mockReturnValue(new Promise<CardResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateCard('card-1'), { wrapper: wrapper(client) })
    result.current.mutate({ paragraph: 'The processor' })

    await waitFor(() => {
      expect(cachedCards(client, 'set-1')[0]?.paragraph).toBe('The processor')
    })
  })

  it('keeps the answer count in step with an edited answer list', async () => {
    const client = makeClient()
    seedCards(client, 'set-1', [summary({ answerCount: 1 })])
    mocked.updateCard.mockReturnValue(new Promise<CardResponse>(() => undefined))

    const { result } = renderHook(() => useUpdateCard('card-1'), { wrapper: wrapper(client) })
    result.current.mutate({
      paragraph: 'The CPU is the brain of the computer',
      answers: [
        { startOffset: 4, endOffset: 7 },
        { startOffset: 15, endOffset: 20 },
      ],
    })

    await waitFor(() => {
      expect(cachedCards(client, 'set-1')[0]?.answerCount).toBe(2)
    })
  })

  it('takes the answers from the server response, not the request', async () => {
    // `AnswerInput` carries no `answerText` — the server slices it. Patching the
    // detail cache from the request would leave the answers textless.
    const client = makeClient()
    mocked.updateCard.mockResolvedValue({ card: card({ paragraph: 'Renamed' }) })

    const { result } = renderHook(() => useUpdateCard('card-1'), { wrapper: wrapper(client) })
    result.current.mutate({ paragraph: 'Renamed' })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(client.getQueryData<CardResponse>(cardKeys.detail('card-1'))?.card.answers[0]).toEqual({
      id: 'a1',
      ordinal: 0,
      startOffset: 4,
      endOffset: 7,
      answerText: 'CPU',
      altAnswers: [],
    })
  })

  it('rolls the list back when the edit fails', async () => {
    const client = makeClient()
    seedCards(client, 'set-1', [summary()])
    mocked.updateCard.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useUpdateCard('card-1'), { wrapper: wrapper(client) })
    result.current.mutate({ paragraph: 'The processor' })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(cachedCards(client, 'set-1')[0]?.paragraph).toBe('The CPU is the brain of the computer')
  })
})

describe('useDeleteCard', () => {
  it('removes the card and lowers the set count', async () => {
    const client = makeClient()
    seedSets(client, false, [set({ cardCount: 2 })])
    seedCards(client, 'set-1', [summary(), summary({ id: 'card-2' })])
    mocked.deleteCard.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteCard('set-1'), { wrapper: wrapper(client) })
    result.current.mutate('card-1')

    await waitFor(() => {
      expect(cachedCards(client, 'set-1').map((c) => c.id)).toEqual(['card-2'])
    })
    expect(cachedSets(client, false)[0]?.cardCount).toBe(1)
  })

  it('never shows a negative card count', async () => {
    // Two deletes racing, or a count already stale at zero, must not render
    // "-1 cards".
    const client = makeClient()
    seedSets(client, false, [set({ cardCount: 0 })])
    mocked.deleteCard.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteCard('set-1'), { wrapper: wrapper(client) })
    result.current.mutate('card-1')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(cachedSets(client, false)[0]?.cardCount).toBe(0)
  })

  it('restores the card when the delete fails', async () => {
    const client = makeClient()
    seedCards(client, 'set-1', [summary()])
    mocked.deleteCard.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useDeleteCard('set-1'), { wrapper: wrapper(client) })
    result.current.mutate('card-1')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(cachedCards(client, 'set-1').map((c) => c.id)).toEqual(['card-1'])
  })
})

describe('cardKeys', () => {
  it('builds a key for the set list', () => {
    expect(cardKeys.list('set-1')).toEqual(['cards', 'list', 'set-1'])
  })
})

describe('flattenPages', () => {
  it('concatenates pages in order', () => {
    const data: InfiniteData<CardsResponse> = {
      pages: [
        { items: [summary()], nextCursor: 'c1' },
        { items: [summary({ id: 'card-2' })], nextCursor: null },
      ],
      pageParams: [undefined, 'c1'],
    }

    expect(flattenPages(data).map((c) => c.id)).toEqual(['card-1', 'card-2'])
  })

  it('gives an empty list before the first fetch resolves', () => {
    expect(flattenPages(undefined)).toEqual([])
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { SetsResponse, StudySet } from '@saulado/shared'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import { SetsPage } from './SetsPage'

/**
 * The library screen.
 *
 * `queries.test.tsx` already proves what the cache does; these assert the things
 * only a rendered page can get wrong — that Archive sends the *opposite* of the
 * set's current state, that the archived toggle issues a different request rather
 * than filtering client-side, and that an empty library teaches rather than
 * reporting emptiness.
 */

vi.mock('@/services/cards')

const mocked = vi.mocked(api)

function set(overrides: Partial<StudySet> = {}): StudySet {
  return {
    id: 'set-1',
    title: 'Hardware',
    description: 'Computer basics',
    color: 'blue',
    archivedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    cardCount: 2,
    ...overrides,
  }
}

function page(items: StudySet[]): SetsResponse {
  return { items, nextCursor: null }
}

function renderPage(): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SetsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listSets.mockResolvedValue(page([]))
})

describe('the list', () => {
  it('shows each set with its card count', async () => {
    mocked.listSets.mockResolvedValue(
      page([set(), set({ id: 'set-2', title: 'Biology', cardCount: 5 })]),
    )
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Hardware' })).toBeInTheDocument()
    })
    expect(screen.getByText('2 cards')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Biology' })).toBeInTheDocument()
    expect(screen.getByText('5 cards')).toBeInTheDocument()
  })

  it('says "1 card" rather than "1 cards"', async () => {
    mocked.listSets.mockResolvedValue(page([set({ cardCount: 1 })]))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('1 card')).toBeInTheDocument()
    })
  })

  it('teaches the concept when the library is empty', async () => {
    // "No study sets" tells a new user nothing about what a set is for
    // (saulado-ux §5). The empty state is the only place we can explain it.
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('No sets yet')).toBeInTheDocument()
    })
    expect(screen.getByText(/Highlight the words worth recalling/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create your first set' })).toBeInTheDocument()
  })

  it('offers a retry rather than a dead end when the list fails', async () => {
    mocked.listSets.mockRejectedValue(new Error('offline'))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load your sets.')
    })
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('archiving', () => {
  it('archives an active set', async () => {
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(page([set()]))
    mocked.updateSet.mockResolvedValue({ set: set({ archivedAt: '2026-08-08T00:00:00.000Z' }) })
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Archive' }))

    expect(mocked.updateSet).toHaveBeenCalledWith('set-1', { archived: true })
  })

  it('restores an archived one, rather than archiving it again', async () => {
    // The button label and the request are both derived from `archivedAt`. A
    // hardcoded `archived: true` here would make Restore a no-op that looks like
    // a broken button.
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(page([set({ archivedAt: '2026-08-02T00:00:00.000Z' })]))
    mocked.updateSet.mockResolvedValue({ set: set() })
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(mocked.updateSet).toHaveBeenCalledWith('set-1', { archived: false })
  })

  it('asks the server for the archived list instead of filtering what it has', async () => {
    // Archived sets are a different result set, not a subset of the active one —
    // filtering client-side would show only whatever happened to be cached.
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('No sets yet')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Archived' }))

    await waitFor(() => {
      expect(mocked.listSets).toHaveBeenCalledWith(expect.objectContaining({ archived: true }))
    })
    expect(screen.getByText('Nothing archived')).toBeInTheDocument()
  })

  it('does not offer "create your first set" while viewing the archive', async () => {
    // Creating a set would not populate the list the user is looking at.
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('No sets yet')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Archived' }))

    await waitFor(() => {
      expect(screen.getByText('Nothing archived')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Create your first set' })).not.toBeInTheDocument()
  })
})

describe('create', () => {
  it('creates a set from the dialog', async () => {
    const user = userEvent.setup()
    mocked.createSet.mockResolvedValue({ set: set({ id: 'set-9', title: 'Cell Biology' }) })
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New set' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'New set' }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Title'), 'Cell Biology')
    await user.click(within(dialog).getByRole('button', { name: 'Create set' }))

    await waitFor(() => {
      expect(mocked.createSet).toHaveBeenCalledWith({
        title: 'Cell Biology',
        // Empty is sent as null, not '' — the two mean different things to the API.
        description: null,
        color: 'slate',
      })
    })
  })

  it('cannot submit an untitled set', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New set' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'New set' }))

    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create set' }),
    ).toBeDisabled()
  })
})

describe('delete', () => {
  it('confirms before deleting, naming what will be lost', async () => {
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(page([set()]))
    mocked.deleteSet.mockResolvedValue(undefined)
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Hardware')
    expect(dialog).toHaveTextContent('2 cards')
    // Archive is the reversible alternative, and the confirm is where someone
    // about to lose work will actually read it.
    expect(dialog).toHaveTextContent('archive it instead')

    expect(mocked.deleteSet).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete set' }))

    await waitFor(() => {
      expect(mocked.deleteSet).toHaveBeenCalledWith('set-1')
    })
  })

  it('deletes nothing when the confirm is dismissed', async () => {
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(page([set()]))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(mocked.deleteSet).not.toHaveBeenCalled()
  })
})

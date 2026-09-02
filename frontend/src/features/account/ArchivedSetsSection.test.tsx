import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SetsResponse, StudySet } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import { ArchivedSetsSection } from './ArchivedSetsSection'

vi.mock('@/services/cards')
const mocked = vi.mocked(api)

function mockSet(overrides: Partial<StudySet> = {}): StudySet {
  return {
    id: 'set-1',
    title: 'Biology 101',
    parentId: null,
    color: 'teal',
    archivedAt: '2026-08-15T12:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z',
    cardCount: 4,
    subtreeCardCount: 4,
    childCount: 0,
    ...overrides,
  }
}

function mockPage(items: StudySet[]): SetsResponse {
  return { items, nextCursor: null }
}

function renderSection(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <ArchivedSetsSection />
    </QueryClientProvider>,
  )
}

describe('ArchivedSetsSection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listSets.mockResolvedValue(mockPage([]))
  })

  it('renders empty state when there are no archived sets', async () => {
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('No archived sets')).toBeInTheDocument()
    })
  })

  it('renders list of archived sets with cards count', async () => {
    mocked.listSets.mockResolvedValue(
      mockPage([
        mockSet({ id: 'set-1', title: 'Biology 101', subtreeCardCount: 10 }),
        mockSet({ id: 'set-2', title: 'Chemistry 201', subtreeCardCount: 5 }),
      ]),
    )
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('Biology 101')).toBeInTheDocument()
      expect(screen.getByText('Chemistry 201')).toBeInTheDocument()
    })
    expect(screen.getByText(/2 archived sets/i)).toBeInTheDocument()
  })

  it('restores a single archived set', async () => {
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(mockPage([mockSet({ id: 'set-1', title: 'Biology 101' })]))
    mocked.updateSet.mockResolvedValue({ set: mockSet({ id: 'set-1', archivedAt: null }) })

    renderSection()

    await waitFor(() => {
      expect(screen.getByText('Biology 101')).toBeInTheDocument()
    })

    const restoreBtn = screen.getByRole('button', { name: 'Restore' })
    await user.click(restoreBtn)

    await waitFor(() => {
      expect(mocked.updateSet).toHaveBeenCalledWith('set-1', { archived: false })
    })
  })

  it('supports select all and bulk restore', async () => {
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(
      mockPage([
        mockSet({ id: 'set-1', title: 'Biology 101' }),
        mockSet({ id: 'set-2', title: 'Chemistry 201' }),
      ]),
    )
    mocked.updateSet.mockResolvedValue({ set: mockSet() })

    renderSection()

    await waitFor(() => {
      expect(screen.getByText('Biology 101')).toBeInTheDocument()
    })

    const selectAllCheckbox = screen.getByLabelText(/Select all archived sets/i)
    await user.click(selectAllCheckbox)

    const bulkRestoreBtn = screen.getByRole('button', { name: /Restore \(2\)/i })
    await user.click(bulkRestoreBtn)

    await waitFor(() => {
      expect(mocked.updateSet).toHaveBeenCalledTimes(2)
    })
  })

  it('opens confirmation modal and bulk deletes selected sets', async () => {
    const user = userEvent.setup()
    mocked.listSets.mockResolvedValue(
      mockPage([
        mockSet({ id: 'set-1', title: 'Biology 101', subtreeCardCount: 6 }),
        mockSet({ id: 'set-2', title: 'Chemistry 201', subtreeCardCount: 4 }),
      ]),
    )
    mocked.deleteSet.mockResolvedValue(undefined)

    renderSection()

    await waitFor(() => {
      expect(screen.getByText('Biology 101')).toBeInTheDocument()
    })

    const selectAllCheckbox = screen.getByLabelText(/Select all archived sets/i)
    await user.click(selectAllCheckbox)

    const bulkDeleteBtn = screen.getByRole('button', { name: /Delete Permanently \(2\)/i })
    await user.click(bulkDeleteBtn)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/Permanently delete 2 sets\?/i)
    expect(dialog).toHaveTextContent(/10 cards will be permanently removed/i)

    const confirmBtn = within(dialog).getByRole('button', { name: /Delete 2 sets/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mocked.deleteSet).toHaveBeenCalledWith('set-1')
      expect(mocked.deleteSet).toHaveBeenCalledWith('set-2')
    })
  })
})

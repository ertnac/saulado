import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import { SeedDecksDialog } from './SeedDecksDialog'

vi.mock('@/services/cards')
const mockedApi = vi.mocked(api)

function renderDialog(open = true): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <SeedDecksDialog open={open} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('SeedDecksDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedApi.createSet.mockResolvedValue({
      set: {
        id: 'set-seed-1',
        title: 'Computer Science',
        parentId: null,
        color: 'teal',
        archivedAt: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        cardCount: 0,
        subtreeCardCount: 0,
        childCount: 0,
      },
    })
    mockedApi.createCard.mockResolvedValue({
      card: {
        id: 'card-seed-1',
        studySetId: 'set-seed-1',
        paragraph: 'Sample paragraph',
        answers: [],
        tags: [],
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    })
  })

  it('renders all 3 starter decks with cards count', () => {
    renderDialog()

    expect(screen.getByText('Starter Study Decks')).toBeInTheDocument()
    expect(screen.getByText('Computer Science & Algorithms')).toBeInTheDocument()
    expect(screen.getByText('World History & Civilizations')).toBeInTheDocument()
    expect(screen.getByText('Human Biology & Physiology')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Import All \(30 Cards\)/i })).toBeInTheDocument()
  })

  it('expands card preview when clicked', async () => {
    const user = userEvent.setup()
    renderDialog()

    const previewButtons = screen.getAllByRole('button', { name: /Preview Cards/i })
    expect(previewButtons.length).toBeGreaterThan(0)
    const firstPreview = previewButtons[0]
    if (firstPreview) {
      await user.click(firstPreview)
    }

    expect(screen.getByText(/Binary search operates in O\(log n\)/i)).toBeInTheDocument()
  })

  it('imports all starter decks sequentially', async () => {
    const user = userEvent.setup()
    renderDialog()

    const importAllBtn = screen.getByRole('button', { name: /Import All \(30 Cards\)/i })
    await user.click(importAllBtn)

    await waitFor(() => {
      expect(mockedApi.createSet).toHaveBeenCalledTimes(3)
      expect(mockedApi.createCard).toHaveBeenCalledTimes(30)
    })
  })
})

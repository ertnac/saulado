import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import { QuickLearnDialog } from './QuickLearnDialog'

vi.mock('@/services/cards')
const mockedApi = vi.mocked(api)

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderDialog(open = true, initialSetId: string | null = null): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QuickLearnDialog open={open} onClose={vi.fn()} initialSetId={initialSetId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('QuickLearnDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedApi.listSets.mockResolvedValue({
      items: [
        {
          id: 'set-cs',
          title: 'Computer Science',
          parentId: null,
          color: 'teal',
          archivedAt: null,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          cardCount: 10,
          subtreeCardCount: 10,
          childCount: 0,
        },
        {
          id: 'set-bio',
          title: 'Cell Biology',
          parentId: null,
          color: 'blue',
          archivedAt: null,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          cardCount: 8,
          subtreeCardCount: 8,
          childCount: 0,
        },
      ],
      nextCursor: null,
    })
  })

  it('renders Choose Scope step with All Due option and set list', async () => {
    renderDialog()

    expect(screen.getByText('Quick Learn — Choose Study Scope')).toBeInTheDocument()
    expect(screen.getByText('All Due Flashcards')).toBeInTheDocument()
    expect(await screen.findByText('Computer Science')).toBeInTheDocument()
    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
  })

  it('filters set list using search query', async () => {
    const user = userEvent.setup()
    renderDialog()

    await screen.findByText('Computer Science')
    const searchInput = screen.getByPlaceholderText('Search study sets…')
    await user.type(searchInput, 'Biology')

    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
    expect(screen.queryByText('Computer Science')).not.toBeInTheDocument()
  })

  it('proceeds to mode selection and launches session with chosen answering type', async () => {
    const user = userEvent.setup()
    renderDialog()

    const allDueBtn = screen.getByText('All Due Flashcards')
    await user.click(allDueBtn)

    expect(await screen.findByText('Choose Answering Mode')).toBeInTheDocument()
    expect(screen.getByText('Type-In Mode')).toBeInTheDocument()
    expect(screen.getByText('Quiz Mode')).toBeInTheDocument()
    expect(screen.getByText('Flashcards')).toBeInTheDocument()

    const quizCard = screen.getByText('Quiz Mode')
    await user.click(quizCard)

    const launchBtn = screen.getByRole('button', { name: /Launch Session/i })
    await user.click(launchBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/study?type=multiple-choice')
  })

  it('selects a specific set and launches directly with mode hotkey button', async () => {
    const user = userEvent.setup()
    renderDialog()

    const selectButtons = await screen.findAllByRole('button', { name: /Select/i })
    expect(selectButtons.length).toBeGreaterThan(0)
    const firstSelectBtn = selectButtons[0]
    if (firstSelectBtn) {
      await user.click(firstSelectBtn)
    }

    expect(await screen.findByText('Choose Answering Mode')).toBeInTheDocument()
    const startFlashcardsBtn = screen.getByRole('button', { name: /Start \[F\]/i })
    await user.click(startFlashcardsBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/study?set=set-cs&type=flashcard')
  })
})

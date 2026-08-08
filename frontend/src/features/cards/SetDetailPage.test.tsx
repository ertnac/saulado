import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CardsResponse, StudyCardSummary, StudySet, TagsResponse } from '@saulado/shared'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import { SetDetailPage } from './SetDetailPage'

/**
 * One set and its cards.
 *
 * The tag filter is the part worth testing hardest. The API matches with
 * `hasEvery`, so picking two chips *narrows* the list — the opposite of what most
 * filter bars do — and the request has to carry both tags or the page silently
 * shows the wrong cards.
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
    cardCount: 1,
    ...overrides,
  }
}

function summary(overrides: Partial<StudyCardSummary> = {}): StudyCardSummary {
  return {
    id: 'card-1',
    studySetId: 'set-1',
    title: 'The CPU',
    paragraph: 'The CPU is the brain of the computer',
    tags: ['computing'],
    answerCount: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function cardsPage(items: StudyCardSummary[]): CardsResponse {
  return { items, nextCursor: null }
}

const TAGS: TagsResponse = {
  tags: [
    { tag: 'computing', count: 3 },
    { tag: 'biology', count: 1 },
  ],
}

function renderPage(): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sets/set-1']}>
        <Routes>
          <Route path="/sets/:setId" element={<SetDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.getSet.mockResolvedValue({ set: set() })
  mocked.listCards.mockResolvedValue(cardsPage([summary()]))
  mocked.listTags.mockResolvedValue(TAGS)
})

describe('the card list', () => {
  it('shows the paragraph, not the blanked form', async () => {
    // Every blanked row would start "The ____ is…" — the words the cloze removes
    // are exactly the ones that tell two cards apart in a list.
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'The CPU' })).toBeInTheDocument()
    })
    expect(screen.getByText('The CPU is the brain of the computer')).toBeInTheDocument()
    expect(screen.getByText('1 blank')).toBeInTheDocument()
  })

  it('links each card to its editor', async () => {
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'The CPU' })).toHaveAttribute('href', '/cards/card-1')
    })
  })

  it('teaches what a card is when the set is empty', async () => {
    mocked.listCards.mockResolvedValue(cardsPage([]))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('No cards yet')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Add your first card' })).toHaveAttribute(
      'href',
      '/sets/set-1/cards/new',
    )
  })

  it('explains a set that could not be loaded rather than showing an empty one', async () => {
    mocked.getSet.mockRejectedValue(new Error('gone'))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('That set could not be loaded')
    })
  })
})

describe('the tag filter', () => {
  it('sends the tag to the server', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'computing 3' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'computing 3' }))

    await waitFor(() => {
      expect(mocked.listCards).toHaveBeenCalledWith(
        'set-1',
        expect.objectContaining({ tag: ['computing'] }),
      )
    })
  })

  it('sends both tags when two chips are picked', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'computing 3' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'computing 3' }))
    await user.click(screen.getByRole('button', { name: 'biology 1' }))

    await waitFor(() => {
      expect(mocked.listCards).toHaveBeenCalledWith(
        'set-1',
        expect.objectContaining({ tag: ['computing', 'biology'] }),
      )
    })
  })

  it('says that two tags narrow rather than widen the list', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'computing 3' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'computing 3' }))
    await user.click(screen.getByRole('button', { name: 'biology 1' }))

    expect(screen.getByText(/all of: computing, biology/)).toBeInTheDocument()
  })

  it('marks the active chips as pressed', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'computing 3' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'computing 3' }))

    expect(screen.getByRole('button', { name: 'computing 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'biology 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('offers to clear the filter, not to create a card, when nothing matches', async () => {
    // Creating a card would not make it appear in a filtered list. Clearing is
    // the fix; offering the other one sends the user down a dead end.
    const user = userEvent.setup()
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'computing 3' })).toBeInTheDocument()
    })

    mocked.listCards.mockResolvedValue(cardsPage([]))
    await user.click(screen.getByRole('button', { name: 'computing 3' }))

    await waitFor(() => {
      expect(screen.getByText('No matching cards')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add your first card' })).not.toBeInTheDocument()
  })
})

describe('deleting a card', () => {
  it('confirms, naming the card and its blanks', async () => {
    const user = userEvent.setup()
    mocked.deleteCard.mockResolvedValue(undefined)
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('The CPU')
    expect(dialog).toHaveTextContent('1 blank')

    expect(mocked.deleteCard).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete card' }))

    await waitFor(() => {
      expect(mocked.deleteCard).toHaveBeenCalledWith('card-1')
    })
  })
})

describe('editing the set', () => {
  it('saves a renamed set', async () => {
    const user = userEvent.setup()
    mocked.updateSet.mockResolvedValue({ set: set({ title: 'Computer Hardware' }) })
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit set' })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: 'Edit set' }))

    const dialog = screen.getByRole('dialog')
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Computer Hardware')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocked.updateSet).toHaveBeenCalledWith(
        'set-1',
        expect.objectContaining({ title: 'Computer Hardware' }),
      )
    })
  })
})

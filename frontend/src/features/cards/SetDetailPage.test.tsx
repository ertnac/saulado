import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CardsResponse, StudyCardSummary, StudySet } from '@saulado/shared'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import * as studyApi from '@/services/study'
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
vi.mock('@/services/study')

const mocked = vi.mocked(api)
const mockedStudy = vi.mocked(studyApi)

function set(overrides: Partial<StudySet> = {}): StudySet {
  return {
    id: 'set-1',
    title: 'Hardware',
    parentId: null,
    color: 'blue',
    archivedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    cardCount: 1,
    subtreeCardCount: 1,
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

function cardsPage(items: StudyCardSummary[]): CardsResponse {
  return { items, nextCursor: null }
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
  mocked.listSets.mockResolvedValue({ items: [], nextCursor: null })
  mocked.listCards.mockResolvedValue(cardsPage([summary()]))
  mockedStudy.getDueCounts.mockResolvedValue({
    counts: [{ studySetId: 'set-1', due: 3, newCards: 1 }],
    totalDue: 3,
    totalNew: 1,
    scheduledCards: 8,
  })
})

describe('the card list', () => {
  it('shows the paragraph, not the blanked form', async () => {
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('The CPU is the brain of the computer')).toBeInTheDocument()
    })
    expect(screen.getByText('1 blank')).toBeInTheDocument()
  })

  it('allows editing each card inline', async () => {
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })
  })

  it('teaches what a card is when the set is empty', async () => {
    mocked.listCards.mockResolvedValue(cardsPage([]))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByText('No cards yet')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Add your first card' })).toBeInTheDocument()
  })

  it('explains a set that could not be loaded rather than showing an empty one', async () => {
    mocked.getSet.mockRejectedValue(new Error('gone'))
    render(renderPage())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('That set could not be loaded')
    })
  })
})

describe('the study affordance', () => {
  it('links to a session scoped to this set, counting due and new together', async () => {
    render(renderPage())

    const link = await screen.findByRole('link', { name: 'Study 4' })
    expect(link).toHaveAttribute('href', '/study?set=set-1')
  })

  it('disables rather than hides the button when nothing is due', async () => {
    // Unlike the library badge: the user came to this page *to* study this set,
    // and a button that vanishes leaves them with no way in and no explanation.
    mockedStudy.getDueCounts.mockResolvedValue({
      counts: [],
      totalDue: 0,
      totalNew: 0,
      scheduledCards: 0,
    })
    render(renderPage())

    const button = await screen.findByRole('button', { name: 'Study' })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('link', { name: /Study/ })).not.toBeInTheDocument()
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

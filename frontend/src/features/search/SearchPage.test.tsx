import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { SearchHit, SearchResponse, TagsResponse } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as accountApi from '@/services/account'
import * as cardsApi from '@/services/cards'
import { SearchPage } from './SearchPage'

/**
 * The full search screen.
 *
 * The design decision worth defending with tests is **filters live in the URL,
 * not in component state**. That is what makes a filtered view a link — it
 * survives reload, back-navigation and being pasted to yourself — and it is
 * exactly the property a refactor to `useState` would quietly destroy while every
 * visible behaviour still looked right. So these assert the query string, not
 * just the rendered rows.
 */

vi.mock('@/services/account')
vi.mock('@/services/cards')

const search = vi.mocked(accountApi)
const cards = vi.mocked(cardsApi)

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    cardId: 'card-1',
    label: 'The CPU',
    studySetId: 'set-1',
    setTitle: 'Hardware',
    setArchived: false,
    tags: ['computing'],
    snippet: [{ text: 'The CPU is the brain', match: false }],
    dueState: 'due',
    dueAt: '2026-08-08',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function response(items: SearchHit[], total = items.length, offset = 0): SearchResponse {
  return { query: '', sort: 'relevance', items, total, offset, limit: 20 }
}

const TAGS: TagsResponse = {
  tags: [
    { tag: 'computing', count: 4 },
    { tag: 'biology', count: 2 },
  ],
}

/** Echoes the live location so assertions can read the URL the page wrote. */
function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderPage(initial = '/search') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/search"
            element={
              <>
                <SearchPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/cards/:cardId" element={<p>Card page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function url(): string {
  return screen.getByTestId('location').textContent ?? ''
}

beforeEach(() => {
  vi.resetAllMocks()
  search.search.mockResolvedValue(response([hit()]))
  cards.listTags.mockResolvedValue(TAGS)
})

describe('SearchPage', () => {
  it('waits for a filter or some text before searching', async () => {
    renderPage()

    expect(await screen.findByText(/type something, or pick a filter/i)).toBeInTheDocument()
    expect(search.search).not.toHaveBeenCalled()
  })

  it('runs the search from the URL on first paint, without typing', async () => {
    renderPage('/search?q=cpu')

    expect(await screen.findByRole('link', { name: /the cpu/i })).toBeInTheDocument()
    await waitFor(() => {
      expect(search.search).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'cpu', limit: 20, offset: 0 }),
        expect.anything(),
      )
    })
  })

  it('writes the typed text into the query string', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText(/search text/i), 'cpu')

    await waitFor(() => {
      expect(url()).toBe('/search?q=cpu')
    })
  })

  it('browses on a filter alone, with no query text', async () => {
    renderPage()

    await userEvent.selectOptions(screen.getByLabelText(/filter by review state/i), 'due')

    expect(url()).toBe('/search?due=due')
    await waitFor(() => {
      expect(search.search).toHaveBeenCalledWith(
        expect.objectContaining({ due: 'due' }),
        expect.anything(),
      )
    })
  })

  it('toggles a tag on and back off', async () => {
    renderPage()

    const chip = await screen.findByRole('button', { name: /computing/i })
    await userEvent.click(chip)

    expect(url()).toBe('/search?tags=computing')
    expect(screen.getByRole('button', { name: /computing/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.click(screen.getByRole('button', { name: /computing/i }))
    expect(url()).toBe('/search')
  })

  /**
   * Page 3 of a narrower filter usually does not exist. Keeping `offset` while
   * adding a tag lands the user on an empty page that reads as "no results" when
   * there are plenty on page 1.
   */
  it('drops the page when a filter changes', async () => {
    renderPage('/search?q=cpu&offset=40')

    await userEvent.selectOptions(await screen.findByLabelText(/sort results/i), 'recent')

    expect(url()).toBe('/search?q=cpu&sort=recent')
  })

  it('pages forward and back through the results', async () => {
    search.search.mockResolvedValue(response([hit()], 45))
    renderPage('/search?q=cpu')

    await userEvent.click(await screen.findByRole('button', { name: /next/i }))
    expect(url()).toBe('/search?q=cpu&offset=20')

    await userEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(url()).toBe('/search?q=cpu')
  })

  it('hides the pager when everything fits on one page', async () => {
    search.search.mockResolvedValue(response([hit()], 1))
    renderPage('/search?q=cpu')

    await screen.findByRole('link', { name: /the cpu/i })
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })

  it('reports the window and total for screen readers', async () => {
    search.search.mockResolvedValue(response([hit(), hit({ cardId: 'card-2' })], 45))
    renderPage('/search?q=cpu')

    expect(await screen.findByText(/1–2 of 45 cards/i)).toBeInTheDocument()
  })

  it('marks a hit from an archived set as such', async () => {
    search.search.mockResolvedValue(response([hit({ setArchived: true })]))
    renderPage('/search?q=cpu')

    expect(await screen.findByText(/hardware \(archived\)/i)).toBeInTheDocument()
  })

  it('says nothing matched rather than showing an empty list', async () => {
    search.search.mockResolvedValue(response([], 0))
    renderPage('/search?q=zzz')

    expect(await screen.findByText(/nothing matched/i)).toBeInTheDocument()
  })

  it('clears every filter at once', async () => {
    renderPage('/search?q=cpu&due=due&tags=computing')

    await userEvent.click(await screen.findByRole('button', { name: /clear all/i }))

    expect(url()).toBe('/search')
    expect(screen.getByLabelText(/search text/i)).toHaveValue('')
  })

  it('opens a result', async () => {
    renderPage('/search?q=cpu')

    await userEvent.click(await screen.findByRole('link', { name: /the cpu/i }))

    expect(await screen.findByText('Card page')).toBeInTheDocument()
  })
})

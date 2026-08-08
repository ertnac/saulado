import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { SearchHit, SearchResponse } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/account'
import { CommandPalette } from './CommandPalette'
import { useSearchShortcut } from './useSearchShortcut'

/**
 * The Cmd/Ctrl+K palette.
 *
 * What these tests pin down is the keyboard contract, because that is the entire
 * reason the palette exists and it is the part a refactor breaks silently: the
 * arrows must move a highlight *without* moving focus out of the input, Enter
 * must open whatever the highlight is on, and a single typed character must not
 * reach the server (it would 400 — the server's minimum is two).
 */

vi.mock('@/services/account')

const mocked = vi.mocked(api)

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    cardId: 'card-1',
    title: 'The CPU',
    studySetId: 'set-1',
    setTitle: 'Hardware',
    setArchived: false,
    tags: ['computing'],
    snippet: [
      { text: 'The ', match: false },
      { text: 'CPU', match: true },
      { text: ' is the brain', match: false },
    ],
    dueState: 'due',
    dueAt: '2026-08-08',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function response(items: SearchHit[], total = items.length): SearchResponse {
  return { query: 'cpu', sort: 'relevance', items, total, offset: 0, limit: 8 }
}

/** Mounts the palette open, with a card route to catch the navigation. */
function renderPalette(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<CommandPalette open onClose={onClose} />} />
          <Route path="/cards/:cardId" element={<p>Card page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { onClose }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.search.mockResolvedValue(response([hit()]))
})

describe('CommandPalette', () => {
  it('does not search a single character', async () => {
    renderPalette()

    await userEvent.type(screen.getByRole('combobox'), 'c')

    expect(await screen.findByText(/at least two characters/i)).toBeInTheDocument()
    // Waited out the debounce and then some: the request must not merely be
    // late. Inside `act` because the debounce timer lands a state update.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    expect(mocked.search).not.toHaveBeenCalled()
  })

  it('searches once the query is long enough and renders highlighted snippets', async () => {
    renderPalette()

    await userEvent.type(screen.getByRole('combobox'), 'cpu')

    expect(await screen.findByRole('option', { name: /the cpu/i })).toBeInTheDocument()
    // The <mark> comes from server-parsed segments, never innerHTML.
    expect(screen.getByText('CPU', { selector: 'mark' })).toBeInTheDocument()
    await waitFor(() => {
      expect(mocked.search).toHaveBeenCalledWith({ q: 'cpu', limit: 8 }, expect.anything())
    })
  })

  it('moves the highlight with the arrows while focus stays in the input', async () => {
    mocked.search.mockResolvedValue(response([hit(), hit({ cardId: 'card-2', title: 'The GPU' })]))
    renderPalette()

    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'pu')
    await screen.findByRole('option', { name: /the gpu/i })

    await userEvent.keyboard('{ArrowDown}')

    expect(input).toHaveFocus()
    expect(screen.getByRole('option', { name: /the gpu/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(input).toHaveAttribute('aria-activedescendant', 'search-palette-option-1')
  })

  it('wraps from the first row to the last on ArrowUp', async () => {
    mocked.search.mockResolvedValue(response([hit(), hit({ cardId: 'card-2', title: 'The GPU' })]))
    renderPalette()

    await userEvent.type(screen.getByRole('combobox'), 'pu')
    await screen.findByRole('option', { name: /the gpu/i })

    await userEvent.keyboard('{ArrowUp}')

    expect(screen.getByRole('option', { name: /the gpu/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('opens the highlighted card on Enter and closes', async () => {
    const { onClose } = renderPalette()

    await userEvent.type(screen.getByRole('combobox'), 'cpu')
    await screen.findByRole('option', { name: /the cpu/i })

    await userEvent.keyboard('{Enter}')

    expect(await screen.findByText('Card page')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape without navigating', async () => {
    const { onClose } = renderPalette()

    await userEvent.type(screen.getByRole('combobox'), 'cpu')
    await screen.findByRole('option', { name: /the cpu/i })

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText('Card page')).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    mocked.search.mockResolvedValue(response([], 0))
    renderPalette()

    await userEvent.type(screen.getByRole('combobox'), 'zzz')

    expect(await screen.findByText(/no cards match that/i)).toBeInTheDocument()
  })
})

describe('useSearchShortcut', () => {
  function Harness() {
    const palette = useSearchShortcut()
    return (
      <>
        <p>{palette.open ? 'palette open' : 'palette closed'}</p>
        <button onClick={palette.onClose}>close</button>
      </>
    )
  }

  it('toggles on Ctrl+K', async () => {
    render(<Harness />)

    expect(screen.getByText('palette closed')).toBeInTheDocument()

    await userEvent.keyboard('{Control>}k{/Control}')
    expect(screen.getByText('palette open')).toBeInTheDocument()

    // The same keystroke dismisses it — that is what a user reaches for.
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(screen.getByText('palette closed')).toBeInTheDocument()
  })

  it('toggles on Meta+K for mac keyboards', async () => {
    render(<Harness />)

    await userEvent.keyboard('{Meta>}k{/Meta}')

    expect(screen.getByText('palette open')).toBeInTheDocument()
  })
})

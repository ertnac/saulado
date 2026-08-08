import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/study'
import { DashboardPage } from './DashboardPage'

/**
 * The dashboard.
 *
 * The distinction worth testing is between the four zero-ish states, because
 * they read completely differently to a user and the naive implementation
 * collapses them into one "0 due" number:
 *
 * - nothing scheduled *ever* → teach what a card is, do not show a count
 * - cards built but never studied → invite them to start
 * - reviews finished today → "caught up", an achievement
 * - reviews waiting → the count leads, with a way in
 *
 * The trap is that `counts` is empty for both the first and the third of those:
 * the endpoint only returns sets with something due or new. `scheduledCards` is
 * the only field that tells them apart.
 */

vi.mock('@/services/study')

const mocked = vi.mocked(api)

function renderPage(): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('when reviews are waiting', () => {
  beforeEach(() => {
    mocked.getDueCounts.mockResolvedValue({
      counts: [{ studySetId: 'set-1', due: 12, newCards: 3 }],
      totalDue: 12,
      scheduledCards: 40,
    })
  })

  it('leads with the count and a way into the session', async () => {
    render(renderPage())

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Study now' })).toHaveAttribute('href', '/study')
  })

  it('does not fall back to teaching what a card is', async () => {
    // The example card is for a user with nothing scheduled. Showing it above a
    // real backlog buries the thing they came to do.
    render(renderPage())
    await screen.findByText('12')

    expect(screen.queryByText('What a card looks like')).not.toBeInTheDocument()
  })
})

describe('when the day is done', () => {
  it('reads as an achievement rather than as emptiness', async () => {
    // The endpoint returns no rows at all here — everything is scheduled into the
    // future. Only `scheduledCards` separates this from a brand-new account.
    mocked.getDueCounts.mockResolvedValue({ counts: [], totalDue: 0, scheduledCards: 40 })
    render(renderPage())

    expect(await screen.findByText('Caught up for today')).toBeInTheDocument()
    // No "0" anywhere: a zeroed number reads as broken, not as finished.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('What a card looks like')).not.toBeInTheDocument()
  })

  it('points at the new cards left rather than claiming the day is over', async () => {
    mocked.getDueCounts.mockResolvedValue({
      counts: [{ studySetId: 'set-1', due: 0, newCards: 7 }],
      totalDue: 0,
      scheduledCards: 40,
    })
    render(renderPage())

    expect(await screen.findByRole('link', { name: 'Start learning' })).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.queryByText('Caught up for today')).not.toBeInTheDocument()
  })
})

describe('when the cards exist but have never been studied', () => {
  it('invites a start instead of claiming every review is done', async () => {
    // "Every review is done" is a claim about work this user has not begun.
    mocked.getDueCounts.mockResolvedValue({
      counts: [{ studySetId: 'set-1', due: 0, newCards: 12 }],
      totalDue: 0,
      scheduledCards: 0,
    })
    render(renderPage())

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start learning' })).toHaveAttribute('href', '/study')
    expect(screen.queryByText('Caught up for today')).not.toBeInTheDocument()
  })
})

describe('when nothing has ever been scheduled', () => {
  it('teaches what a card is instead of showing a count', async () => {
    mocked.getDueCounts.mockResolvedValue({ counts: [], totalDue: 0, scheduledCards: 0 })
    render(renderPage())

    expect(await screen.findByText('What a card looks like')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your first set' })).toBeInTheDocument()
    expect(screen.queryByText('Due today')).not.toBeInTheDocument()
  })

  it('keeps the blank a fixed width even in the illustration', async () => {
    // 8ch regardless of the answer (saulado-ux §1.1). A blank sized to its answer
    // rules out `photosynthesis` before the user has thought about it — and this
    // static example is where a reader learns what the shape means.
    mocked.getDueCounts.mockResolvedValue({ counts: [], totalDue: 0, scheduledCards: 0 })
    render(renderPage())

    const blank = await screen.findByLabelText('blank 1 of 1')
    expect(blank.style.width).toBe('8ch')
  })
})

describe('while the count is loading', () => {
  it('shows neither a count nor the empty state', async () => {
    // Rendering the "nothing scheduled" copy first would flash the wrong story at
    // a user who has 200 cards due, every single visit.
    mocked.getDueCounts.mockReturnValue(new Promise(() => undefined))
    render(renderPage())

    expect(await screen.findByText(/Build a set/)).toBeInTheDocument()
    expect(screen.queryByText('What a card looks like')).not.toBeInTheDocument()
    expect(screen.queryByText('Due today')).not.toBeInTheDocument()
  })
})

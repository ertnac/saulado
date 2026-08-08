import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { DashboardResponse } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/progress'
import { DashboardPage } from './DashboardPage'

/**
 * The dashboard.
 *
 * Two things are worth testing here, and neither is "does it render".
 *
 * **The four zero-ish states.** They read completely differently to a user and
 * the naive implementation collapses them into one "0 due" number:
 *
 * - nothing scheduled *ever* → teach what a card is, do not show a count
 * - cards built but never studied → invite them to start
 * - reviews finished today → "caught up", an achievement
 * - reviews waiting → the count leads, with a way in
 *
 * The trap is that `totalDue` is 0 for three of those. `hasStudied` is the only
 * field that separates them.
 *
 * **What a new user is not shown.** A 0-day streak, an empty goal ring and a
 * flat sparkline are all accurate on day one and all read as failure at a task
 * the user has not been offered yet.
 */

vi.mock('@/services/progress')

const mocked = vi.mocked(api)

/** Seven day keys ending today, which is what the endpoint promises. */
function lastSevenDays(): string[] {
  const days: string[] = []
  for (let back = 6; back >= 0; back--) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - back)
    days.push(date.toISOString().slice(0, 10))
  }
  return days
}

function sparkline(reviews: number[]): DashboardResponse['sparkline'] {
  return lastSevenDays().map((day, index) => ({
    day,
    reviews: reviews[index] ?? 0,
    correct: reviews[index] ?? 0,
    goalMet: false,
  }))
}

function dashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    totalDue: 0,
    newCards: 0,
    hasStudied: false,
    streak: { current: 0, longest: 0, studiedToday: false },
    today: { reviews: 0, correct: 0, goal: 20, goalMet: false },
    recentSets: [],
    sparkline: sparkline([0, 0, 0, 0, 0, 0, 0]),
    ...overrides,
  }
}

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
    mocked.getDashboard.mockResolvedValue(
      dashboard({
        totalDue: 12,
        newCards: 3,
        hasStudied: true,
        streak: { current: 4, longest: 9, studiedToday: false },
        today: { reviews: 0, correct: 0, goal: 20, goalMet: false },
        sparkline: sparkline([5, 8, 0, 12, 6, 3, 0]),
      }),
    )
  })

  it('leads with the count and a way into the session', async () => {
    render(renderPage())

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start studying' })).toHaveAttribute('href', '/study')
  })

  it('does not fall back to teaching what a card is', async () => {
    // The example card is for a user with nothing scheduled. Showing it above a
    // real backlog buries the thing they came to do.
    render(renderPage())
    await screen.findByText('12')

    expect(screen.queryByText('What a card looks like')).not.toBeInTheDocument()
  })

  it('offers exactly one large call to action', async () => {
    // The plan asks for a single dominant CTA. "New set" and "All sets" are
    // present but must not compete with it.
    render(renderPage())
    await screen.findByText('12')

    const links = screen.getAllByRole('link', { name: /^(Start studying|Start learning)$/ })
    expect(links).toHaveLength(1)
  })
})

describe('when the day is done', () => {
  it('reads as an achievement rather than as emptiness', async () => {
    mocked.getDashboard.mockResolvedValue(dashboard({ hasStudied: true }))
    render(renderPage())

    expect(await screen.findByText('Caught up for today')).toBeInTheDocument()
    expect(screen.queryByText('What a card looks like')).not.toBeInTheDocument()
  })

  it('points at the new cards left rather than claiming the day is over', async () => {
    mocked.getDashboard.mockResolvedValue(dashboard({ newCards: 7, hasStudied: true }))
    render(renderPage())

    expect(await screen.findByRole('link', { name: 'Start learning' })).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.queryByText('Caught up for today')).not.toBeInTheDocument()
  })
})

describe('when the cards exist but have never been studied', () => {
  beforeEach(() => {
    mocked.getDashboard.mockResolvedValue(
      dashboard({
        newCards: 12,
        hasStudied: false,
        recentSets: [
          { id: 'set-1', title: 'Cell Biology', cardCount: 12, dueCount: 0, lastStudiedAt: null },
        ],
      }),
    )
  })

  it('invites a start instead of claiming every review is done', async () => {
    // "Every review is done" is a claim about work this user has not begun.
    render(renderPage())

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start learning' })).toHaveAttribute('href', '/study')
    expect(screen.queryByText('Caught up for today')).not.toBeInTheDocument()
  })

  it('hides the streak, goal and sparkline entirely', async () => {
    /*
      The load-bearing assertion of Phase 5. Every one of these would render
      truthfully as a zero, and three zeroes on a first visit say "you are
      failing" about something the user has not been asked to do yet.
    */
    render(renderPage())
    await screen.findByText('12')

    expect(screen.queryByText('Streak')).not.toBeInTheDocument()
    expect(screen.queryByText('Start a streak today')).not.toBeInTheDocument()
    expect(screen.queryByText('Last 7 days')).not.toBeInTheDocument()
    expect(screen.queryByText(/of 20 reviews/)).not.toBeInTheDocument()
  })

  it('still lists the sets they have built', async () => {
    // Their sets are their work, not a statistic — those stay.
    render(renderPage())

    expect(await screen.findByRole('link', { name: /Cell Biology/ })).toHaveAttribute(
      'href',
      '/sets/set-1',
    )
  })
})

describe('when nothing has ever been scheduled', () => {
  beforeEach(() => {
    mocked.getDashboard.mockResolvedValue(dashboard())
  })

  it('teaches what a card is instead of showing a count', async () => {
    render(renderPage())

    expect(await screen.findByText('What a card looks like')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create your first set' })).toBeInTheDocument()
    expect(screen.queryByText('Due today')).not.toBeInTheDocument()
  })

  it('keeps the blank a fixed width even in the illustration', async () => {
    // 8ch regardless of the answer (saulado-ux §1.1). A blank sized to its answer
    // rules out `photosynthesis` before the user has thought about it — and this
    // static example is where a reader learns what the shape means.
    render(renderPage())

    const blank = await screen.findByLabelText('blank 1 of 1')
    expect(blank.style.width).toBe('8ch')
  })

  it('shows no progress section at all', async () => {
    render(renderPage())
    await screen.findByText('What a card looks like')

    expect(screen.queryByText('Your progress')).not.toBeInTheDocument()
  })
})

describe('once the user has studied', () => {
  beforeEach(() => {
    mocked.getDashboard.mockResolvedValue(
      dashboard({
        hasStudied: true,
        streak: { current: 3, longest: 11, studiedToday: true },
        today: { reviews: 12, correct: 10, goal: 20, goalMet: false },
        sparkline: sparkline([4, 0, 9, 6, 0, 2, 12]),
      }),
    )
  })

  it('shows the streak, the goal and the sparkline', async () => {
    render(renderPage())

    expect(await screen.findByText('3 days in a row')).toBeInTheDocument()
    expect(screen.getByText('12 of 20 reviews')).toBeInTheDocument()
    expect(screen.getByText('Last 7 days')).toBeInTheDocument()
  })

  it('frames the remainder as what is left rather than what is missing', async () => {
    render(renderPage())

    expect(await screen.findByText('8 to go today.')).toBeInTheDocument()
  })

  it('links through to the full progress page', async () => {
    render(renderPage())

    expect(await screen.findByRole('link', { name: 'See all progress' })).toHaveAttribute(
      'href',
      '/progress',
    )
  })

  it('describes the sparkline in text for a screen reader', async () => {
    // The bars are aria-hidden. Without this line the chart is nothing at all to
    // anyone not looking at it.
    render(renderPage())

    expect(
      await screen.findByText(/Reviews in the last 7 days: 33 reviews over 5 of the last 7 days/),
    ).toBeInTheDocument()
  })
})

describe('while the dashboard is loading', () => {
  it('shows neither a count nor the empty state', async () => {
    // Rendering the "nothing scheduled" copy first would flash the wrong story at
    // a user who has 200 cards due, every single visit.
    mocked.getDashboard.mockReturnValue(new Promise(() => undefined))
    render(renderPage())

    expect(await screen.findByText(/Build a set/)).toBeInTheDocument()
    expect(screen.queryByText('What a card looks like')).not.toBeInTheDocument()
    expect(screen.queryByText('Due today')).not.toBeInTheDocument()
  })
})

describe('when the request fails', () => {
  it('keeps a path into studying rather than blocking on the error', async () => {
    mocked.getDashboard.mockRejectedValue(new Error('offline'))
    render(renderPage())

    expect(await screen.findByText(/Could not load today's summary/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to study' })).toHaveAttribute('href', '/study')
  })
})

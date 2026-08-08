import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { DayStat, ProgressResponse } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/progress'
import { ProgressPage } from './ProgressPage'

/**
 * The progress page.
 *
 * Three things are worth asserting, and "the charts render" is not among them —
 * the charts have their own tests, and what matters here is what surrounds them:
 *
 * - **The empty state is a sentence, not four empty charts.** A user who has
 *   never studied gets told what the page will do, not shown the scaffolding of
 *   a report about nothing.
 * - **The range switcher is a radio group.** Four mutually exclusive options of
 *   which one is always chosen; a row of buttons announces none of that.
 * - **A missing accuracy is a dash, not a zero.** Same rule as everywhere else:
 *   0% is a claim the user got everything wrong.
 */

vi.mock('@/services/progress')

const mocked = vi.mocked(api)

/**
 * A dense series ending today, which is what the endpoint guarantees.
 *
 * `correct` is passed in rather than derived so the fixtures' day totals agree
 * with the `totals` block asserted against them — a fixture whose charts and
 * summary disagree would let a real disagreement through.
 */
function series(reviews: number[], correct: number[]): DayStat[] {
  return reviews.map((count, index) => {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - (reviews.length - 1 - index))

    return {
      day: date.toISOString().slice(0, 10),
      reviews: count,
      correct: correct[index] ?? 0,
      goalMet: false,
    }
  })
}

function progress(overrides: Partial<ProgressResponse> = {}): ProgressResponse {
  return {
    range: '30d',
    days: series([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]),
    totals: { reviews: 0, correct: 0, activeDays: 0 },
    streak: { current: 0, longest: 0, studiedToday: false },
    perSet: [],
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
        <ProgressPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('before the user has studied anything', () => {
  beforeEach(() => {
    mocked.getProgress.mockResolvedValue(progress())
  })

  it('says what the page will show instead of showing empty charts', async () => {
    /*
      The dense series means `days.length` is 30 even for a user with nothing —
      so an implementation keyed on the array length renders four charts of
      flat zero. `totals.reviews` is the field that actually distinguishes them.
    */
    render(renderPage())

    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Reviews per day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Study days' })).not.toBeInTheDocument()
  })

  it('offers a way to start rather than a dead end', async () => {
    render(renderPage())

    expect(await screen.findByRole('link', { name: 'Start studying' })).toHaveAttribute(
      'href',
      '/study',
    )
  })
})

describe('once there are reviews in the window', () => {
  beforeEach(() => {
    mocked.getProgress.mockResolvedValue(
      progress({
        days: series([5, 0, 12, 8, 0, 3, 20], [4, 0, 9, 6, 0, 2, 15]),
        totals: { reviews: 48, correct: 36, activeDays: 5 },
        streak: { current: 2, longest: 9, studiedToday: true },
        perSet: [
          {
            studySetId: 'set-1',
            title: 'Cell Biology',
            reviews: 40,
            correct: 32,
            cardsStudied: 18,
            cardCount: 24,
          },
          {
            studySetId: 'set-2',
            title: 'Spanish Verbs',
            reviews: 8,
            correct: 4,
            cardsStudied: 3,
            cardCount: 60,
          },
        ],
      }),
    )
  })

  it('summarises the window without making the reader do the arithmetic', async () => {
    render(renderPage())

    // Scoped to the summary: the charts' sr-only tables carry per-day counts and
    // per-day accuracies, so a bare `getByText('5')` matches a Tuesday too.
    const summary = within(await screen.findByRole('region', { name: 'Summary' }))

    expect(summary.getByText('48')).toBeInTheDocument()
    // 36/48. Rounded once, on the server's counts, not re-derived per chart.
    expect(summary.getByText('75%')).toBeInTheDocument()
    expect(summary.getByText('5')).toBeInTheDocument()
    expect(summary.getByText('of 7')).toBeInTheDocument()
  })

  it('breaks the work down by set, as a real table', async () => {
    render(renderPage())

    const table = await screen.findByRole('table', { name: /Reviews by set/ })
    // Two sets plus the header row.
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    // `scope="row"` on the title cell is what makes a screen reader say
    // "Cell Biology, Accuracy, 80%" rather than reading a bare number.
    const row = within(table).getByRole('row', { name: /Cell Biology/ })
    expect(within(row).getByText('80%')).toBeInTheDocument()
    expect(within(row).getByText('18 of 24')).toBeInTheDocument()
  })

  it('links each set back to itself', async () => {
    render(renderPage())

    expect(await screen.findByRole('link', { name: 'Spanish Verbs' })).toHaveAttribute(
      'href',
      '/sets/set-2',
    )
  })

  it('counts a single-day streak in the singular', async () => {
    mocked.getProgress.mockResolvedValue(
      progress({
        days: series([0, 0, 0, 0, 0, 0, 4], [0, 0, 0, 0, 0, 0, 4]),
        totals: { reviews: 4, correct: 4, activeDays: 1 },
        streak: { current: 1, longest: 1, studiedToday: true },
      }),
    )
    render(renderPage())

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(summary.getByText('1 day')).toBeInTheDocument()
  })
})

describe('a set studied but never answered correctly', () => {
  it('shows a real 0%, and a dash only when there is nothing to measure', async () => {
    mocked.getProgress.mockResolvedValue(
      progress({
        days: series([0, 0, 0, 0, 0, 0, 6], [0, 0, 0, 0, 0, 0, 0]),
        totals: { reviews: 6, correct: 0, activeDays: 1 },
        perSet: [
          {
            studySetId: 'set-1',
            title: 'Hard Set',
            reviews: 6,
            correct: 0,
            cardsStudied: 6,
            cardCount: 6,
          },
          {
            /*
              The server filters these out today (`readPerSet` keeps only sets
              with reviews in the window), so this is a contract test, not a
              reachability one: the type permits zero reviews, and if that filter
              ever relaxes the cell must read "—" rather than "0%".
            */
            studySetId: 'set-2',
            title: 'Untouched Set',
            reviews: 0,
            correct: 0,
            cardsStudied: 0,
            cardCount: 10,
          },
        ],
      }),
    )
    render(renderPage())

    const table = await screen.findByRole('table', { name: /Reviews by set/ })

    const hard = within(table).getByRole('row', { name: /Hard Set/ })
    expect(within(hard).getByText('0%')).toBeInTheDocument()

    const untouched = within(table).getByRole('row', { name: /Untouched Set/ })
    expect(within(untouched).getByText('—')).toBeInTheDocument()
  })
})

describe('the range switcher', () => {
  beforeEach(() => {
    mocked.getProgress.mockResolvedValue(
      progress({
        days: series([5, 0, 12, 8, 0, 3, 20], [4, 0, 9, 6, 0, 2, 15]),
        totals: { reviews: 48, correct: 36, activeDays: 5 },
      }),
    )
  })

  it('is a radio group with one range always chosen', async () => {
    render(renderPage())

    const group = await screen.findByRole('group', { name: 'Time range' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(within(group).getByRole('radio', { name: '30 days' })).toBeChecked()
  })

  it('asks the server for the range the user picked', async () => {
    render(renderPage())
    await screen.findByRole('radio', { name: 'A year' })

    await userEvent.click(screen.getByRole('radio', { name: 'A year' }))

    // Not client-side filtering of the 30-day series: a year of days is not a
    // superset the client is holding, so the range has to reach the server.
    await waitFor(() => {
      expect(mocked.getProgress).toHaveBeenCalledWith('365d')
    })
  })
})

describe('when the request fails', () => {
  it('keeps a path into studying rather than blocking on the error', async () => {
    mocked.getProgress.mockRejectedValue(new Error('offline'))
    render(renderPage())

    expect(await screen.findByText(/Could not load your progress/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to study' })).toHaveAttribute('href', '/study')
  })
})

describe('while loading', () => {
  it('shows neither the empty state nor a report', async () => {
    // Flashing "No reviews yet" at a user with a year of history, every visit.
    mocked.getProgress.mockReturnValue(new Promise(() => undefined))
    render(renderPage())

    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.queryByText('No reviews yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Reviews by set/ })).not.toBeInTheDocument()
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type {
  AnswerResponse,
  SessionCard,
  SessionResponse,
  StudySession,
  SummaryResponse,
} from '@saulado/shared'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/api'
import * as api from '@/services/study'
import { StudySessionPage } from './StudySessionPage'

/**
 * The study screen.
 *
 * Two properties matter more than the rest and are asserted directly rather than
 * through the UI's appearance:
 *
 * 1. **No answer text is in the DOM before submission.** The server sends
 *    segments, not answers, but a component that reconstructed the paragraph from
 *    a leaked field would look identical on screen — so the assertion is on the
 *    rendered markup, not on what the page displays.
 * 2. **The idempotency key is stable across a retry of the same card.** That is
 *    the entire protection against a double-tap booking two reviews, and it is
 *    invisible in the UI.
 */

vi.mock('@/services/study')

const mocked = vi.mocked(api)

function card(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'card-1',
    studySetId: 'set-1',
    title: 'The CPU',
    // "The ____ is the brain of the computer" — the answer is never in segments.
    segments: [
      { kind: 'text', text: 'The ' },
      { kind: 'blank', ordinal: 0, answerLength: 5 },
      { kind: 'text', text: ' is the brain of the computer' },
    ],
    blankCount: 1,
    tags: ['computing'],
    isNew: false,
    isLeech: false,
    ...overrides,
  }
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'session-1',
    studySetId: 'set-1',
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: null,
    queue: [card()],
    progress: { answered: 0, total: 1, correct: 0 },
    ...overrides,
  }
}

function graded(overrides: Partial<AnswerResponse> = {}): AnswerResponse {
  return {
    results: [
      { ordinal: 0, submitted: 'CPU', correct: true, matchType: 'exact', canonical: 'CPU' },
    ],
    grade: 'good',
    correct: true,
    dueAt: '2026-08-14',
    intervalDays: 6,
    isLeech: false,
    requeued: false,
    progress: { answered: 1, total: 1, correct: 1 },
    ...overrides,
  }
}

const SUMMARY: SummaryResponse = {
  summary: {
    sessionId: 'session-1',
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T09:04:00.000Z',
    cardsSeen: 1,
    correctCards: 1,
    accuracy: 1,
    durationMs: 240_000,
    toRevisit: [],
    reviewsToday: 1,
    dailyGoal: 20,
    goalMet: false,
  },
}

function renderPage(path = '/study?set=set-1'): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/study" element={<StudySessionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mocked.startSession.mockResolvedValue({ session: session() })
  mocked.completeSession.mockResolvedValue(SUMMARY)
})

describe('presenting a card', () => {
  it('renders the paragraph with an input where the blank is', async () => {
    render(renderPage())

    expect(await screen.findByRole('heading', { name: 'The CPU' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Blank 1 of 1' })).toBeInTheDocument()
    expect(screen.getByText(/is the brain of the computer/)).toBeInTheDocument()
  })

  it('does not put the answer anywhere in the DOM before submission', async () => {
    const { container } = render(renderPage())
    await screen.findByRole('heading', { name: 'The CPU' })

    // Not `queryByText` — an answer leaked into a `value`, a `data-` attribute or
    // a hidden input would pass that and still be readable in devtools.
    expect(container.innerHTML).not.toContain('CPU is the brain')
  })

  it('reserves the blank width up front so revealing cannot reflow the text', async () => {
    render(renderPage())
    const input = await screen.findByRole('textbox', { name: 'Blank 1 of 1' })

    // 5ch of text plus the container's own padding — the same calc the graded
    // span uses, which is what keeps the two states the same size.
    expect(input.style.width).toBe('calc(5ch + 1rem)')
  })

  it('starts a session for the set in the query string', async () => {
    render(renderPage())
    await screen.findByRole('heading', { name: 'The CPU' })

    expect(mocked.startSession).toHaveBeenCalledWith('set-1')
  })

  it('starts an all-sets session when no set is given', async () => {
    render(renderPage('/study'))
    await screen.findByRole('heading', { name: 'The CPU' })

    expect(mocked.startSession).toHaveBeenCalledWith(undefined)
  })
})

describe('answering', () => {
  it('submits what was typed and shows the verdict', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(graded())

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(await screen.findByText('Correct')).toBeInTheDocument()
    expect(mocked.submitAnswer).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        cardId: 'card-1',
        blanks: [{ ordinal: 0, submitted: 'CPU' }],
      }),
    )
  })

  it('never sends a grade — the server decides what the answer was worth', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(graded())

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await screen.findByText('Correct')

    expect(mocked.submitAnswer.mock.calls[0]?.[1]).not.toHaveProperty('grade')
  })

  it('submits on Enter from inside a blank', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(graded())

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU{Enter}')

    expect(await screen.findByText('Correct')).toBeInTheDocument()
  })

  it('shows the right answer beside what the user wrote when wrong', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(
      graded({
        results: [
          { ordinal: 0, submitted: 'RAM', correct: false, matchType: 'wrong', canonical: 'CPU' },
        ],
        grade: 'again',
        correct: false,
        intervalDays: 1,
        progress: { answered: 1, total: 1, correct: 0 },
      }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'RAM')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(await screen.findByText('Not quite')).toBeInTheDocument()
    // Both, not just the correction: "it was CPU" alone leaves the user to
    // remember what they typed.
    expect(screen.getByText('RAM')).toBeInTheDocument()
    expect(screen.getAllByText('CPU').length).toBeGreaterThan(0)
  })

  it('shows the canonical spelling when a typo was accepted', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(
      graded({
        results: [
          {
            ordinal: 0,
            submitted: 'mitochondira',
            correct: true,
            matchType: 'typo',
            canonical: 'mitochondria',
          },
        ],
      }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'mitochondira')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    // Otherwise the user rehearses their own misspelling and it sticks.
    expect(await screen.findByText(/Counted as correct despite the spelling/)).toBeInTheDocument()
  })

  it('reveals without sending the typed text as an attempt', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(
      graded({
        results: [
          { ordinal: 0, submitted: '', correct: false, matchType: 'wrong', canonical: 'CPU' },
        ],
        grade: 'again',
        correct: false,
        intervalDays: 1,
      }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Reveal answer' }))
    await screen.findByText('Not quite')

    expect(mocked.submitAnswer.mock.calls[0]?.[1]).toMatchObject({ revealed: true })
  })

  it('keeps the answer on screen when submitting fails, and retries with the same key', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockRejectedValueOnce(new Error('Network down'))
    mocked.submitAnswer.mockResolvedValueOnce(graded())

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    // Still typed in — losing it would make a flaky connection cost the answer.
    expect(screen.getByRole('textbox', { name: 'Blank 1 of 1' })).toHaveValue('CPU')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Correct')

    // The same key both times: this is what stops a retry of a request that
    // actually landed from booking a second review.
    const first = mocked.submitAnswer.mock.calls[0]?.[1].idempotencyKey
    const second = mocked.submitAnswer.mock.calls[1]?.[1].idempotencyKey
    expect(first).toBeDefined()
    expect(second).toBe(first)
  })
})

describe('walking the queue', () => {
  const TWO = session({
    queue: [card(), card({ cardId: 'card-2', title: 'The GPU' })],
    progress: { answered: 0, total: 2, correct: 0 },
  })

  it('moves to the next card without refetching the queue', async () => {
    const user = userEvent.setup()
    mocked.startSession.mockResolvedValue({ session: TWO })
    mocked.submitAnswer.mockResolvedValue(
      graded({ progress: { answered: 1, total: 2, correct: 1 } }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(await screen.findByRole('button', { name: 'Next card' }))

    expect(await screen.findByRole('heading', { name: 'The GPU' })).toBeInTheDocument()
    // A refetch here would swap the queue under the user mid-session.
    expect(mocked.getSession).not.toHaveBeenCalled()
  })

  it('clears the previous answer out of the next card', async () => {
    const user = userEvent.setup()
    mocked.startSession.mockResolvedValue({ session: TWO })
    mocked.submitAnswer.mockResolvedValue(
      graded({ progress: { answered: 1, total: 2, correct: 1 } }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(await screen.findByRole('button', { name: 'Next card' }))
    await screen.findByRole('heading', { name: 'The GPU' })

    expect(screen.getByRole('textbox', { name: 'Blank 1 of 1' })).toHaveValue('')
  })

  it('issues a fresh idempotency key per card', async () => {
    const user = userEvent.setup()
    mocked.startSession.mockResolvedValue({ session: TWO })
    mocked.submitAnswer.mockResolvedValue(
      graded({ progress: { answered: 1, total: 2, correct: 1 } }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(await screen.findByRole('button', { name: 'Next card' }))
    await screen.findByRole('heading', { name: 'The GPU' })
    await user.type(screen.getByRole('textbox', { name: 'Blank 1 of 1' }), 'GPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    await waitFor(() => {
      expect(mocked.submitAnswer).toHaveBeenCalledTimes(2)
    })
    // Reusing the key would make the second card replay the first verdict.
    expect(mocked.submitAnswer.mock.calls[1]?.[1].idempotencyKey).not.toBe(
      mocked.submitAnswer.mock.calls[0]?.[1].idempotencyKey,
    )
  })

  it('keeps a re-queued card in the session rather than finishing', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(
      graded({
        grade: 'again',
        correct: false,
        requeued: true,
        intervalDays: 1,
        progress: { answered: 1, total: 1, correct: 0 },
      }),
    )

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'RAM')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    // Not "Finish session": the card is coming back, so the queue is not empty.
    const next = await screen.findByRole('button', { name: 'Next card' })
    expect(screen.getByText(/Coming back later in this session/)).toBeInTheDocument()

    await user.click(next)
    expect(await screen.findByRole('heading', { name: 'The CPU' })).toBeInTheDocument()
    expect(mocked.completeSession).not.toHaveBeenCalled()
  })

  it('completes the session after the last card', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(graded())

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(await screen.findByRole('button', { name: 'Finish session' }))

    expect(await screen.findByRole('heading', { name: 'Session complete' })).toBeInTheDocument()
    expect(mocked.completeSession).toHaveBeenCalledWith('session-1')
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('ends early when the user asks to', async () => {
    const user = userEvent.setup()

    render(renderPage())
    await screen.findByRole('heading', { name: 'The CPU' })
    await user.click(screen.getByRole('button', { name: 'End session' }))

    expect(await screen.findByRole('heading', { name: 'Session complete' })).toBeInTheDocument()
  })
})

describe('interruption recovery', () => {
  it('resumes the stored session instead of starting a new one', async () => {
    localStorage.setItem(
      'saulado-study-session',
      JSON.stringify({ sessionId: 'session-9', savedAt: Date.now() }),
    )
    const resumed: SessionResponse = {
      session: session({ id: 'session-9', progress: { answered: 3, total: 4, correct: 2 } }),
    }
    mocked.getSession.mockResolvedValue(resumed)

    render(renderPage())

    expect(await screen.findByRole('heading', { name: 'The CPU' })).toBeInTheDocument()
    expect(mocked.getSession).toHaveBeenCalledWith('session-9')
    expect(mocked.startSession).not.toHaveBeenCalled()
    // Progress comes back with it — a client-held counter would have died.
    expect(screen.getByText('3 of 4 answered')).toBeInTheDocument()
  })

  it('starts fresh when the stored session is gone', async () => {
    localStorage.setItem(
      'saulado-study-session',
      JSON.stringify({ sessionId: 'session-dead', savedAt: Date.now() }),
    )
    mocked.getSession.mockRejectedValue(new Error('Not found'))

    render(renderPage())

    expect(await screen.findByRole('heading', { name: 'The CPU' })).toBeInTheDocument()
    expect(mocked.startSession).toHaveBeenCalled()
    expect(localStorage.getItem('saulado-study-session')).toContain('session-1')
  })

  it('ignores a pointer old enough to be from another day', async () => {
    localStorage.setItem(
      'saulado-study-session',
      JSON.stringify({ sessionId: 'session-old', savedAt: Date.now() - 13 * 60 * 60 * 1000 }),
    )

    render(renderPage())
    await screen.findByRole('heading', { name: 'The CPU' })

    expect(mocked.getSession).not.toHaveBeenCalled()
    expect(mocked.startSession).toHaveBeenCalled()
  })

  it('forgets the session once it is complete', async () => {
    const user = userEvent.setup()
    mocked.submitAnswer.mockResolvedValue(graded())

    render(renderPage())
    await user.type(await screen.findByRole('textbox', { name: 'Blank 1 of 1' }), 'CPU')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await user.click(await screen.findByRole('button', { name: 'Finish session' }))
    await screen.findByRole('heading', { name: 'Session complete' })

    // Otherwise the next visit tries to resume a session that is already over.
    expect(localStorage.getItem('saulado-study-session')).toBeNull()
  })
})

describe('when there is nothing to study', () => {
  it('says so plainly rather than showing an error', async () => {
    mocked.startSession.mockRejectedValue(
      new ApiError('Nothing is due right now. Come back later.', 400, 'VALIDATION_ERROR'),
    )

    render(renderPage())

    expect(await screen.findByText('Nothing due right now')).toBeInTheDocument()
    // A retry button here would invite the user to keep asking a settled question.
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('offers a retry for a real failure', async () => {
    mocked.startSession.mockRejectedValue(new Error('Network down'))

    render(renderPage())

    expect(await screen.findByText('Could not start')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('under StrictMode, as the app actually runs', () => {
  /**
   * `main.tsx` wraps the app in `StrictMode`, which in development mounts,
   * unmounts and remounts every component before settling. That teardown
   * unsubscribes `useMutation`, and query-core's `MutationObserver` detaches
   * itself from the in-flight mutation on unsubscribe without ever re-attaching
   * — it defines `onUnsubscribe` and no `onSubscribe`. Since a mutation only
   * dispatches to attached observers, the remounted page is left holding an
   * observer wired to nothing: `onSuccess` never fires, `data` never lands, and
   * the status is stuck on `pending` for good.
   *
   * Both branches below hang on that, which is why there are two: the success
   * path waits forever for a card, and the error path never gets to say why it
   * has nothing. Every other test in this file renders without StrictMode,
   * which is exactly why this got through.
   */
  it('loads the queue even though StrictMode remounts the page', async () => {
    render(<StrictMode>{renderPage()}</StrictMode>)

    expect(await screen.findByRole('heading', { name: 'The CPU' })).toBeInTheDocument()
    // And only one session was created, which is what the guard is for.
    expect(mocked.startSession).toHaveBeenCalledTimes(1)
  })

  it('still reports a start that failed', async () => {
    mocked.startSession.mockRejectedValue(
      new ApiError('Nothing is due right now. Come back later.', 400, 'VALIDATION_ERROR'),
    )

    render(<StrictMode>{renderPage()}</StrictMode>)

    expect(await screen.findByText('Nothing due right now')).toBeInTheDocument()
  })
})

describe('a session that arrives with nothing in it', () => {
  /**
   * The failure this guards against: the page waits on `session.card`, which is
   * null both while the queue is loading and when it loaded empty. A session
   * answered to the end without the completion call landing — reload on the last
   * card, closed tab, finished in another tab — comes back open with an empty
   * queue, and the skeleton then waits for a card that never arrives.
   */
  it('says the session is finished instead of loading forever', async () => {
    mocked.startSession.mockResolvedValue({
      session: session({ queue: [], progress: { answered: 1, total: 1, correct: 1 } }),
    })

    render(renderPage())

    expect(await screen.findByText('This session is finished')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('drops the resume pointer so a reload does not land back here', async () => {
    mocked.startSession.mockResolvedValue({ session: session({ queue: [] }) })

    render(renderPage())

    await screen.findByText('This session is finished')
    await waitFor(() => {
      expect(localStorage.getItem('saulado-study-session')).toBeNull()
    })
  })

  it('starts a fresh session when asked to study again', async () => {
    mocked.startSession.mockResolvedValueOnce({ session: session({ queue: [] }) })
    mocked.startSession.mockResolvedValueOnce({ session: session({ id: 'session-2' }) })

    render(renderPage())

    await screen.findByText('This session is finished')
    await userEvent.click(screen.getByRole('button', { name: 'Study again' }))

    expect(await screen.findByRole('heading', { name: 'The CPU' })).toBeInTheDocument()
  })
})

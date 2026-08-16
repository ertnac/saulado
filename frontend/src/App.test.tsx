import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthResponse } from '@saulado/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { setAccessToken } from './services/api'
import { useAuthStore } from './stores/auth'

/**
 * Routing and session-restore behaviour.
 *
 * These assert the Phase 2 done-when criterion at the level the browser cares
 * about: a reload with a live refresh cookie lands on the dashboard, and one
 * without lands on login — without flashing the wrong one on the way.
 */

function session(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    user: {
      id: 'u1',
      email: 'learner@example.com',
      createdAt: '2026-08-01T00:00:00.000Z',
      emailVerifiedAt: null,
    },
    settings: {
      darkMode: false,
      dailyGoal: 20,
      newCardsPerDay: 10,
      notificationsEnabled: true,
      typoTolerance: false,
      blankWidthMode: 'fixed',
      timezone: 'UTC',
      nickname: 'Learner',
      profileImage: null,
    },
    accessToken: 'access-token',
    expiresIn: 900,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

/** Refresh answers first; anything after it falls through to this queue. */
function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const res of responses) fn.mockResolvedValueOnce(res)
  fn.mockResolvedValue(jsonResponse({ error: { code: 'NOT_FOUND', message: 'no' } }, 404))
  vi.stubGlobal('fetch', fn)
  return fn
}

function unauthorized(): Response {
  return jsonResponse(
    { error: { code: 'TOKEN_INVALID', message: 'No refresh token present.' } },
    401,
  )
}

beforeEach(() => {
  // The store and the in-memory token are module singletons, so they survive
  // between tests and would otherwise leak a session into the next one.
  useAuthStore.setState({ status: 'restoring', user: null, settings: null })
  setAccessToken(null)
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session restore', () => {
  it('lands on the dashboard when the refresh cookie is still good', async () => {
    mockFetch(jsonResponse(session()))
    render(<App />)

    // The restoring state must not render the login page, even for a frame.
    expect(screen.getByText('Restoring your session')).toBeInTheDocument()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Welcome, learner/, level: 1 }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('redirects to sign in when there is no session', async () => {
    mockFetch(unauthorized())
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
    })
  })

  it('asks for a refresh exactly once, despite StrictMode double-invoking effects', async () => {
    // Two refreshes would replay a spent token and trip the server's reuse
    // detection, logging the user out of their own app.
    const fetchMock = mockFetch(jsonResponse(session()))
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome/, level: 1 })).toBeInTheDocument()
    })

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/auth/refresh'),
    )
    expect(refreshCalls).toHaveLength(1)
  })
})

describe('routing', () => {
  it('keeps a signed-in user off the login page', async () => {
    window.history.pushState({}, '', '/login')
    mockFetch(jsonResponse(session()))
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome/, level: 1 })).toBeInTheDocument()
    })
  })

  it('serves a 404 for an unknown path', async () => {
    window.history.pushState({}, '', '/nope')
    mockFetch(unauthorized())
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No page here', level: 1 })).toBeInTheDocument()
    })
    expect(screen.getByText('/nope')).toBeInTheDocument()
  })

  it('renders the reset form for a signed-in user following a reset link', async () => {
    window.history.pushState({}, '', '/reset-password?token=abc123')
    mockFetch(jsonResponse(session()))
    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Choose a new password', level: 1 }),
      ).toBeInTheDocument()
    })
  })

  it('explains a reset link that arrived without its token', async () => {
    window.history.pushState({}, '', '/reset-password')
    mockFetch(unauthorized())
    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'This link is incomplete', level: 1 }),
      ).toBeInTheDocument()
    })
  })
})

describe('login form', () => {
  it('shows the server message beside the field it belongs to', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/login')
    mockFetch(
      unauthorized(),
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please check the highlighted fields.',
            fields: { email: 'Enter a valid email address.' },
          },
        },
        400,
      ),
    )
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'whatever-long-enough')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    })
    // A field error is not repeated as a banner.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('turns a 429 into a wait time the user can act on', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/login')
    mockFetch(
      unauthorized(),
      jsonResponse(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many attempts. Please wait and try again.',
            retryAfter: 900,
          },
        },
        429,
      ),
    )
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Email'), 'learner@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password-here')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('about 15 minutes')
    })
  })
})

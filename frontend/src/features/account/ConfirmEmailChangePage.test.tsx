import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/account'
import { useAuthStore } from '@/stores/auth'
import { ConfirmEmailChangePage } from './ConfirmEmailChangePage'

/**
 * The landing page for the link mailed to the *new* address.
 *
 * Two things here are easy to get wrong and invisible when they are:
 *
 * - The token is single-use and spent by this page. Firing the mutation on every
 *   render (or on a re-render caused by the mutation itself) turns a successful
 *   change into an "invalid link" screen on the second pass.
 * - The server revoked every session, so the client has to stop claiming to be
 *   signed in. Leaving the store authenticated means the app keeps making
 *   requests with a token whose account just changed its login identity.
 */

vi.mock('@/services/account')

const mocked = vi.mocked(api)

function renderPage(search: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/account/email/confirm${search}`]}>
        <Routes>
          <Route path="/account/email/confirm" element={<ConfirmEmailChangePage />} />
          <Route path="/settings" element={<p>Settings page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'user-1',
      email: 'old@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    },
    settings: null,
  })
})

describe('ConfirmEmailChangePage', () => {
  it('confirms the change with the token from the URL', async () => {
    mocked.confirmEmailChange.mockResolvedValue({ message: 'Email updated.' })

    renderPage('?token=abc123')

    expect(await screen.findByText(/email address updated/i)).toBeInTheDocument()
    expect(mocked.confirmEmailChange).toHaveBeenCalledWith({ token: 'abc123' })
  })

  it('spends the token exactly once', async () => {
    mocked.confirmEmailChange.mockResolvedValue({ message: 'Email updated.' })

    renderPage('?token=abc123')
    await screen.findByText(/email address updated/i)

    expect(mocked.confirmEmailChange).toHaveBeenCalledTimes(1)
  })

  /**
   * The server ended every session; the client has to agree. Otherwise the app
   * still renders as signed in and keeps issuing requests against an account
   * whose login address just moved.
   */
  it('drops the local session on success', async () => {
    mocked.confirmEmailChange.mockResolvedValue({ message: 'Email updated.' })

    renderPage('?token=abc123')
    await screen.findByText(/email address updated/i)

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('anonymous')
    })
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('shows progress while the request is in flight', async () => {
    mocked.confirmEmailChange.mockReturnValue(new Promise(() => undefined))

    renderPage('?token=abc123')

    expect(await screen.findByText(/confirming your new email/i)).toBeInTheDocument()
  })

  it('says the link did not work, and that the address is unchanged', async () => {
    mocked.confirmEmailChange.mockRejectedValue(new Error('invalid token'))

    renderPage('?token=stale')

    expect(await screen.findByText(/that link did not work/i)).toBeInTheDocument()
    expect(screen.getByText(/has not changed/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to settings/i })).toBeInTheDocument()
  })

  it('does not call the server at all when the link has no token', () => {
    renderPage('')

    expect(screen.getByText(/this link is incomplete/i)).toBeInTheDocument()
    expect(mocked.confirmEmailChange).not.toHaveBeenCalled()
  })
})

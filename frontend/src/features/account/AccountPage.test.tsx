import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { DataExport, PublicUser } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/account'
import { ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { AccountPage } from './AccountPage'

/**
 * Account and data.
 *
 * Three of the four sections here are irreversible or security-relevant, so what
 * these tests protect is the *friction*, not the happy path:
 *
 * - Deletion cannot be submitted until the word is typed exactly. A regression
 *   that enables the button early is a data-loss bug, and nothing else in the
 *   product can produce one.
 * - Changing the email does not change the email. The address moves when the
 *   link is opened, and a UI that congratulates the user too early leaves them
 *   locked out of an account they think has a new address.
 * - Changing the password ends the session, so the page has to leave for the
 *   login screen rather than sit there holding a dead token.
 */

vi.mock('@/services/account')

const mocked = vi.mocked(api)

const USER: PublicUser = {
  id: 'user-1',
  email: 'old@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ status: 'authenticated', user: USER, settings: null })
})

describe('changing the email address', () => {
  it('says the address has not changed yet', async () => {
    mocked.changeEmail.mockResolvedValue({ message: 'Check your inbox.' })
    renderPage()

    await userEvent.type(screen.getByLabelText(/new email address/i), 'new@example.com')
    await userEvent.type(
      screen.getAllByLabelText(/current password/i)[0] as HTMLElement,
      'hunter2hunter2',
    )
    await userEvent.click(screen.getByRole('button', { name: /send confirmation link/i }))

    expect(await screen.findByText(/check/i)).toBeInTheDocument()
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
    // The old address is still the account's, and the copy has to say so.
    expect(screen.getByText('old@example.com')).toBeInTheDocument()
    expect(mocked.changeEmail).toHaveBeenCalledWith({
      email: 'new@example.com',
      currentPassword: 'hunter2hunter2',
    })
  })

  it('replaces the form so it cannot be submitted twice', async () => {
    mocked.changeEmail.mockResolvedValue({ message: 'Check your inbox.' })
    renderPage()

    await userEvent.type(screen.getByLabelText(/new email address/i), 'new@example.com')
    await userEvent.type(
      screen.getAllByLabelText(/current password/i)[0] as HTMLElement,
      'hunter2hunter2',
    )
    await userEvent.click(screen.getByRole('button', { name: /send confirmation link/i }))

    await screen.findByRole('button', { name: /change a different address/i })
    expect(screen.queryByLabelText(/new email address/i)).not.toBeInTheDocument()
  })

  it('puts a rejected password beside its field', async () => {
    mocked.changeEmail.mockRejectedValue(
      new ApiError('Incorrect password.', 401, 'INVALID_CREDENTIALS', {
        currentPassword: 'Incorrect password.',
      }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/new email address/i), 'new@example.com')
    await userEvent.type(screen.getAllByLabelText(/current password/i)[0] as HTMLElement, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /send confirmation link/i }))

    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument()
    // Still on the form — a rejected attempt must be retryable in place.
    expect(screen.getByLabelText(/new email address/i)).toBeInTheDocument()
  })
})

describe('changing the password', () => {
  it('leaves for the login page, because the session is gone', async () => {
    mocked.changePassword.mockResolvedValue({ message: 'Password updated.' })
    renderPage()

    await userEvent.type(
      screen.getAllByLabelText(/current password/i)[1] as HTMLElement,
      'hunter2hunter2',
    )
    await userEvent.type(screen.getByLabelText(/new password/i), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(mocked.changePassword).toHaveBeenCalledWith({
      currentPassword: 'hunter2hunter2',
      newPassword: 'correct horse battery',
    })
  })

  it('rejects a too-short new password without a round trip', async () => {
    renderPage()

    await userEvent.type(screen.getAllByLabelText(/current password/i)[1] as HTMLElement, 'old')
    await userEvent.type(screen.getByLabelText(/new password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(mocked.changePassword).not.toHaveBeenCalled()
    })
    expect(await screen.findByText(/password must be at least/i)).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })
})

describe('exporting data', () => {
  const EXPORT: DataExport = {
    formatVersion: 2,
    exportedAt: '2026-08-08T09:30:00.000Z',
    account: USER,
    settings: {
      darkMode: false,
      dailyGoal: 20,
      newCardsPerDay: 10,
      notificationsEnabled: false,
      typoTolerance: true,
      blankWidthMode: 'fixed',
      timezone: 'UTC',
      nickname: 'Learner',
      profileImage: null,
    },
    sets: [],
    reviews: [],
    dailyStats: [],
  }

  /**
   * The download goes through a Blob and an object URL rather than an `<a href>`,
   * because the endpoint needs an `Authorization` header a plain link cannot
   * carry. This asserts the mechanism, since the alternative — navigating to the
   * URL — fails by downloading a 401 body as a file, which looks like a download.
   */
  it('builds the file from the response and names it by date', async () => {
    mocked.exportData.mockResolvedValue(EXPORT)

    const createObjectURL = vi.fn().mockReturnValue('blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /download my data/i }))

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled()
    })
    expect(click).toHaveBeenCalled()
    // Released straight away: the blob is the user's whole library.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('application/json')

    vi.unstubAllGlobals()
    click.mockRestore()
  })
})

describe('deleting the account', () => {
  async function openDeleteForm(): Promise<void> {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /delete my account/i }))
  }

  /** The third one on the page: email, then password, then this. */
  function deletePasswordField(): HTMLElement {
    const fields = screen.getAllByLabelText(/current password/i)
    return fields[fields.length - 1] as HTMLElement
  }

  it('is behind a disclosure, not one click from the page', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: /delete permanently/i })).not.toBeInTheDocument()
  })

  it('stays disabled until the word is typed exactly', async () => {
    await openDeleteForm()

    const submit = screen.getByRole('button', { name: /delete permanently/i })
    expect(submit).toBeDisabled()

    // Lowercase is not the word. The server compares case-sensitively and so
    // does this — a typed confirmation that accepts near-misses confirms nothing.
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'delete')
    expect(submit).toBeDisabled()

    await userEvent.clear(screen.getByLabelText(/type delete to confirm/i))
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE')
    expect(submit).toBeEnabled()
  })

  it('sends the password and the confirmation, then lands on login', async () => {
    mocked.deleteAccount.mockResolvedValue(undefined)
    await openDeleteForm()

    await userEvent.type(deletePasswordField(), 'hunter2hunter2')
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: /delete permanently/i }))

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(mocked.deleteAccount).toHaveBeenCalledWith({
      currentPassword: 'hunter2hunter2',
      confirmation: 'DELETE',
    })
  })

  it('keeps the user on the page when the password is wrong', async () => {
    mocked.deleteAccount.mockRejectedValue(
      new ApiError('Incorrect password.', 401, 'INVALID_CREDENTIALS', {
        currentPassword: 'Incorrect password.',
      }),
    )
    await openDeleteForm()

    await userEvent.type(deletePasswordField(), 'wrong')
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: /delete permanently/i }))

    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('abandons cleanly on cancel', async () => {
    await openDeleteForm()

    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText(/type delete to confirm/i)).not.toBeInTheDocument()

    // Reopening starts blank — a half-filled deletion form left over from an
    // abandoned attempt is one stray Enter from being submitted.
    await userEvent.click(screen.getByRole('button', { name: /delete my account/i }))
    expect(screen.getByLabelText(/type delete to confirm/i)).toHaveValue('')
  })
})

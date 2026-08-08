import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { SettingsResponse, UserSettings } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/account'
import { useAuthStore } from '@/stores/auth'
import { SettingsPage } from './SettingsPage'

/**
 * The settings page.
 *
 * What is worth asserting here is not "the inputs render" but the three places
 * this screen can lie to the user:
 *
 * - **A toggle that moves and then silently fails.** Saves are optimistic, so a
 *   rejected request has to put the switch back — otherwise the UI shows a
 *   preference the server never stored.
 * - **The theme toggle and the `darkMode` setting are one thing.** They were
 *   built separately (client-only `useTheme`, then a server column), and a user
 *   who flips one and finds the other unchanged is looking at a bug.
 * - **Bounds are enforced before the request.** The server rejects a daily goal
 *   of 0; the form should say so without a round trip that comes back as a
 *   generic error.
 */

vi.mock('@/services/account')

const mocked = vi.mocked(api)

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    darkMode: false,
    dailyGoal: 20,
    newCardsPerDay: 10,
    typoTolerance: true,
    blankWidthMode: 'fixed',
    timezone: 'UTC',
    notificationsEnabled: false,
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
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  useAuthStore.setState({ status: 'anonymous', user: null, settings: null })

  mocked.getSettings.mockResolvedValue({ settings: settings() } satisfies SettingsResponse)
  mocked.updateSettings.mockImplementation((patch) =>
    Promise.resolve({ settings: { ...settings(), ...patch } } satisfies SettingsResponse),
  )
})

describe('SettingsPage', () => {
  it('shows the stored values, not the defaults', async () => {
    mocked.getSettings.mockResolvedValue({
      settings: settings({ dailyGoal: 45, typoTolerance: false, timezone: 'Asia/Manila' }),
    })

    render(renderPage())

    expect(await screen.findByLabelText(/daily goal/i)).toHaveValue(45)
    expect(screen.getByRole('switch', { name: /typo tolerance/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByLabelText(/time zone/i)).toHaveValue('Asia/Manila')
  })

  it('saves a toggle without asking for a password', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await user.click(await screen.findByRole('switch', { name: /typo tolerance/i }))

    await waitFor(() => {
      expect(mocked.updateSettings).toHaveBeenCalledWith({ typoTolerance: false })
    })
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  /**
   * The optimistic-rollback case. Without it the switch keeps the position the
   * user dragged it to and the server keeps the old value — the two disagree, and
   * only one of them is real.
   */
  it('puts a toggle back when the save fails', async () => {
    const user = userEvent.setup()
    mocked.updateSettings.mockRejectedValue(new Error('offline'))

    render(renderPage())
    const toggle = await screen.findByRole('switch', { name: /typo tolerance/i })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /typo tolerance/i })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })
  })

  it('applies dark mode to the document as well as the server', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await user.click(await screen.findByRole('switch', { name: /dark mode/i }))

    await waitFor(() => {
      expect(mocked.updateSettings).toHaveBeenCalledWith({ darkMode: true })
    })
    expect(document.documentElement).toHaveClass('dark')
  })

  it('rejects a daily goal outside the allowed range before sending it', async () => {
    const user = userEvent.setup()
    render(renderPage())

    const input = await screen.findByLabelText(/daily goal/i)
    await user.clear(input)
    await user.type(input, '0')
    await user.tab()

    expect(await screen.findByText(/between 1 and 500/i)).toBeInTheDocument()
    expect(mocked.updateSettings).not.toHaveBeenCalled()
  })

  it('saves a valid daily goal on blur', async () => {
    const user = userEvent.setup()
    render(renderPage())

    const input = await screen.findByLabelText(/daily goal/i)
    await user.clear(input)
    await user.type(input, '35')
    await user.tab()

    await waitFor(() => {
      expect(mocked.updateSettings).toHaveBeenCalledWith({ dailyGoal: 35 })
    })
  })

  it('does not save when the value has not changed', async () => {
    const user = userEvent.setup()
    render(renderPage())

    const input = await screen.findByLabelText(/daily goal/i)
    await user.click(input)
    await user.tab()

    expect(mocked.updateSettings).not.toHaveBeenCalled()
  })
})

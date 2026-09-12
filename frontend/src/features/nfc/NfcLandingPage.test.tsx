import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { NfcLandingPage } from './NfcLandingPage'

function renderNfcPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <NfcLandingPage />
    </MemoryRouter>,
  )
}

describe('NfcLandingPage', () => {
  const originalUserAgent = navigator.userAgent

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('renders heading, brand, and key offline features', () => {
    renderNfcPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Get the Saulado App/i)
    expect(screen.getByText('NFC Scanned')).toBeInTheDocument()
    expect(screen.getByText(/100% Offline Study/i)).toBeInTheDocument()
    expect(screen.getByText(/PDF Visual Highlighting/i)).toBeInTheDocument()
  })

  it('renders Android flow with countdown and 3-step guide on Android user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      configurable: true,
    })

    renderNfcPage()

    expect(screen.getByText(/Download APK Manually/i)).toBeInTheDocument()
    expect(screen.getByText(/Open App if Installed/i)).toBeInTheDocument()
    expect(screen.getByText(/3-Step Installation Guide \(Android\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Download anyway/i)).toBeInTheDocument()
  })

  it('renders iOS web app flow on iPhone user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      configurable: true,
    })

    renderNfcPage()

    expect(screen.getByText(/iOS Web App Ready/i)).toBeInTheDocument()
    expect(screen.getByText(/Launch Web App/i)).toBeInTheDocument()
    expect(screen.getByText(/Add to your iPhone Home Screen/i)).toBeInTheDocument()
  })
})

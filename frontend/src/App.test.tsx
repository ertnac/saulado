import { render, screen, waitFor } from '@testing-library/react'
import type { HealthResponse } from '@saulado/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

function mockHealth(overrides: Partial<HealthResponse> = {}): void {
  const body: HealthResponse = {
    status: 'ok',
    database: 'connected',
    databaseLatencyMs: 3.2,
    uptimeSeconds: 12.5,
    timestamp: new Date().toISOString(),
    version: '0.0.0',
    ...overrides,
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the connected state from the API', async () => {
    mockHealth()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Saulado', level: 1 })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Database connected')).toBeInTheDocument()
    })
    expect(screen.getByText('3.2 ms')).toBeInTheDocument()
  })

  it('explains how to recover when Postgres is unreachable', async () => {
    mockHealth({ status: 'degraded', database: 'disconnected', databaseLatencyMs: null })
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Database unreachable')).toBeInTheDocument()
    })
    // Degraded is a reportable state with a next action, not a dead end.
    expect(screen.getByText(/pnpm db:up/)).toBeInTheDocument()
  })

  it('surfaces a reachable error state when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Cannot reach the API')).toBeInTheDocument()
    })
  })
})

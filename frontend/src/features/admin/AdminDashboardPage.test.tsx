import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { AdminOverviewResponse, AdminUsersResponse } from '@saulado/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/admin'
import { AdminDashboardPage } from './AdminDashboardPage'

vi.mock('@/services/admin')
const mockedApi = vi.mocked(api)

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const mockOverview: AdminOverviewResponse = {
  metrics: {
    totalUsers: 142,
    newUsersToday: 5,
    newUsersThisWeek: 28,
    activeUsers24h: 34,
    activeUsers7d: 89,
    activeUsers30d: 120,
    totalSets: 210,
    totalCards: 1850,
    totalReviews: 9420,
  },
  signupTrend: [
    { date: '2026-08-05', count: 2 },
    { date: '2026-08-06', count: 4 },
    { date: '2026-08-07', count: 5 },
  ],
}

const mockUsers: AdminUsersResponse = {
  users: [
    {
      id: 'u-1',
      email: 'admin@example.com',
      nickname: 'Admin User',
      profileImage: null,
      createdAt: '2026-08-01T12:00:00Z',
      emailVerifiedAt: '2026-08-01T12:05:00Z',
      authProvider: 'google',
      setCount: 8,
      cardCount: 64,
      reviewCount: 320,
      lastActiveAt: '2026-08-18T07:00:00Z',
    },
    {
      id: 'u-2',
      email: 'student@example.com',
      nickname: 'Alex',
      profileImage: null,
      createdAt: '2026-08-10T15:00:00Z',
      emailVerifiedAt: null,
      authProvider: 'password',
      setCount: 2,
      cardCount: 15,
      reviewCount: 45,
      lastActiveAt: null,
    },
  ],
  total: 2,
  page: 1,
  limit: 15,
  totalPages: 1,
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedApi.getAdminOverview.mockResolvedValue(mockOverview)
    mockedApi.getAdminUsers.mockResolvedValue(mockUsers)
  })

  it('renders overview metrics and user directory correctly', async () => {
    renderWithClient(<AdminDashboardPage />)

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()

    // Overview metric cards
    expect(await screen.findByText('142')).toBeInTheDocument() // Total Users
    expect(await screen.findByText('34')).toBeInTheDocument() // Active 24h
    expect(await screen.findByText('1,850')).toBeInTheDocument() // Total Cards
    expect(await screen.findByText('9,420')).toBeInTheDocument() // Total Reviews

    // User table rows
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument()
    expect(await screen.findByText('Admin User')).toBeInTheDocument()
    expect(await screen.findByText('student@example.com')).toBeInTheDocument()
    expect(await screen.findByText('Alex')).toBeInTheDocument()
  })

  it('shows empty state when no users are found', async () => {
    mockedApi.getAdminUsers.mockResolvedValue({
      users: [],
      total: 0,
      page: 1,
      limit: 15,
      totalPages: 0,
    })

    renderWithClient(<AdminDashboardPage />)

    expect(await screen.findByText('No users match your criteria.')).toBeInTheDocument()
  })
})

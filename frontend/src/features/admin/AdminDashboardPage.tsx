import { useState, type ReactElement } from 'react'
import type { AdminUserFilter, AdminUserSort } from '@saulado/shared'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  UsersIcon,
} from '@/components/ui/icons'
import { Avatar } from '@/components/ui/brand'
import { useAdminOverview, useAdminUsers } from './queries'

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHours = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 30) return `${diffDays}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return 'Unknown'
  }
}

export function AdminDashboardPage(): ReactElement {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AdminUserFilter>('all')
  const [sort, setSort] = useState<AdminUserSort>('newest')
  const [page, setPage] = useState(1)
  const limit = 15

  const overview = useAdminOverview()
  const usersQuery = useAdminUsers({
    page,
    limit,
    search: search.trim() || undefined,
    filter,
    sort,
  })

  const metrics = overview.data?.metrics
  const maxTrendCount = Math.max(...(overview.data?.signupTrend.map((t) => t.count) ?? [1]), 1)

  const handleSearchChange = (val: string): void => {
    setSearch(val)
    setPage(1)
  }

  const handleFilterChange = (f: AdminUserFilter): void => {
    setFilter(f)
    setPage(1)
  }

  const handleSortChange = (s: AdminUserSort): void => {
    setSort(s)
    setPage(1)
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldIcon />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Admin Dashboard
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform metrics, active engagement statistics, and user directory.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void overview.refetch()
              void usersQuery.refetch()
            }}
            disabled={overview.isFetching || usersQuery.isFetching}
          >
            {overview.isFetching || usersQuery.isFetching ? 'Refreshing…' : 'Refresh data'}
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total Users</span>
            <span className="text-muted-foreground">
              <UsersIcon />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {metrics ? metrics.totalUsers.toLocaleString() : '—'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge tone="accent">+{metrics?.newUsersToday ?? 0} today</Badge>
            <span>+{metrics?.newUsersThisWeek ?? 0} this week</span>
          </div>
        </Card>

        {/* Active Users */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Active (24 Hours)</span>
            <span className="text-accent">
              <SparkIcon />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {metrics ? metrics.activeUsers24h.toLocaleString() : '—'}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <strong className="font-semibold text-foreground">
                {metrics?.activeUsers7d ?? 0}
              </strong>{' '}
              in 7d
            </span>
            <span>·</span>
            <span>
              <strong className="font-semibold text-foreground">
                {metrics?.activeUsers30d ?? 0}
              </strong>{' '}
              in 30d
            </span>
          </div>
        </Card>

        {/* Content Created */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total Flashcards</span>
            <span className="text-muted-foreground">
              <LayersIcon />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {metrics ? metrics.totalCards.toLocaleString() : '—'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Across{' '}
            <strong className="font-semibold text-foreground">{metrics?.totalSets ?? 0}</strong>{' '}
            study sets
          </p>
        </Card>

        {/* Total Reviews */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Study Reviews</span>
            <span className="text-muted-foreground">
              <CheckIcon />
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {metrics ? metrics.totalReviews.toLocaleString() : '—'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Total spaced-repetition recalls</p>
        </Card>
      </div>

      {/* 14-Day Growth Visualizer */}
      {overview.data && overview.data.signupTrend.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">14-Day New User Signups</h2>
              <p className="text-xs text-muted-foreground">Recent registration velocity</p>
            </div>
            <Badge tone="muted">Last 14 Days</Badge>
          </div>

          <div className="mt-6 flex h-28 items-end gap-1.5 sm:gap-3">
            {overview.data.signupTrend.map((pt) => {
              const heightPercent = Math.max((pt.count / maxTrendCount) * 100, 6)
              return (
                <div key={pt.date} className="group relative flex flex-1 flex-col items-center">
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] font-medium text-background opacity-0 shadow transition-opacity group-hover:block group-hover:opacity-100">
                    {pt.date}: {pt.count} {pt.count === 1 ? 'user' : 'users'}
                  </div>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t transition-all ${
                      pt.count > 0 ? 'bg-primary hover:bg-primary/80' : 'bg-surface-muted'
                    }`}
                  />
                  <span className="mt-1.5 text-[10px] text-muted-foreground">
                    {pt.date.slice(8, 10)}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Users Directory */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">User Directory</h2>
            <p className="text-xs text-muted-foreground">
              {usersQuery.data
                ? `${usersQuery.data.total} registered users found`
                : 'Loading users…'}
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="Search email or nickname…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Pills & Sort Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Users' },
                { id: 'active', label: 'Active (7d)' },
                { id: 'verified', label: 'Email Verified' },
                { id: 'google', label: 'Google OAuth' },
                { id: 'password', label: 'Password' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(tab.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sort:</span>
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as AdminUserSort)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground focus:outline-none"
            >
              <option value="newest">Newest registered</option>
              <option value="oldest">Oldest registered</option>
              <option value="most_active">Most reviews</option>
              <option value="most_cards">Most cards</option>
            </select>
          </div>
        </div>

        {/* Table View */}
        <Card className="overflow-hidden">
          {usersQuery.isError ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <span className="text-warning">
                <AlertIcon />
              </span>
              <p className="mt-2 text-sm font-medium text-foreground">Could not load users</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {usersQuery.error instanceof Error
                  ? usersQuery.error.message
                  : 'Please check your connection.'}
              </p>
            </div>
          ) : usersQuery.data?.users.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No users match your criteria.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-muted/50 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Auth / Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3 text-center">Decks</th>
                    <th className="px-4 py-3 text-center">Cards</th>
                    <th className="px-4 py-3 text-center">Reviews</th>
                    <th className="px-4 py-3 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usersQuery.data?.users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-surface-muted/30">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar label={u.nickname || u.email} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {u.nickname || u.email.split('@')[0]}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={u.authProvider === 'google' ? 'sand' : 'muted'}>
                            {u.authProvider === 'google'
                              ? 'Google'
                              : u.authProvider === 'both'
                                ? 'Google + Pass'
                                : 'Password'}
                          </Badge>
                          {u.emailVerifiedAt ? (
                            <span className="text-[11px] text-success">Verified</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Unverified</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </td>

                      <td className="px-4 py-3.5 text-center font-medium tabular-nums text-foreground">
                        {u.setCount}
                      </td>

                      <td className="px-4 py-3.5 text-center font-medium tabular-nums text-foreground">
                        {u.cardCount}
                      </td>

                      <td className="px-4 py-3.5 text-center font-medium tabular-nums text-foreground">
                        {u.reviewCount}
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-muted-foreground">
                        {formatRelativeTime(u.lastActiveAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {usersQuery.data && usersQuery.data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Page {usersQuery.data.page} of {usersQuery.data.totalPages} ({usersQuery.data.total}{' '}
                total)
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= usersQuery.data.totalPages}
                  onClick={() => setPage((p) => Math.min(usersQuery.data.totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

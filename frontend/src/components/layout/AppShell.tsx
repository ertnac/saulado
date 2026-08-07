import type { ReactElement } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const NAV = [{ to: '/', label: 'Dashboard' }]

function ThemeToggle(): ReactElement {
  const { theme, setTheme, isDark } = useTheme()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        // Two-step cycle from whatever is currently showing. A three-way
        // light/dark/system rotation through a single button leaves the user
        // guessing which of three states they are in.
        setTheme(isDark ? 'light' : 'dark')
      }}
      // The label says what the button will do, not what the state is — a
      // screen-reader user cannot see the icon to infer the difference.
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'system' ? 'Following your system theme' : undefined}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </Button>
  )
}

export function AppShell(): ReactElement {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="flex min-h-screen flex-col">
      {/*
        Skip link (saulado-ux §6). First focusable element in the document, and
        visible only once focused — a keyboard user should not have to tab
        through the whole nav on every page.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-primary"
      >
        Skip to content
      </a>

      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link to="/" className="font-semibold tracking-tight">
            Saulado
          </Link>

          <nav aria-label="Main" className="flex flex-1 items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                // `end` so "/" is not marked active on every nested route.
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium',
                    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <ThemeToggle />

          {/* Hidden below sm to keep the 320px layout from wrapping. */}
          <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void logout()
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

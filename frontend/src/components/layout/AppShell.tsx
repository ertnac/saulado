import { useEffect, useState, type ReactElement } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { CommandPalette } from '@/features/search/CommandPalette'
import { useSearchShortcut } from '@/features/search/useSearchShortcut'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

/**
 * `end` is per item, not global.
 *
 * "/" needs it or it matches every route in the app. "/sets" must not have it, or
 * the tab the user is standing in stops being highlighted the moment they open a
 * set — the nav would claim they are nowhere.
 */
const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sets', label: 'Sets', end: false },
  { to: '/progress', label: 'Progress', end: false },
]

/**
 * The palette trigger, showing the shortcut it stands in for.
 *
 * A discoverability affordance, not a duplicate control: Cmd/Ctrl+K is
 * invisible to anyone who has not been told about it, and a search box that only
 * exists as a keystroke is a search box most users never find. Rendering the hint
 * with the right modifier needs the platform, which is only knowable at runtime.
 */
function SearchTrigger({ onOpen }: { onOpen: () => void }): ReactElement {
  const [isMac, setIsMac] = useState(false)

  // In an effect rather than at render: `navigator` does not exist during SSR or
  // in a test renderer that has not set up jsdom yet, and reading it at module
  // scope would make this component impossible to import in either.
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent))
  }, [])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onOpen}
      aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      aria-label="Search cards"
      className="gap-2 text-muted-foreground"
    >
      <span aria-hidden="true">⌕</span>
      <span className="hidden sm:inline">Search</span>
      <kbd
        className="hidden rounded border border-border px-1 text-xs md:inline"
        aria-hidden="true"
      >
        {isMac ? '⌘' : 'Ctrl'}K
      </kbd>
    </Button>
  )
}

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
  const palette = useSearchShortcut()

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
                end={item.end}
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

          <SearchTrigger onOpen={palette.onOpen} />

          <ThemeToggle />

          {/*
            The account link carries the email rather than sitting next to it —
            one control instead of a label plus a link, which is also what makes
            it reachable at 320px where the bare email was hidden entirely.
          */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'max-w-[10rem] truncate rounded-md px-3 py-2 text-sm',
                isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted',
              )
            }
          >
            <span className="hidden sm:inline">{user?.email ?? 'Settings'}</span>
            <span className="sm:hidden" aria-hidden="true">
              ⚙
            </span>
            <span className="sr-only sm:hidden">Settings</span>
          </NavLink>

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

      <CommandPalette open={palette.open} onClose={palette.onClose} />
    </div>
  )
}

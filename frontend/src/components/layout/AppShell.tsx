import { useEffect, useState, type ComponentType, type ReactElement } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import {
  ChartIcon,
  HomeIcon,
  LayersIcon,
  LogoutIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  type IconProps,
} from '@/components/ui/icons'
import { Avatar, Logo } from '@/components/ui/brand'
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
const NAV: { to: string; label: string; end: boolean; icon: ComponentType<IconProps> }[] = [
  { to: '/', label: 'Dashboard', end: true, icon: HomeIcon },
  { to: '/sets', label: 'Sets', end: false, icon: LayersIcon },
  { to: '/progress', label: 'Progress', end: false, icon: ChartIcon },
]

/**
 * One nav element, laid out two ways.
 *
 * A bottom bar on phones and a left rail on desktop, from the same markup —
 * rendering two navs and hiding one with CSS would put every destination in the
 * accessibility tree twice, and a screen reader does not read `display: none`
 * out of a stylesheet that failed to load.
 */
function MainNav(): ReactElement {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1 border-t border-border',
        'bg-surface/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md',
        'md:inset-x-auto md:inset-y-0 md:left-0 md:w-20 md:flex-col md:justify-start',
        'md:gap-2 md:border-r md:border-t-0 md:px-0 md:pt-6',
      )}
    >
      {NAV.map((item) => {
        const ItemIcon = item.icon
        return (
          <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className="group">
            {({ isActive }) => (
              <span className="flex w-16 flex-col items-center gap-1 py-1.5 md:w-20 md:py-0">
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full text-xl',
                    'transition-[background-color,color,box-shadow] duration-150',
                    isActive
                      ? // A filled disc, not just a tint: the active item has to
                        // survive being read in greyscale.
                        'bg-primary text-primary-foreground shadow-soft'
                      : 'text-muted-foreground group-hover:bg-surface-muted group-hover:text-foreground',
                  )}
                >
                  <ItemIcon />
                </span>
                {/* Visible on phones, name-only on desktop where the rail is icons. */}
                <span
                  className={cn(
                    'text-[11px] font-medium md:sr-only',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

/**
 * The palette trigger, showing the shortcut it stands in for.
 *
 * A discoverability affordance, not a duplicate control: Cmd/Ctrl+K is
 * invisible to anyone who has not been told about it, and a search box that only
 * exists as a keystroke is a search box most users never find. Rendering the hint
 * with the right modifier needs the platform, which is only knowable at runtime.
 *
 * Shaped like the field it opens rather than like a button — but still a
 * `<button>`, because it opens a dialog and does not accept typing in place.
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
    <button
      type="button"
      onClick={onOpen}
      aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      aria-label="Search cards"
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border',
        'bg-surface text-muted-foreground transition-colors duration-150 hover:text-foreground',
        'sm:w-full sm:max-w-sm sm:justify-start sm:px-4',
      )}
    >
      <SearchIcon />
      <span className="hidden flex-1 text-left text-sm sm:inline">Search cards</span>
      <kbd
        className="hidden rounded-full bg-surface-muted px-2 py-0.5 text-[11px] md:inline"
        aria-hidden="true"
      >
        {isMac ? '⌘' : 'Ctrl'}K
      </kbd>
    </button>
  )
}

function ThemeToggle(): ReactElement {
  const { theme, setTheme, isDark } = useTheme()

  return (
    <IconButton
      onClick={() => {
        // Two-step cycle from whatever is currently showing. A three-way
        // light/dark/system rotation through a single button leaves the user
        // guessing which of three states they are in.
        setTheme(isDark ? 'light' : 'dark')
      }}
      // The label says what the button will do, not what the state is — a
      // screen-reader user cannot see the icon to infer the difference.
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      icon={isDark ? <SunIcon /> : <MoonIcon />}
      title={theme === 'system' ? 'Following your system theme' : undefined}
    />
  )
}

export function AppShell(): ReactElement {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const palette = useSearchShortcut()

  return (
    <div className="min-h-screen md:pl-20">
      {/*
        Skip link (saulado-ux §6). First focusable element in the document, and
        visible only once focused — a keyboard user should not have to tab
        through the whole nav on every page.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>

      <MainNav />

      <header className="sticky top-0 z-30 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:gap-3">
          <Link
            to="/"
            aria-label="Saulado — go to dashboard"
            className="shrink-0 rounded-full transition-opacity duration-150 hover:opacity-80"
          >
            {/* Wordmark hidden below `sm`, where the mark alone has to carry the
                brand and the row needs the width for search. */}
            <Logo className="[&>span]:hidden sm:[&>span]:inline" withWordmark />
          </Link>

          <div className="flex flex-1 justify-end sm:justify-center">
            <SearchTrigger onOpen={palette.onOpen} />
          </div>

          <ThemeToggle />

          {/*
            The account link carries the email rather than sitting next to it —
            one control instead of a label plus a link, which is also what makes
            it reachable at 320px where the bare email was hidden entirely.
          */}
          <NavLink
            to="/settings"
            title="Settings"
            className={({ isActive }) =>
              cn(
                'flex h-11 items-center gap-2 rounded-full pl-1 pr-1 text-sm lg:pr-3',
                'transition-colors duration-150',
                isActive ? 'bg-surface-muted text-foreground' : 'hover:bg-surface-muted',
              )
            }
          >
            <Avatar label={user?.email ?? 'Your account'} />
            <span className="hidden max-w-[12rem] truncate lg:inline">{user?.email}</span>
            <span className="sr-only">Settings</span>
          </NavLink>

          <Button
            variant="ghost"
            aria-label="Sign out"
            className="h-11 w-11 p-0 sm:w-auto sm:px-4"
            onClick={() => {
              void logout()
            }}
          >
            <LogoutIcon />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Bottom padding clears the mobile nav bar, which is fixed over the page. */}
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:pb-16 md:pt-6">
        <Outlet />
      </main>

      <CommandPalette open={palette.open} onClose={palette.onClose} />
    </div>
  )
}

import { useEffect, useState, type ComponentType, type ReactElement } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import {
  CoinIcon,
  FlameIcon,
  FolderIcon,
  HomeIcon,
  LayersIcon,
  LogoutIcon,
  MoonIcon,
  SearchIcon,
  ShieldIcon,
  ShoppingBagIcon,
  SunIcon,
  UserIcon,
  type IconProps,
} from '@/components/ui/icons'
import { Avatar, Logo } from '@/components/ui/brand'
import { CommandPalette } from '@/features/search/CommandPalette'
import { useSearchShortcut } from '@/features/search/useSearchShortcut'
import { useAdminCheck } from '@/features/admin/queries'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useSnippetBagStore } from '@/stores/snippet-bag'
import { useDashboard } from '@/features/dashboard/queries'
import { SnippetBagModal } from '@/features/files/SnippetBagModal'
import { DUR, EASE, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

const NAV: { to: string; label: string; end: boolean; icon: ComponentType<IconProps> }[] = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon },
  { to: '/sets', label: 'Study Sets', end: false, icon: LayersIcon },
  { to: '/files', label: 'Files', end: false, icon: FolderIcon },
  { to: '/settings', label: 'Account', end: false, icon: UserIcon },
]

/**
 * Main navigation displaying the primary tabs: Home, Study Sets, Files, and Account.
 * Displayed in a secondary navigation bar directly below the main navigation bar.
 */
function MainNav(): ReactElement {
  return (
    <nav
      aria-label="Main navigation"
      className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none h-full"
    >
      {NAV.map((item) => {
        const ItemIcon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2 px-3.5 h-full text-xs sm:text-sm font-medium transition-colors duration-150',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <ItemIcon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span className="whitespace-nowrap">{item.label}</span>

                {/* Active indicator bar on sub-navbar */}
                {isActive && (
                  <motion.span
                    layoutId="sub-nav-indicator"
                    aria-hidden="true"
                    className="absolute bottom-0 inset-x-2 h-[2px] rounded-full bg-primary"
                    transition={SPRING}
                  />
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function SearchTrigger({ onOpen }: { onOpen: () => void }): ReactElement {
  const [isMac, setIsMac] = useState(false)

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
        'flex h-10 w-10 shrink-0 items-center justify-center gap-2.5 rounded-full border border-border/80 bg-surface/80',
        'text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-foreground hover:bg-surface',
        'sm:w-64 md:w-72 sm:justify-start sm:px-3.5 shadow-xs',
      )}
    >
      <SearchIcon className="text-muted-foreground" />
      <span className="hidden flex-1 text-left text-xs sm:inline">Search cards & decks…</span>
      <kbd
        className="hidden rounded-md border border-border/60 bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline"
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
        setTheme(isDark ? 'light' : 'dark')
      }}
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      icon={isDark ? <SunIcon /> : <MoonIcon />}
      title={theme === 'system' ? 'Following your system theme' : undefined}
    />
  )
}

export function AppShell(): ReactElement {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const palette = useSearchShortcut()
  const location = useLocation()
  const { data: adminCheck } = useAdminCheck()
  const { data: dashboardData } = useDashboard()

  const bagSnippets = useSnippetBagStore((s) => s.snippets)
  const [snippetBagOpen, setSnippetBagOpen] = useState(false)

  const points =
    (dashboardData?.today?.reviews ?? 0) * 10 + (dashboardData?.streak?.current ?? 0) * 20 + 50
  const streakDays = dashboardData?.streak?.current ?? 0

  const isFileViewer = location.pathname.startsWith('/files/') && location.pathname !== '/files'

  return (
    <div
      className={cn(
        'bg-background text-foreground flex flex-col font-sans',
        isFileViewer ? 'h-screen overflow-hidden' : 'min-h-screen',
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>

      {/* Top Header Navigation Bar */}
      <header
        className={cn(
          'z-30 border-b border-border/60 bg-surface/85 backdrop-blur-md shrink-0',
          !isFileViewer && 'sticky top-0',
        )}
      >
        {/* Main Navigation Bar */}
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: Brand Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/"
              aria-label="Saulado — go to dashboard"
              className="flex items-center gap-2 rounded-full transition-opacity duration-150 hover:opacity-85"
            >
              <Logo className="[&>span]:hidden sm:[&>span]:inline" withWordmark />
            </Link>
          </div>

          {/* Center: Search */}
          <div className="flex items-center justify-center flex-1 max-w-md mx-2">
            <SearchTrigger onOpen={palette.onOpen} />
          </div>

          {/* Right: Gamification Badges, User Profile, Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Gamification Strip (Coins / Streak) */}
            <div className="hidden sm:flex items-center gap-2">
              <div
                title="Your study points"
                className="flex items-center gap-1.5 rounded-full border border-sand-foreground/20 bg-sand/40 px-2.5 py-1 text-xs font-semibold text-sand-foreground shadow-xs"
              >
                <CoinIcon className="text-amber-500" />
                <span>{points} Pt</span>
              </div>

              <div
                title={`${streakDays} day study streak`}
                className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-strong shadow-xs"
              >
                <FlameIcon className="text-accent" />
                <span>{streakDays}d</span>
              </div>
            </div>

            {/* Admin Dashboard shortcut when privileged */}
            {adminCheck?.isAdmin && (
              <NavLink
                to="/admin"
                title="Admin Dashboard"
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors duration-150',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-muted text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <ShieldIcon />
                <span className="hidden lg:inline">Admin</span>
              </NavLink>
            )}

            {/* Study Bag Trigger */}
            <button
              type="button"
              onClick={() => setSnippetBagOpen(true)}
              title={
                bagSnippets.length > 0
                  ? `Study Bag (${bagSnippets.length} ${bagSnippets.length === 1 ? 'note' : 'notes'})`
                  : 'Study Bag (empty)'
              }
              aria-label="Open study bag"
              className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-surface/80 text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface shadow-xs active:scale-95',
                bagSnippets.length > 0 && 'text-primary border-primary/40 bg-primary/10',
              )}
            >
              <ShoppingBagIcon className="h-4 w-4" />
              {bagSnippets.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-xs">
                  {bagSnippets.length > 99 ? '99+' : bagSnippets.length}
                </span>
              )}
            </button>

            <ThemeToggle />

            {/* User Profile */}
            <NavLink
              to="/settings"
              title="Settings & Profile"
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-2 rounded-full p-1 text-xs transition-colors duration-150',
                  isActive ? 'bg-surface-muted ring-2 ring-primary/30' : 'hover:bg-surface-muted',
                )
              }
            >
              <Avatar label={user?.email ?? 'Your account'} />
              <span className="hidden max-w-[8rem] truncate font-medium lg:inline">
                {user?.email}
              </span>
            </NavLink>

            <Button
              variant="ghost"
              aria-label="Sign out"
              size="sm"
              className="h-9 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                void logout().then(() => {
                  void navigate('/welcome?auth=login', { replace: true })
                })
              }}
            >
              <LogoutIcon />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>

        {/* Secondary Navigation Bar (Sub-navbar) */}
        <div className="border-t border-border/50 bg-surface/50">
          <div className="mx-auto flex h-11 max-w-7xl items-center px-4 sm:px-6">
            <MainNav />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        id="main"
        className={cn(
          'w-full flex-1 transition-all',
          isFileViewer
            ? 'px-2 sm:px-3 py-1 pb-1 max-w-none overflow-hidden flex flex-col min-h-0'
            : 'mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 pb-12',
        )}
      >
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.page, ease: EASE }}
          className={
            isFileViewer ? 'w-full h-full flex flex-col min-h-0 overflow-hidden' : undefined
          }
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Global Modals */}
      <CommandPalette open={palette.open} onClose={palette.onClose} />
      <SnippetBagModal open={snippetBagOpen} onClose={() => setSnippetBagOpen(false)} />
    </div>
  )
}

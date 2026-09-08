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
  SparklesIcon,
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
import { useDashboard } from '@/features/dashboard/queries'
import { QuickLearnDialog } from '@/features/study/QuickLearnDialog'
import { DUR, EASE, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

const NAV: { to: string; label: string; end: boolean; icon: ComponentType<IconProps> }[] = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon },
  { to: '/sets', label: 'Study Sets', end: false, icon: LayersIcon },
  { to: '/files', label: 'Files', end: false, icon: FolderIcon },
  { to: '/settings', label: 'Account', end: false, icon: UserIcon },
]

/**
 * Main navigation matching the horizontal tab navigation from modern learning platforms.
 * Displays as an integrated top tab bar on desktop and a bottom bar on mobile.
 */
function MainNav(): ReactElement {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1 border-t border-border',
        'bg-surface/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md',
        'md:static md:z-auto md:flex md:items-center md:gap-1 md:border-none md:bg-transparent md:p-0',
      )}
    >
      {NAV.map((item) => {
        const ItemIcon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className="group relative"
          >
            {({ isActive }) => (
              <span
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 transition-colors duration-150',
                  'flex-col md:flex-row',
                  isActive
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground font-medium',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-xl text-lg md:hidden',
                    isActive && 'text-primary',
                  )}
                >
                  <ItemIcon />
                </span>

                <span className="text-xs md:text-sm">{item.label}</span>

                {/* Active indicator bar on desktop */}
                {isActive && (
                  <motion.span
                    layoutId="top-nav-indicator"
                    aria-hidden="true"
                    className="absolute -bottom-1 inset-x-2 hidden h-[2px] rounded-full bg-primary md:block"
                    transition={SPRING}
                  />
                )}
              </span>
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

  const [quickLearnOpen, setQuickLearnOpen] = useState(false)

  const points =
    (dashboardData?.today?.reviews ?? 0) * 10 + (dashboardData?.streak?.current ?? 0) * 20 + 50
  const streakDays = dashboardData?.streak?.current ?? 0

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>

      {/* Top Header Navigation Bar (Trenning Inspo) */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* Left: Brand Logo & Ask AI */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/"
              aria-label="Saulado — go to dashboard"
              className="flex items-center gap-2 rounded-full transition-opacity duration-150 hover:opacity-85"
            >
              <Logo className="[&>span]:hidden sm:[&>span]:inline" withWordmark />
            </Link>

            {/* "Ask AI" button inspired by Trenning header */}
            <button
              type="button"
              onClick={() => setQuickLearnOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-all duration-150 hover:bg-primary/20 hover:scale-[1.02] shadow-xs active:scale-95"
            >
              <SparklesIcon className="text-primary text-xs" />
              <span>Ask AI</span>
            </button>
          </div>

          {/* Center: Search & Desktop Navigation Tabs */}
          <div className="flex items-center gap-4 flex-1 justify-center max-w-xl">
            <SearchTrigger onOpen={palette.onOpen} />
            <div className="hidden md:block">
              <MainNav />
            </div>
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
      </header>

      {/* Mobile Bottom Navigation Rail */}
      <div className="md:hidden">
        <MainNav />
      </div>

      {/* Main Content Area */}
      <main
        id="main"
        className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 pb-24 md:pb-12 flex-1"
      >
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.page, ease: EASE }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Global Modals */}
      <CommandPalette open={palette.open} onClose={palette.onClose} />
      <QuickLearnDialog open={quickLearnOpen} onClose={() => setQuickLearnOpen(false)} />
    </div>
  )
}

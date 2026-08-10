import { Redirect, useUnstableGlobalHref } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import type { ReactElement } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { ChartIcon, HomeIcon, LayersIcon, type IconProps } from '../../components/icons'
import { ThemeToggle } from '../../components/theme-toggle'
import { useAuthStore } from '../../stores/auth'
import { useTokenColor } from '../../stores/theme'

/**
 * The `ProtectedRoute` guard plus the app's own chrome, ported from
 * `frontend/src/components/ProtectedRoute.tsx` and `components/layout/AppShell.tsx`.
 *
 * `Tabs` comes from `expo-router/js-tabs`: the same component re-exported from the
 * package root is deprecated in SDK 57.
 */

/**
 * Mirrors `AppShell`'s `NAV`. Order is the tab order.
 *
 * `name` is the route file relative to this layout, not the URL — `sets/index`
 * rather than `/sets`, because there is no `sets/_layout.tsx` and so both files
 * under `sets/` are screens of *this* navigator.
 */
const NAV: { name: string; title: string; icon: (p: IconProps) => ReactElement }[] = [
  { name: 'index', title: 'Dashboard', icon: HomeIcon },
  { name: 'sets/index', title: 'Sets', icon: LayersIcon },
  { name: 'progress', title: 'Progress', icon: ChartIcon },
]

/**
 * Reachable, but not from the tab bar.
 *
 * `href: null` hides the item and swallows the press rather than removing the
 * route, so `router.push('/settings')` and a deep link both still work. Without
 * an entry here every screen in the group gets a tab, and the bar becomes eight
 * items wide.
 *
 * They still carry a `title`, because the header reads it: left unset it falls
 * back to the route name and the set detail screen is captioned `sets/[setId]`.
 */
const HIDDEN: { name: string; title: string }[] = [
  { name: 'sets/[setId]', title: 'Set' },
  { name: 'study', title: 'Study' },
  { name: 'search', title: 'Search' },
  { name: 'settings', title: 'Settings' },
  { name: 'account', title: 'Account' },
]

export default function AppLayout(): ReactElement {
  const status = useAuthStore((s) => s.status)
  const href = useUnstableGlobalHref()

  const primary = useTokenColor('--primary')
  const foreground = useTokenColor('--foreground')
  const mutedForeground = useTokenColor('--muted-foreground')
  const surface = useTokenColor('--surface')
  const border = useTokenColor('--border')

  /**
   * `restoring` is its own branch and not folded into `anonymous`. Treating "we
   * have not asked yet" as "signed out" sends a user holding a valid keychain
   * token to the login form on every cold start.
   */
  if (status === 'restoring') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator
          accessibilityLabel="Restoring your session"
          color={primary}
          size="large"
        />
      </View>
    )
  }

  /**
   * `from` carries the destination through the login round-trip. Expo Router has
   * no counterpart to React Router's `state`, so it travels as a search param;
   * `useUnstableGlobalHref()` is the whole current href including its own params,
   * which is what makes a deep link to `/sets/abc` survive being interrupted by
   * the sign-in form instead of silently becoming the dashboard.
   */
  if (status === 'anonymous') {
    return <Redirect href={{ pathname: '/login', params: { from: href } }} />
  }

  return (
    <Tabs
      screenOptions={{
        /*
          The navigator's own header, rather than a ported `AppShell`. It is what
          gives the theme toggle somewhere to live on every screen behind the
          guard — which Phase 2 has to deliver — without a chrome component that
          the phases filling these screens would only rewrite. The web header's
          other controls come with the screens that own them: search with
          `/search`, the account menu with `/account`.
        */
        headerStyle: { backgroundColor: surface },
        headerTintColor: foreground,
        headerShadowVisible: false,
        headerRight: () => <ThemeToggle />,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: mutedForeground,
        tabBarStyle: { backgroundColor: surface, borderTopColor: border },
      }}
    >
      {NAV.map(({ name, title, icon: Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Icon color={color} size={size} />,
          }}
        />
      ))}
      {HIDDEN.map(({ name, title }) => (
        <Tabs.Screen key={name} name={name} options={{ title, href: null }} />
      ))}
    </Tabs>
  )
}

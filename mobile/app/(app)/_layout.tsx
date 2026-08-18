import { Redirect, useRouter, usePathname, Tabs } from 'expo-router'
import type { ReactElement } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { ChevronLeftIcon, SettingsIcon } from '../../components/icons'
import { TabBar } from '../../components/tab-bar'
import { ThemeToggle } from '../../components/theme-toggle'
import { useAuthStore } from '../../stores/auth'
import { useTokenColor } from '../../stores/theme'

/**
 * The `ProtectedRoute` guard plus the app's own chrome, ported from
 * `frontend/src/components/ProtectedRoute.tsx` and `components/layout/AppShell.tsx`.
 *
 * The bar itself is `components/tab-bar.tsx` rather than React Navigation's, so
 * the scan action can sit apart at the left edge; the order and the icons live
 * there. What stays here is only what the navigator owns — the header, and which
 * routes exist.
 */

/**
 * Every screen in the group, and the title its header shows.
 *
 * `name` is the route file relative to this layout, not the URL — `sets/index`
 * rather than `/sets`, because there is no `sets/_layout.tsx` and so both files
 * under `sets/` are screens of *this* navigator.
 *
 * No `href: null` on any of them any more. That option existed to hide the six
 * screens the tab bar should not list, and a custom `tabBar` decides that by
 * itself — what is left for the navigator is the `title` its header reads, which
 * left unset falls back to the route name and captions the set screen
 * `sets/[setId]`.
 */
const SCREENS: { name: string; title: string }[] = [
  { name: 'index', title: 'Dashboard' },
  { name: 'sets/index', title: 'Sets' },
  { name: 'progress', title: 'Progress' },
  { name: 'scan', title: 'Scan a page' },
  { name: 'sets/[setId]', title: 'Set' },
  { name: 'study', title: 'Study' },
  { name: 'scan-review', title: 'Review the scan' },
  { name: 'settings', title: 'Settings' },
  { name: 'account', title: 'Account' },
]

/**
 * The way into settings and account.
 *
 * The web keeps them behind a header dropdown. There is no dropdown here, and a
 * fifth tab for a screen visited once a month would cost a fifth of the tab bar
 * permanently — so it is a header button beside the theme toggle, matching where
 * the web puts the same affordance.
 */
function SettingsButton(): ReactElement {
  const router = useRouter()
  const foreground = useTokenColor('--foreground')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => {
        router.push('/settings')
      }}
      className="h-11 w-11 items-center justify-center rounded-md"
    >
      <SettingsIcon color={foreground} />
    </Pressable>
  )
}

export default function AppLayout(): ReactElement {
  const status = useAuthStore((s) => s.status)
  const pathname = usePathname()
  const router = useRouter()

  const primary = useTokenColor('--primary')
  const foreground = useTokenColor('--foreground')
  const background = useTokenColor('--background')

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
   * `pathname` is the current route destination, which is what makes a deep link
   * survive being interrupted by the sign-in form.
   */
  if (status === 'anonymous') {
    return <Redirect href={{ pathname: '/login', params: { from: pathname } }} />
  }

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        /*
          The navigator's own header, rather than a ported `AppShell`. It is what
          gives the theme toggle somewhere to live on every screen behind the
          guard — which Phase 2 has to deliver — without a chrome component that
          the phases filling these screens would only rewrite. The web header's
          other controls come with the screens that own them: search with
          `/search`, the account menu with `/account`.

          Painted `--background`, not `--surface`. A header in the surface colour
          over a page in the background colour is a bar with an edge, and the two
          stacked titles it produced — "Dashboard" above "Welcome, …" — read as
          two headers rather than one screen. Flush with the page, it reads as the
          top of the content, which is what every current phone OS does with it.
        */
        headerStyle: { backgroundColor: background },
        headerTintColor: foreground,
        headerShadowVisible: false,
        headerRight: () => (
          <View className="flex-row items-center pr-1">
            <SettingsButton />
            <ThemeToggle />
          </View>
        ),
      }}
    >
      {SCREENS.map(({ name, title }) => {
        const options = {
          title,
          ...(name === 'study' ||
          name === 'scan' ||
          name === 'scan-review' ||
          name === 'sets/[setId]'
            ? {
                headerLeft: () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => {
                      if (router.canGoBack()) {
                        router.back()
                      } else {
                        router.replace('/')
                      }
                    }}
                    className="h-11 w-11 items-center justify-center rounded-md ml-2 active:opacity-60"
                  >
                    <ChevronLeftIcon color={foreground} size={24} />
                  </Pressable>
                ),
              }
            : {}),
        }

        return <Tabs.Screen key={name} name={name} options={options} />
      })}
    </Tabs>
  )
}

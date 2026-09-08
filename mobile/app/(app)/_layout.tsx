import { Redirect, useRouter, usePathname, Tabs } from 'expo-router'
import { useState, useEffect, type ReactElement } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { ChevronLeftIcon, SettingsIcon } from '../../components/icons'
import { TabBar } from '../../components/tab-bar'
import { ThemeToggle } from '../../components/theme-toggle'
import { SauladoLogo } from '../../components/saulado-logo'
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
  { name: 'files/index', title: 'File Repository' },
  { name: 'files/[fileId]', title: 'Document Viewer' },
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

  const foreground = useTokenColor('--foreground')
  const background = useTokenColor('--background')

  // Intro transition states
  const [showIntro, setShowIntro] = useState(true)
  const introProgress = useSharedValue(0)

  useEffect(() => {
    // When the session is authenticated, smoothly transition from star gyro into the dashboard
    if (status === 'authenticated') {
      const timer = setTimeout(() => {
        introProgress.value = withTiming(
          1,
          {
            duration: 650,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
          (finished) => {
            if (finished) {
              runOnJS(setShowIntro)(false)
            }
          },
        )
      }, 700)

      return () => clearTimeout(timer)
    }
  }, [status, introProgress])

  // Animated styles for overlay fade & logo outward bloom/dissolve
  const introOverlayStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - introProgress.value,
    }
  })

  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - introProgress.value,
      transform: [
        { scale: 1 + introProgress.value * 0.18 },
        { translateY: -introProgress.value * 32 },
      ],
    }
  })

  const dashboardAnimatedStyle = useAnimatedStyle(() => {
    return {
      flex: 1,
      opacity: 0.5 + introProgress.value * 0.5,
      transform: [{ translateY: (1 - introProgress.value) * 20 }],
    }
  })

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
    <View style={{ flex: 1, backgroundColor: background }}>
      <Animated.View style={dashboardAnimatedStyle}>
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
              ...(name === 'study'
                ? {
                    headerShown: false,
                  }
                : name === 'scan' ||
                    name === 'scan-review' ||
                    name === 'sets/[setId]' ||
                    name === 'files/[fileId]'
                  ? {
                      headerLeft: () => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Go back"
                          onPress={() => {
                            if (router.canGoBack()) {
                              router.back()
                            } else {
                              router.replace('/files')
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
      </Animated.View>

      {showIntro && (
        <Animated.View
          style={[StyleSheet.absoluteFill, introOverlayStyle, { zIndex: 9999 }]}
          className="items-center justify-center bg-[#052e24] dark:bg-[#031a14]"
          pointerEvents={status === 'authenticated' ? 'none' : 'auto'}
        >
          <Animated.View
            style={[logoAnimatedStyle, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <SauladoLogo size={120} animation="star-gyro" />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  )
}

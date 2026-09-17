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
import { ChevronLeftIcon } from '../../components/icons'
import { TabBar } from '../../components/tab-bar'
import { ProfileHeaderButton } from '../../components/profile-header-button'
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
 */
const SCREENS: { name: string; title: string }[] = [
  { name: 'index', title: 'Saulado' },
  { name: 'sets/index', title: 'Study Sets' },
  { name: 'progress', title: 'Progress' },
  { name: 'files/index', title: 'Study Bag' },
  { name: 'files/[fileId]', title: 'Document Viewer' },
  { name: 'files/bag-studio', title: 'Card Creation Studio' },
  { name: 'scan', title: 'Scan a page' },
  { name: 'sets/[setId]', title: 'Set' },
  { name: 'study', title: 'Study' },
  { name: 'scan-review', title: 'Review the scan' },
  { name: 'settings', title: 'Settings' },
  { name: 'account', title: 'Account' },
]

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
    if (status === 'authenticated' || status === 'offline-authenticated') {
      const timer = setTimeout(() => {
        introProgress.value = withTiming(
          1,
          {
            duration: 1300,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
          (finished) => {
            if (finished) {
              runOnJS(setShowIntro)(false)
            }
          },
        )
      }, 1200)

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
            headerRight: () => <ProfileHeaderButton />,
          }}
        >
          {SCREENS.map(({ name, title }) => {
            const options = {
              title,
              ...(name === 'files/bag-studio' || name === 'scan-review'
                ? {
                    unmountOnBlur: true,
                  }
                : {}),
              ...(name === 'study' || name === 'files/[fileId]'
                ? {
                    headerShown: false,
                  }
                : name === 'scan' ||
                    name === 'scan-review' ||
                    name === 'sets/[setId]' ||
                    name === 'files/bag-studio' ||
                    name === 'settings' ||
                    name === 'account'
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
          pointerEvents={
            status === 'authenticated' || status === 'offline-authenticated' ? 'none' : 'auto'
          }
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

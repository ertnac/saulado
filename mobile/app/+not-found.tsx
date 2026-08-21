import { Link, usePathname } from 'expo-router'
import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../stores/auth'

/**
 * Ported from `frontend/src/components/NotFoundPage.tsx`.
 *
 * `+not-found` is Expo Router's catch-all, the file-tree equivalent of the web
 * router's `path="*"`. It is reachable here mostly through deep links: a
 * mistyped or stale `saulado://` URL has to land somewhere with a way out, and
 * the default is an unstyled developer screen.
 */
export default function NotFoundScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const status = useAuthStore((s) => s.status)

  const signedIn = status === 'authenticated'

  return (
    <View
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      className="flex-1 justify-center bg-background px-6 py-12"
    >
      <Text className="font-mono text-sm text-muted-foreground">404</Text>
      <Text className="mt-2 text-2xl font-semibold text-foreground">No page here</Text>

      <Text className="mt-2 text-muted-foreground">
        Nothing is served at <Text className="font-mono text-foreground">{pathname}</Text>.
      </Text>

      {/*
        Where "back" goes depends on whether there is a session to go back to.
        Offering a signed-out visitor the dashboard just bounces them through the
        route guard to the login screen.
      */}
      <Link href={signedIn ? '/' : '/login'} className="mt-6 font-medium text-foreground underline">
        {signedIn ? 'Back to dashboard' : 'Go to sign in'}
      </Link>
    </View>
  )
}

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, type ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import '../global.css'
import { asyncStoragePersister, queryClient } from '../lib/query-client'
import { useAuthStore } from '../stores/auth'
import { useOfflineSetsStore } from '../stores/offline-sets'
import { useTheme, useTokenColor } from '../stores/theme'

// Keep the native splash screen visible while the app is loading
void SplashScreen.preventAutoHideAsync()

/**
 * The root layout, ported from `frontend/src/App.tsx`.
 *
 * Everything that must exist before any screen renders lives here: the query
 * client, the session restore, and the status bar. The route table itself is the
 * file tree rather than a `<Routes>` block — the two guard groups are `(auth)`
 * and `(app)`, and the two token-bearing email routes sit at this level
 * deliberately, outside both.
 */
// Removed createQueryClient() call since queryClient is exported directly

import { syncEngine } from '../lib/offline/sync'
import { startServerKeepAlive } from '../services/api'

/**
 * Restores the session once, on launch.
 *
 * Same reasoning as the web `SessionRestorer`: the access token lives in memory
 * and dies with the process, while the refresh token is in the keychain and does
 * not. Without this the user is signed out by every cold start despite holding a
 * valid credential.
 *
 * Deliberately not in a `useEffect` inside a screen — `(app)/_layout.tsx` blocks
 * on `status === 'restoring'`, so a restore that only fired from a protected
 * screen could never run.
 */
function useSessionRestore(): void {
  useEffect(() => {
    syncEngine.start()
    void useAuthStore.getState().restore()
    // Phase 5.5: Load offline sets index
    void useOfflineSetsStore.getState().load()
    // Start 10-minute server keepalive ping
    startServerKeepAlive()
  }, [])
}

export default function RootLayout(): ReactElement {
  useSessionRestore()

  const { isDark } = useTheme()
  const background = useTokenColor('--background')

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        {/*
          `style` is derived from our own theme rather than left at `auto`, which
          reads the OS appearance. Those two disagree whenever the in-app theme
          overrides the phone's, and the disagreement is not cosmetic: light icons
          on the light background are invisible, so the clock and the battery
          vanish.
        */}
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            // Off at the root because the two things below it supply their own
            // chrome: the tab navigator turns its header back on, and the auth and
            // token-bearing screens are deliberately full-bleed. A header here
            // would also offer a back arrow out of groups that have nowhere to go
            // back to.
            headerShown: false,
            contentStyle: { backgroundColor: background },
          }}
        />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  )
}

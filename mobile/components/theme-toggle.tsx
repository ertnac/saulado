import type { ReactElement } from 'react'
import { Pressable } from 'react-native'
import { useColorScheme } from 'nativewind'
import { MoonIcon, SunIcon } from './icons'
import { useThemeStore, useTokenColor } from '../stores/theme'

/**
 * Ported from `AppShell`'s `ThemeToggle` (`frontend/src/components/layout/AppShell.tsx`).
 *
 * Rendered in the tab navigator's header, which is where the web keeps it, so
 * the control is on screen everywhere behind the guard.
 *
 * The icon is driven from the Zustand store (`stored`) rather than from
 * `useColorScheme()`. `colorScheme.set()` is synchronous but NativeWind's
 * reactive hook only propagates on the next render cycle, producing a
 * perceptible delay between the tap and the icon swap. Reading `stored`
 * instead means the icon flips the instant the store is written — no async gap.
 *
 * For the `system` case (stored is null or 'system') the OS-resolved value
 * from `useColorScheme` is used as the fallback, preserving the original
 * behaviour when the user has never made an explicit choice.
 */
export function ThemeToggle(): ReactElement {
  const stored = useThemeStore((s) => s.stored)
  const setTheme = useThemeStore((s) => s.setTheme)
  const { colorScheme: resolved } = useColorScheme()

  // Derive isDark from the explicit stored choice so the icon responds
  // synchronously. Fall back to the OS-resolved value when following system.
  const isDark = stored === 'dark' ? true : stored === 'light' ? false : resolved === 'dark'

  const theme = stored ?? 'system'
  const foreground = useTokenColor('--foreground')

  return (
    <Pressable
      onPress={() => {
        // Two-step cycle from whatever is currently showing. A three-way
        // light/dark/system rotation through a single button leaves the user
        // guessing which of three states they are in. The `system` option
        // belongs on the settings screen, where all three can be named.
        setTheme(isDark ? 'light' : 'dark')
      }}
      accessibilityRole="button"
      // The label says what the button will do, not what the state is — a
      // screen-reader user cannot see the icon to infer the difference.
      accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      accessibilityHint={theme === 'system' ? 'Currently following your system theme' : undefined}
      // 44×44 is the minimum touch target (saulado-ux §7); the icon inside is 20.
      className="h-11 w-11 items-center justify-center rounded-md"
    >
      {isDark ? <SunIcon color={foreground} /> : <MoonIcon color={foreground} />}
    </Pressable>
  )
}

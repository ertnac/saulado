import type { ReactElement } from 'react'
import { Pressable } from 'react-native'
import { MoonIcon, SunIcon } from './icons'
import { useTheme, useTokenColor } from '../stores/theme'

/**
 * Ported from `AppShell`'s `ThemeToggle` (`frontend/src/components/layout/AppShell.tsx`).
 *
 * Rendered in the tab navigator's header, which is where the web keeps it, so
 * the control is on screen everywhere behind the guard.
 */
export function ThemeToggle(): ReactElement {
  const { theme, setTheme, isDark } = useTheme()
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

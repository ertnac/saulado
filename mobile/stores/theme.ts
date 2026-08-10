import AsyncStorage from '@react-native-async-storage/async-storage'
import { colorScheme, useColorScheme, useUnstableNativeVariable } from 'nativewind'
import { create } from 'zustand'

/**
 * Theme state, ported from `frontend/src/hooks/useTheme.ts`.
 *
 * Three substitutions, and nothing else changes: `localStorage` becomes
 * AsyncStorage, `matchMedia` becomes NativeWind's `useColorScheme()`, and
 * `document.documentElement.classList.toggle('dark')` becomes
 * `colorScheme.set()`.
 *
 * The web version's live OS listener has no counterpart here, and its absence is
 * not an omission. `colorScheme.set('system')` hands the decision back to
 * `Appearance`, and NativeWind already re-reads it on every appearance change
 * and on every return to the foreground — so a user on `system` who switches
 * their phone to dark at sunset is followed without us subscribing to anything.
 *
 * A store rather than a hook-local `useState`, for two reasons that only exist
 * on this platform. AsyncStorage is async, so the stored choice cannot be read
 * during the first render the way `localStorage` can; per-consumer state would
 * mean every mount firing its own read and the answers landing at different
 * times. And the read has to happen exactly once, because a second one racing a
 * `setTheme` could overwrite the newer choice with the older stored value.
 */
export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'saulado-theme'

function parse(value: string | null): Theme | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null
}

interface ThemeState {
  /**
   * The device's explicit choice, or `null` for "nothing stored".
   *
   * Kept as a nullable rather than collapsed into `theme` because `'system'` and
   * `null` render identically and are not the same fact. The settings sync
   * (`SettingsPage` on web) needs the difference: the server's `darkMode` should
   * seed a device that has never been told anything, and must not override one
   * where the user made a choice. `hasStoredTheme()` exists on web for exactly
   * this; here it is `stored !== null` and needs no second read.
   */
  stored: Theme | null

  /**
   * Whether the AsyncStorage read has answered.
   *
   * Load-bearing for the same sync: before it is `true`, `stored === null` means
   * "not known yet", not "nothing stored". Seeding from the server in that
   * window would clobber the choice the read is about to deliver.
   */
  hydrated: boolean

  setTheme: (next: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  stored: null,
  hydrated: false,

  setTheme: (next) => {
    set({ stored: next, hydrated: true })
    colorScheme.set(next)

    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Preference is not persisted; the session still honours the choice.
    })
  },
}))

/**
 * Reads the stored choice and applies it, once, at import time.
 *
 * At module scope rather than in a root effect, matching `stores/auth.ts`. An
 * effect would run after the first paint, so a device stored as `light` under a
 * dark OS would render one frame of the wrong palette before correcting; firing
 * the read as early as the module is evaluated makes that window as small as the
 * platform allows.
 *
 * `'system'` is not re-applied. It is already what NativeWind does with no
 * instruction, so calling `set('system')` on every launch would only be a
 * redundant trip through `Appearance`.
 */
AsyncStorage.getItem(STORAGE_KEY)
  .then((value) => {
    const stored = parse(value)
    useThemeStore.setState({ stored, hydrated: true })
    if (stored && stored !== 'system') colorScheme.set(stored)
  })
  .catch(() => {
    // Unreadable storage is indistinguishable from empty storage, and both mean
    // the same thing to every caller: follow the OS.
    useThemeStore.setState({ hydrated: true })
  })

/**
 * The web hook's shape, so consumers port across unchanged.
 *
 * `isDark` comes from NativeWind rather than from `theme`, because `theme` alone
 * cannot answer it: on `'system'` the resolved appearance is whatever the OS
 * currently reports, and that changes underneath us.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; isDark: boolean } {
  const stored = useThemeStore((s) => s.stored)
  const setTheme = useThemeStore((s) => s.setTheme)
  const { colorScheme: resolved } = useColorScheme()

  return { theme: stored ?? 'system', setTheme, isDark: resolved === 'dark' }
}

/**
 * A design token as a colour string, for the handful of places that need one.
 *
 * React Native has no `currentColor` and no inherited text colour, so anything
 * drawing rather than laying out — an SVG stroke, the tab bar's tint — has to be
 * handed a resolved value. Reading it from the same variable the class names use
 * is what keeps those places from becoming a second palette.
 *
 * `useUnstableNativeVariable` returns the triplet as authored (`158 42% 24%`),
 * not a colour, which is why it is wrapped here rather than at each call site.
 * The fallback is `transparent` deliberately: an icon that vanishes is a
 * reported bug, where one silently drawn in a plausible wrong colour is not.
 */
export function useTokenColor(name: string): string {
  const value: unknown = useUnstableNativeVariable(name)
  return typeof value === 'string' ? `hsl(${value})` : 'transparent'
}

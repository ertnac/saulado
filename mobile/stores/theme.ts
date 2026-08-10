import AsyncStorage from '@react-native-async-storage/async-storage'
import { colorScheme, useColorScheme } from 'nativewind'
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
 * The imperative half of the palette.
 *
 * React Native has no `currentColor` and no inherited text colour, so anything
 * drawing rather than laying out — an SVG stroke, a navigator's `headerStyle`, a
 * `placeholderTextColor` — has to be handed a resolved value.
 *
 * These triplets are copied from `global.css` and have to be edited with it.
 * That duplication is deliberate, and it replaces `useUnstableNativeVariable`:
 * that hook reads NativeWind's variable store through React context, and inside
 * the navigator's own render tree it resolved to `undefined`. The old fallback
 * was `transparent`, so `headerStyle` and `tabBarStyle` were handed a colour
 * that is not one and React Navigation painted its default light chrome — a
 * white header and a white tab bar over a dark app.
 */
const PALETTE = {
  light: {
    '--background': '150 30% 97%',
    '--surface': '0 0% 100%',
    '--surface-muted': '150 28% 95%',
    '--foreground': '162 30% 12%',
    '--muted-foreground': '160 12% 38%',
    '--primary': '158 42% 24%',
    '--primary-foreground': '150 40% 97%',
    '--accent': '14 72% 58%',
    '--accent-foreground': '20 60% 99%',
    '--accent-strong': '14 62% 42%',
    '--border': '152 20% 88%',
    '--success': '142 58% 30%',
    '--warning': '32 85% 36%',
    '--danger': '358 60% 44%',
  },
  dark: {
    '--background': '166 24% 7%',
    '--surface': '166 20% 11%',
    '--surface-muted': '166 16% 15%',
    '--foreground': '150 18% 94%',
    '--muted-foreground': '150 10% 68%',
    '--primary': '152 46% 62%',
    '--primary-foreground': '166 40% 9%',
    '--accent': '14 78% 64%',
    '--accent-foreground': '18 50% 10%',
    '--accent-strong': '14 78% 70%',
    '--border': '166 14% 22%',
    '--success': '142 69% 58%',
    '--warning': '38 92% 60%',
    '--danger': '358 70% 68%',
  },
} as const

/** Every token this file can resolve. A typo is a compile error, not a blank icon. */
export type Token = keyof (typeof PALETTE)['light']

/** A design token as a colour string, following the resolved appearance. */
export function useTokenColor(name: Token): string {
  // Renamed out of the way of the module-scope `colorScheme` import, which is the
  // setter rather than the reader.
  const { colorScheme: resolved } = useColorScheme()
  return `hsl(${PALETTE[resolved === 'dark' ? 'dark' : 'light'][name]})`
}

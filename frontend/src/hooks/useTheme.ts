import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'saulado-theme'

function readStored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  } catch {
    // Safari in private mode throws on localStorage. A theme preference is not
    // worth crashing the app over.
    return 'system'
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Whether this device has an explicit stored preference.
 *
 * `readStored` cannot answer this — it returns `'system'` both for "the user
 * chose to follow the OS" and for "nothing is stored yet", which are the same
 * *rendering* but not the same *fact*. The settings sync needs the difference:
 * the server's `darkMode` should seed a device that has never been told
 * anything, and must not override one where the user made a choice.
 */
export function hasStoredTheme(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system'
  } catch {
    return false
  }
}

function apply(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

/**
 * Dark mode via Tailwind's `class` strategy, defaulting to the OS preference.
 *
 * Three states rather than two: `system` is not the same as whichever of
 * light/dark the OS currently reports. A user on `system` who switches their
 * laptop to dark at sunset expects the app to follow — collapsing that into a
 * boolean at first read freezes them into whatever it was when they first
 * visited.
 *
 * The initial class is set in index.html before paint; this hook keeps it in
 * sync afterwards.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; isDark: boolean } {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [isDark, setIsDark] = useState<boolean>(
    () => theme === 'dark' || (theme === 'system' && prefersDark()),
  )

  useEffect(() => {
    apply(theme)
    setIsDark(theme === 'dark' || (theme === 'system' && prefersDark()))

    if (theme !== 'system') return

    // Only while following the system: track OS changes live.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      apply('system')
      setIsDark(prefersDark())
    }

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference is not persisted; the session still honours the choice.
    }
  }, [])

  return { theme, setTheme, isDark }
}

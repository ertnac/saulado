import { useCallback, useState } from 'react'

const KEY = 'saulado_onboarding_done'

/**
 * Tracks whether the first-run onboarding modal should be shown.
 *
 * Persisted in localStorage so it fires exactly once per browser, regardless
 * of how many times the user logs in or navigates to the dashboard.
 */
export function useOnboarding(): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== 'true'
    } catch {
      // Private-browsing storage denial — treat as done, don't block the app.
      return false
    }
  })

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(KEY, 'true')
    } catch {
      // Ignore storage errors — the modal just won't persist its dismissed state.
    }
    setShow(false)
  }, [])

  return { show, dismiss }
}

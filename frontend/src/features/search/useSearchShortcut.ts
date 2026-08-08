import { useCallback, useEffect, useState } from 'react'

/**
 * Cmd/Ctrl+K to open the search palette (plan §6.3).
 *
 * `metaKey || ctrlKey` rather than platform detection: Cmd is the Mac
 * convention and Ctrl the Windows/Linux one, and accepting both costs nothing
 * while sniffing the platform gets it wrong for anyone on an external keyboard.
 *
 * The listener sits on `window` at the app shell rather than on any one input,
 * because the shortcut has to work from wherever the user happens to be —
 * that is the entire point of a global palette.
 */
export function useSearchShortcut(): {
  open: boolean
  onOpen: () => void
  onClose: () => void
} {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'k' && event.key !== 'K') return
      if (!event.metaKey && !event.ctrlKey) return

      /**
       * Firefox focuses its own search bar on Ctrl+K and Chrome opens the
       * omnibox with a search prefix, so this has to be prevented or the browser
       * takes the keystroke and the palette never sees it.
       */
      event.preventDefault()
      // Toggling, not just opening: the same keystroke that opened it is the
      // one a user will press to dismiss it.
      setOpen((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const onOpen = useCallback(() => {
    setOpen(true)
  }, [])

  const onClose = useCallback(() => {
    setOpen(false)
  }, [])

  return { open, onOpen, onClose }
}

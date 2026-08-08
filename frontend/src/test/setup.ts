import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * jsdom ships no `matchMedia`, and anything rendering the app shell reads it via
 * `useTheme`. Without this the theme toggle throws and the error boundary eats
 * the page under test — a test-environment gap, not a browser one.
 *
 * Reports light mode so snapshots are stable; tests that care about dark can
 * override this per-case.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

/**
 * Nor does jsdom implement `scrollIntoView` — it has no layout to scroll. Any
 * component that keeps a keyboard-driven highlight visible calls it (the search
 * palette does, on every arrow press), and the missing method throws from inside
 * an effect, which React escalates into unmounting the tree.
 */
Element.prototype.scrollIntoView = vi.fn()

/** Same gap, window level: search paging scrolls back to the top on page change. */
window.scrollTo = vi.fn()

afterEach(() => {
  cleanup()
})

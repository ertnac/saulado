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

afterEach(() => {
  cleanup()
})

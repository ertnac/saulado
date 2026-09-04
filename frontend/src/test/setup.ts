import '@testing-library/jest-dom/vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, expect, vi } from 'vitest'

expect.extend(matchers)

/**
 * jsdom ships no `matchMedia`, and anything rendering the app shell reads it via
 * `useTheme`. Without this the theme toggle throws and the error boundary eats
 * the page under test — a test-environment gap, not a browser one.
 *
 * Reports reduced motion, and nothing else. jsdom does not drive
 * `requestAnimationFrame` the way a browser does, so a figure that animates to
 * its value would sit at its starting value for the whole test and a plain
 * `getByText('12')` would fail on a purely visual feature. Answering the
 * reduced-motion query truthfully-for-the-environment makes every animation
 * resolve to its final state immediately.
 *
 * `prefers-color-scheme: dark` still reports false, so `useTheme` behaves exactly
 * as it did and tests that care about dark mode keep overriding this per case.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: query.includes('prefers-reduced-motion'),
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

/**
 * jsdom ships no `IntersectionObserver` at all, and scroll-reveal is built on it
 * (`whileInView`). Without a stub the missing constructor throws from inside an
 * effect and React unmounts the tree — the same failure mode the two stubs above
 * were added for.
 *
 * Reports an immediate intersection rather than never intersecting: jsdom has no
 * viewport and no scrolling, so "not visible yet" would be permanent and every
 * revealed section would stay hidden from the queries that look for it.
 */
class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          // Zero rects: nothing reads them, and jsdom cannot produce real ones.
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        },
      ],
      this,
    )
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

window.IntersectionObserver = ImmediateIntersectionObserver

afterEach(() => {
  cleanup()
})

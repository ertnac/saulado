/**
 * The recognized page, handed from the scanner to the review screen.
 *
 * A module variable rather than a route param. A page of notes is thousands of
 * code points; Expo Router serialises params into the URL, so passing it that way
 * means a multi-kilobyte href, and every offset the review screen produces would
 * index into a string that had been through a percent-encoding round trip.
 *
 * `takeScannedPage` clears as it reads. Navigating back to the scanner and out
 * again would otherwise re-open the review screen on the previous page, which
 * looks exactly like the new scan having been ignored.
 */
let page: string | null = null

export function setScannedPage(text: string): void {
  page = text
}

export function takeScannedPage(): string | null {
  const current = page
  page = null
  return current
}

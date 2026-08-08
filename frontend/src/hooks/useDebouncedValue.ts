import { useEffect, useState } from 'react'

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * The command palette fires a request per keystroke otherwise, and full-text
 * search is the most expensive query in the app — `ts_rank` over a GIN index,
 * plus a `ts_headline` per row, which is not index-assisted. Debouncing the
 * *value* rather than the request keeps the input itself uncontrolled-fast: the
 * character appears immediately, only the query lags.
 *
 * The timer is cleared on every change and on unmount, so a palette closed
 * mid-type cannot set state on a component that is gone.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])

  return debounced
}

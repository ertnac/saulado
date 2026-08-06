import { useCallback, useEffect, useState } from 'react'
import type { HealthResponse } from '@saulado/shared'
import { fetchHealth } from '@/services/health'

type State =
  { kind: 'loading' } | { kind: 'ready'; data: HealthResponse } | { kind: 'error'; message: string }

/**
 * Phase 0 uses a hand-rolled hook. TanStack Query arrives in Phase 2 and this
 * gets replaced — deliberately not installing it for a single request.
 */
export function useHealth(): { state: State; refresh: () => void } {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setState({ kind: 'loading' })

    fetchHealth(controller.signal)
      .then((data) => {
        if (active) setState({ kind: 'ready', data })
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unable to reach the API',
        })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [nonce])

  return { state, refresh }
}

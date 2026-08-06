import type { HealthResponse } from '@saulado/shared'
import { apiUrl } from './config'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(apiUrl('/api/health'), {
    headers: { Accept: 'application/json' },
    // Cookies cross-origin in prod; harmless same-origin in dev.
    credentials: 'include',
    ...(signal ? { signal } : {}),
  })

  if (!res.ok) {
    throw new ApiError(`Health request failed with ${String(res.status)}`, res.status)
  }

  return (await res.json()) as HealthResponse
}

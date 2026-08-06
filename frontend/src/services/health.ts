import type { HealthResponse } from '@saulado/shared'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Vite proxies /api to the backend in dev, so this stays same-origin. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  })

  if (!res.ok) {
    throw new ApiError(`Health request failed with ${res.status}`, res.status)
  }

  return (await res.json()) as HealthResponse
}

/**
 * The API contract shared by the backend (which produces it) and the frontend
 * (which consumes it). Changing this shape breaks both sides at compile time,
 * which is exactly the point of the `shared` package.
 */

/**
 * `ok`       — API is up and Postgres answered.
 * `degraded` — API is up, Postgres did not answer. The process stays alive so
 *              the failure is observable rather than a connection-refused.
 */
export type HealthStatus = 'ok' | 'degraded'

export type DatabaseStatus = 'connected' | 'disconnected'

export interface HealthResponse {
  status: HealthStatus
  /** Result of a real `SELECT 1` round-trip, not a config check. */
  database: DatabaseStatus
  /** Round-trip latency of the DB ping in ms. Null when disconnected. */
  databaseLatencyMs: number | null
  /** Process uptime in seconds. */
  uptimeSeconds: number
  /** ISO-8601, server clock. */
  timestamp: string
  version: string
}

/** Derives the overall status from the DB result. Single source of that rule. */
export function deriveHealthStatus(database: DatabaseStatus): HealthStatus {
  return database === 'connected' ? 'ok' : 'degraded'
}

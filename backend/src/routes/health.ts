import { Router } from 'express'
import { deriveHealthStatus, type DatabaseStatus, type HealthResponse } from '@saulado/shared'
import { prisma } from '../db/client.js'

export const healthRouter: Router = Router()

const VERSION = '0.0.0'

/**
 * A real round-trip to Postgres — not a config check. If this reports `ok`, the
 * full browser → API → Postgres → browser path is proven working.
 */
async function buildHealth(): Promise<HealthResponse> {
  let database: DatabaseStatus = 'disconnected'
  let databaseLatencyMs: number | null = null

  const startedAt = performance.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    database = 'connected'
    databaseLatencyMs = Math.round((performance.now() - startedAt) * 100) / 100
  } catch {
    // Swallowed deliberately: an unreachable DB is a reportable state, not a
    // 500. The response body carries the failure.
    database = 'disconnected'
  }

  return {
    status: deriveHealthStatus(database),
    database,
    databaseLatencyMs,
    uptimeSeconds: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString(),
    version: VERSION,
  }
}

/**
 * Returns 200 even when degraded: the endpoint succeeded in reporting state.
 * Uptime monitors should alert on `status`, not on the HTTP code.
 *
 * The handler is sync and defers to `buildHealth` because Express 4 typings
 * expect a void return — passing an async fn directly is a misused promise.
 */
healthRouter.get('/health', (_req, res) => {
  void buildHealth().then((body) => {
    res.status(200).json(body)
  })
})

/**
 * Readiness probe for the platform's healthcheck — distinct from /health.
 *
 * /health always returns 200 so monitors can read `status` from the body.
 * That's wrong for a deploy gate: a container that can't reach Postgres would
 * be marked healthy and take traffic. This one returns 503 when the DB is
 * unreachable, so a bad deploy fails instead of silently serving errors.
 */
healthRouter.get('/ready', (_req, res) => {
  void buildHealth().then((body) => {
    res.status(body.database === 'connected' ? 200 : 503).json(body)
  })
})

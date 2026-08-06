import cors from 'cors'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { healthRouter } from './routes/health.js'

/**
 * App construction is separated from server startup so integration tests can
 * mount the app with Supertest without binding a port.
 */
export function createApp(): Express {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', healthRouter)

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
  })

  // Four args required — Express identifies error middleware by arity.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[unhandled]', err)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    })
  })

  return app
}

import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { sendError } from './http/errors.js'
import { authRouter } from './routes/auth.js'
import { healthRouter } from './routes/health.js'

/**
 * App construction is separated from server startup so integration tests can
 * mount the app with Supertest without binding a port.
 */
export function createApp(): Express {
  const app = express()

  /**
   * Render, Vercel and most PaaS hosts terminate TLS at a proxy, so
   * `req.ip` is the proxy's address unless Express is told to trust the
   * `X-Forwarded-For` header. Rate limiting keyed on IP would otherwise see
   * every request in the fleet as coming from one client and throttle everyone
   * together.
   *
   * `1` — trust exactly one hop. `true` would trust the entire chain, letting a
   * client spoof its own address by sending the header.
   */
  if (env.isProduction) app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.use('/api', healthRouter)
  app.use('/api/auth', authRouter)

  app.use((_req, res) => {
    sendError(res, 'NOT_FOUND', 'Route not found')
  })

  // Four args required — Express identifies error middleware by arity.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[unhandled]', err)
    sendError(res, 'INTERNAL_ERROR', 'Something went wrong')
  })

  return app
}

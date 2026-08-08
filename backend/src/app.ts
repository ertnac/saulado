import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { ApiError, sendError } from './http/errors.js'
import { accountPublicRouter, accountRouter, settingsRouter } from './routes/account.js'
import { authRouter } from './routes/auth.js'
import { cardsRouter, setCardsRouter, tagsRouter } from './routes/cards.js'
import { healthRouter } from './routes/health.js'
import { dashboardRouter, progressRouter } from './routes/progress.js'
import { searchRouter } from './routes/search.js'
import { setsRouter } from './routes/sets.js'
import { studyRouter } from './routes/study.js'

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
  app.use('/api/sets', setsRouter)
  /**
   * Mounted before `/api/sets/:id` would swallow it — Express matches in
   * registration order, and `setsRouter` has no `/:id/cards` route, so the
   * nested router has to be its own mount rather than a child of it.
   */
  app.use('/api/sets/:setId/cards', setCardsRouter)
  app.use('/api/cards', cardsRouter)
  app.use('/api/tags', tagsRouter)
  app.use('/api/study', studyRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/progress', progressRouter)
  app.use('/api/search', searchRouter)
  app.use('/api/settings', settingsRouter)
  /**
   * Both mounted at the same path, public first. `accountPublicRouter` carries
   * only the email-change confirmation, which is reached by a link in an inbox
   * and so cannot require a session; anything it does not match falls through to
   * `accountRouter`, where `requireAuth` applies.
   */
  app.use('/api/account', accountPublicRouter)
  app.use('/api/account', accountRouter)

  app.use((_req, res) => {
    sendError(res, 'NOT_FOUND', 'Route not found')
  })

  // Four args required — Express identifies error middleware by arity.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    /**
     * `ApiError` is a deliberate, already-classified failure — a 404 for a
     * session that is not yours, a 400 for one that has already finished. The
     * sets and cards routes hold `res` and call `sendError` directly, but the
     * study services are called from several routes and have no response to
     * write to, so they throw instead. Without this branch every one of those
     * would arrive here as an unclassified 500.
     */
    if (err instanceof ApiError) {
      sendError(res, err.code, err.message, err.fields ? { fields: err.fields } : undefined)
      return
    }

    console.error('[unhandled]', err)
    sendError(res, 'INTERNAL_ERROR', 'Something went wrong')
  })

  return app
}

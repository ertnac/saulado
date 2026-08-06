import { createApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './db/client.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${String(env.PORT)}`)
  console.log(`Health:  http://localhost:${String(env.PORT)}/api/health`)
})

/** Drain in-flight requests and close the pool before exiting. */
function shutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down.`)

  server.close(() => {
    void prisma.$disconnect().finally(() => {
      process.exit(0)
    })
  })

  // Hard ceiling so a stuck connection can't block the exit forever.
  setTimeout(() => {
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  shutdown('SIGINT')
})

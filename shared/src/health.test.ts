import { describe, expect, it } from 'vitest'
import { deriveHealthStatus } from './health.js'

describe('deriveHealthStatus', () => {
  it('reports ok when the database is connected', () => {
    expect(deriveHealthStatus('connected')).toBe('ok')
  })

  it('reports degraded when the database is unreachable', () => {
    expect(deriveHealthStatus('disconnected')).toBe('degraded')
  })
})

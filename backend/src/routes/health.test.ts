import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'

const app = createApp()

describe('GET /api/health', () => {
  it('returns the health contract regardless of database availability', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/) as unknown,
      database: expect.stringMatching(/^(connected|disconnected)$/) as unknown,
      version: expect.any(String) as unknown,
      timestamp: expect.any(String) as unknown,
      uptimeSeconds: expect.any(Number) as unknown,
    })
  })

  it('keeps status and database consistent', async () => {
    const res = await request(app).get('/api/health')
    const { status, database, databaseLatencyMs } = res.body as {
      status: string
      database: string
      databaseLatencyMs: number | null
    }

    if (database === 'connected') {
      expect(status).toBe('ok')
      expect(databaseLatencyMs).toBeTypeOf('number')
    } else {
      expect(status).toBe('degraded')
      expect(databaseLatencyMs).toBeNull()
    }
  })
})

describe('unknown routes', () => {
  it('returns a structured 404', async () => {
    const res = await request(app).get('/api/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })
})

import type { ApiErrorResponse } from '@saulado/shared'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { env } from '../config/env.js'
import { cleanupTestUsers, registerTestUser } from '../test/helpers.js'

const app = createApp()

afterAll(async () => {
  await cleanupTestUsers()
})

describe('Admin API Authorization', () => {
  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await request(app).get('/api/admin/overview')
    expect(res.status).toBe(401)
    expect((res.body as ApiErrorResponse).error.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 FORBIDDEN when user is not in admin emails list', async () => {
    const { token } = await registerTestUser(app)
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect((res.body as ApiErrorResponse).error.code).toBe('FORBIDDEN')
  })

  it('allows access when user email is registered as an admin', async () => {
    const { token, email } = await registerTestUser(app)

    // Temporarily add this test user's email to adminEmails
    env.adminEmails.push(email.toLowerCase())

    try {
      const meRes = await request(app).get('/api/admin/me').set('Authorization', `Bearer ${token}`)

      expect(meRes.status).toBe(200)
      expect(meRes.body).toEqual({ isAdmin: true })

      const overviewRes = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${token}`)

      expect(overviewRes.status).toBe(200)
      expect(overviewRes.body).toMatchObject({
        metrics: {
          totalUsers: expect.any(Number) as unknown,
          newUsersToday: expect.any(Number) as unknown,
          newUsersThisWeek: expect.any(Number) as unknown,
          activeUsers24h: expect.any(Number) as unknown,
          activeUsers7d: expect.any(Number) as unknown,
          activeUsers30d: expect.any(Number) as unknown,
          totalSets: expect.any(Number) as unknown,
          totalCards: expect.any(Number) as unknown,
          totalReviews: expect.any(Number) as unknown,
        },
        signupTrend: expect.any(Array) as unknown,
      })

      const usersRes = await request(app)
        .get('/api/admin/users?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`)

      expect(usersRes.status).toBe(200)
      expect(usersRes.body).toMatchObject({
        users: expect.any(Array) as unknown,
        total: expect.any(Number) as unknown,
        page: 1,
        limit: 10,
        totalPages: expect.any(Number) as unknown,
      })

      // The registered user should be in the list
      const userList = (usersRes.body as { users: { email: string }[] }).users
      expect(userList.some((u) => u.email === email.toLowerCase())).toBe(true)
    } finally {
      // Remove the test user from adminEmails
      const index = env.adminEmails.indexOf(email.toLowerCase())
      if (index !== -1) {
        env.adminEmails.splice(index, 1)
      }
    }
  })
})

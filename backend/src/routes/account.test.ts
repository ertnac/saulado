import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { DataExport, SettingsResponse } from '@saulado/shared'
import { ACCOUNT_DELETE_CONFIRMATION } from '@saulado/shared'
import { createApp } from '../app.js'
import { prisma } from '../db/client.js'
import {
  TEST_PASSWORD,
  asCookie,
  cleanupTestUsers,
  outbox,
  refreshCookie,
  registerTestUser,
  resetTokenFrom,
  testEmail,
} from '../test/helpers.js'

/**
 * Settings and account integration tests (plan §6.4, §6.5).
 *
 * Three properties carry most of the weight here, and none of them is visible
 * from the happy path:
 *
 * 1. **Re-authentication.** Every account mutation re-checks the current
 *    password. An access token is fifteen minutes of proof that someone had the
 *    password once; without this, a stolen token is an account takeover rather
 *    than an inconvenience.
 * 2. **Session invalidation.** A change the owner did not make must end the
 *    attacker's session, so every mutation revokes server-side *and* clears the
 *    cookie. A revoked session whose cookie survives is a client that keeps
 *    presenting a token the server already rejected.
 * 3. **Delete really deletes.** GDPR erasure is the obligation, and a soft
 *    delete that keeps every paragraph satisfies the button and not the law.
 */

const app = createApp()

const auth = (token: string): string => `Bearer ${token}`

afterAll(async () => {
  await cleanupTestUsers()
})

beforeEach(() => {
  // These suites assert on "the last mail sent", so a shared outbox from an
  // earlier file would make the first assertion read someone else's email.
  outbox().length = 0
})

async function getSettings(token: string): Promise<SettingsResponse['settings']> {
  const res = await request(app).get('/api/settings').set('Authorization', auth(token))
  expect(res.status).toBe(200)
  return (res.body as SettingsResponse).settings
}

describe('GET /api/settings', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(401)
  })

  it('returns the defaults for a new account', async () => {
    const user = await registerTestUser(app, 'settings-default')
    const settings = await getSettings(user.token)

    expect(settings).toMatchObject({
      darkMode: false,
      dailyGoal: 20,
      newCardsPerDay: 10,
      typoTolerance: true,
      blankWidthMode: 'fixed',
      timezone: 'UTC',
    })
  })
})

describe('PATCH /api/settings', () => {
  it('updates only the keys it is sent', async () => {
    const user = await registerTestUser(app, 'settings-partial')

    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({ darkMode: true })

    expect(res.status).toBe(200)
    const settings = (res.body as SettingsResponse).settings
    expect(settings.darkMode).toBe(true)
    // Untouched keys keep their values rather than reverting to defaults.
    expect(settings.dailyGoal).toBe(20)
  })

  it('persists the change', async () => {
    const user = await registerTestUser(app, 'settings-persist')
    await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({ dailyGoal: 42, blankWidthMode: 'proportional' })

    const settings = await getSettings(user.token)
    expect(settings.dailyGoal).toBe(42)
    expect(settings.blankWidthMode).toBe('proportional')
  })

  it('does not ask for a password', async () => {
    // Deliberate asymmetry with the account routes. Preferences are not a
    // credential, and prompting for a password to toggle dark mode trains users
    // to type it into any box that asks.
    const user = await registerTestUser(app, 'settings-nopass')
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({ darkMode: true })

    expect(res.status).toBe(200)
  })

  it('rejects an empty body rather than reporting a no-op as success', async () => {
    const user = await registerTestUser(app, 'settings-empty')
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({})

    expect(res.status).toBe(400)
  })

  it('rejects a daily goal outside the shared bounds', async () => {
    const user = await registerTestUser(app, 'settings-bounds')

    for (const dailyGoal of [0, -5, 100000]) {
      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', auth(user.token))
        .send({ dailyGoal })

      expect(res.status, `dailyGoal ${String(dailyGoal)}`).toBe(400)
    }
  })

  it('rejects a timezone the runtime does not know', async () => {
    /*
      Not cosmetic. Every due date, streak and day boundary is computed in this
      zone, and `Intl` throws a RangeError on an unknown name — so storing one
      would 500 every study route for that user, from a screen with no way back.
    */
    const user = await registerTestUser(app, 'settings-tz')
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({ timezone: 'Mars/Olympus_Mons' })

    expect(res.status).toBe(400)
  })

  it('accepts a real IANA zone', async () => {
    const user = await registerTestUser(app, 'settings-tz-ok')
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({ timezone: 'Asia/Manila' })

    expect(res.status).toBe(200)
    expect((res.body as SettingsResponse).settings.timezone).toBe('Asia/Manila')
  })

  it('rejects an unknown blank width mode', async () => {
    const user = await registerTestUser(app, 'settings-blank')
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(user.token))
      .send({ blankWidthMode: 'gigantic' })

    expect(res.status).toBe(400)
  })

  it('cannot change another user’s settings', async () => {
    const owner = await registerTestUser(app, 'settings-owner')
    const stranger = await registerTestUser(app, 'settings-stranger')

    await request(app)
      .patch('/api/settings')
      .set('Authorization', auth(stranger.token))
      .send({ dailyGoal: 99 })

    expect((await getSettings(owner.token)).dailyGoal).toBe(20)
  })
})

describe('POST /api/account/password', () => {
  it('changes the password and lets the new one log in', async () => {
    const user = await registerTestUser(app, 'pw-change')
    const newPassword = 'lantern-copper-31-drift'

    const res = await request(app)
      .post('/api/account/password')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, newPassword })

    expect(res.status).toBe(200)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: newPassword })
    expect(login.status).toBe(200)
  })

  it('stops the old password working', async () => {
    const user = await registerTestUser(app, 'pw-old')
    await request(app)
      .post('/api/account/password')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'lantern-copper-31-drift' })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
    expect(login.status).toBe(401)
  })

  it('rejects a wrong current password', async () => {
    const user = await registerTestUser(app, 'pw-wrong')
    const res = await request(app)
      .post('/api/account/password')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: 'not-the-right-one-42', newPassword: 'lantern-copper-31-drift' })

    expect(res.status).toBe(401)

    // And the password is unchanged — a failed attempt must not half-apply.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
    expect(login.status).toBe(200)
  })

  it('rejects a new password that fails the policy', async () => {
    const user = await registerTestUser(app, 'pw-weak')
    const res = await request(app)
      .post('/api/account/password')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'password' })

    expect(res.status).toBe(400)
  })

  it('rejects a new password identical to the current one', async () => {
    const user = await registerTestUser(app, 'pw-same')
    const res = await request(app)
      .post('/api/account/password')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })

    expect(res.status).toBe(400)
  })

  it('revokes every session and clears the cookie', async () => {
    /*
      The point of changing a password under suspicion is ending the other
      session. Revoking server-side without clearing the cookie would leave this
      browser retrying a token the server has already rejected.
    */
    const email = testEmail('pw-sessions')
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD })
    expect(registerRes.status).toBe(201)

    const token = (registerRes.body as { accessToken: string }).accessToken
    const refresh = refreshCookie(registerRes)
    expect(refresh).toBeTruthy()

    const changed = await request(app)
      .post('/api/account/password')
      .set('Authorization', auth(token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'lantern-copper-31-drift' })

    expect(changed.status).toBe(200)
    expect(refreshCookie(changed)).toBe('')

    const reused = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', asCookie(refresh ?? ''))
    expect(reused.status).toBe(401)
  })

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/account/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'lantern-copper-31-drift' })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/account/email', () => {
  it('mails a confirmation link to the new address, not the old one', async () => {
    const user = await registerTestUser(app, 'email-request')
    const next = testEmail('email-new')

    const res = await request(app)
      .post('/api/account/email')
      .set('Authorization', auth(user.token))
      .send({ email: next, currentPassword: TEST_PASSWORD })

    expect(res.status).toBe(202)

    const sent = outbox().at(-1)
    expect(sent?.to).toBe(next)
  })

  it('does not change the address until the link is opened', async () => {
    // The typo case: `user@gmial.com` written straight to `users` would move
    // every future reset email to an inbox the user cannot read.
    const user = await registerTestUser(app, 'email-pending')
    await request(app)
      .post('/api/account/email')
      .set('Authorization', auth(user.token))
      .send({ email: testEmail('email-pending-new'), currentPassword: TEST_PASSWORD })

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })
    expect(row.email).toBe(user.email)
  })

  it('rejects a wrong current password', async () => {
    const user = await registerTestUser(app, 'email-wrongpw')
    const res = await request(app)
      .post('/api/account/email')
      .set('Authorization', auth(user.token))
      .send({ email: testEmail('email-wrongpw-new'), currentPassword: 'nope-nope-nope-11' })

    expect(res.status).toBe(401)
    expect(outbox()).toHaveLength(0)
  })

  it('rejects the address the account already has', async () => {
    const user = await registerTestUser(app, 'email-same')
    const res = await request(app)
      .post('/api/account/email')
      .set('Authorization', auth(user.token))
      .send({ email: user.email, currentPassword: TEST_PASSWORD })

    expect(res.status).toBe(400)
  })

  it('accepts a taken address without saying so', async () => {
    /*
      Deliberately not a 409. Answering here would make this endpoint a
      membership oracle — anyone with an account could test whether an address is
      registered. The duplicate is caught at confirm time, where the person
      holding the token has already proven they can read that inbox.
    */
    const existing = await registerTestUser(app, 'email-taken-existing')
    const user = await registerTestUser(app, 'email-taken-mover')

    const res = await request(app)
      .post('/api/account/email')
      .set('Authorization', auth(user.token))
      .send({ email: existing.email, currentPassword: TEST_PASSWORD })

    expect(res.status).toBe(202)
  })

  it('retires an earlier pending request', async () => {
    // Otherwise asking three times leaves three live links, and the first —
    // possibly pointing at an address the user has since thought better of —
    // keeps working for its full window.
    const user = await registerTestUser(app, 'email-supersede')
    const first = testEmail('email-first')
    const second = testEmail('email-second')

    for (const email of [first, second]) {
      const res = await request(app)
        .post('/api/account/email')
        .set('Authorization', auth(user.token))
        .send({ email, currentPassword: TEST_PASSWORD })
      expect(res.status).toBe(202)
    }

    const messages = outbox()
    const firstToken = resetTokenFrom(messages[messages.length - 2]?.text ?? '')

    const confirmed = await request(app).post('/api/account/email/confirm').send({
      token: firstToken,
    })

    expect(confirmed.status).toBe(401)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })
    expect(row.email).toBe(user.email)
  })

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/account/email')
      .send({ email: testEmail('email-anon'), currentPassword: TEST_PASSWORD })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/account/email/confirm', () => {
  /** Requests a change and returns the token from the mail it triggered. */
  async function requestChange(
    token: string,
    email: string,
  ): Promise<{ token: string; email: string }> {
    const res = await request(app)
      .post('/api/account/email')
      .set('Authorization', auth(token))
      .send({ email, currentPassword: TEST_PASSWORD })
    expect(res.status).toBe(202)

    return { token: resetTokenFrom(outbox().at(-1)?.text ?? ''), email }
  }

  it('applies the change and lets the new address log in', async () => {
    const user = await registerTestUser(app, 'confirm-ok')
    const change = await requestChange(user.token, testEmail('confirm-ok-new'))

    const res = await request(app).post('/api/account/email/confirm').send({ token: change.token })
    expect(res.status).toBe(200)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: change.email, password: TEST_PASSWORD })
    expect(login.status).toBe(200)
  })

  it('stops the old address logging in', async () => {
    const user = await registerTestUser(app, 'confirm-old')
    const change = await requestChange(user.token, testEmail('confirm-old-new'))
    await request(app).post('/api/account/email/confirm').send({ token: change.token })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
    expect(login.status).toBe(401)
  })

  it('marks the new address verified', async () => {
    // The only way to reach that line is by opening a link mailed to it, which
    // is exactly what verification means. Asking again would be asking twice.
    const user = await registerTestUser(app, 'confirm-verified')
    const change = await requestChange(user.token, testEmail('confirm-verified-new'))
    await request(app).post('/api/account/email/confirm').send({ token: change.token })

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })
    expect(row.emailVerifiedAt).not.toBeNull()
  })

  it('warns the old address after the change', async () => {
    const user = await registerTestUser(app, 'confirm-notice')
    const change = await requestChange(user.token, testEmail('confirm-notice-new'))
    await request(app).post('/api/account/email/confirm').send({ token: change.token })

    // The previous owner's only warning that the account moved.
    expect(outbox().at(-1)?.to).toBe(user.email)
  })

  it('cannot be replayed', async () => {
    const user = await registerTestUser(app, 'confirm-replay')
    const change = await requestChange(user.token, testEmail('confirm-replay-new'))

    const first = await request(app)
      .post('/api/account/email/confirm')
      .send({ token: change.token })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post('/api/account/email/confirm')
      .send({ token: change.token })
    expect(second.status).toBe(401)
  })

  it('rejects a token that was never issued', async () => {
    const res = await request(app)
      .post('/api/account/email/confirm')
      .send({ token: 'a-token-that-was-never-issued' })

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_INVALID' } })
  })

  it('reports a collision as taken rather than 500ing', async () => {
    /*
      Uniqueness is decided here, not at request time: between the two steps
      someone else may have registered the address, so the `users.email`
      constraint is the only authority and it is consulted when the value is
      actually written.
    */
    const target = testEmail('confirm-race-target')
    const mover = await registerTestUser(app, 'confirm-race-mover')
    const change = await requestChange(mover.token, target)

    // Someone else claims the address after the link was mailed.
    const claim = await request(app)
      .post('/api/auth/register')
      .send({ email: target, password: TEST_PASSWORD })
    expect(claim.status).toBe(201)

    const res = await request(app).post('/api/account/email/confirm').send({ token: change.token })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: { code: 'EMAIL_TAKEN' } })
  })

  it('leaves a collided token usable, not burned', async () => {
    /*
      The collision rolls back the `usedAt` stamp along with the update. A
      consumed token plus an unchanged address is a dead end: the user holds a
      link that can never work and has no way to tell why.
    */
    const target = testEmail('confirm-burn-target')
    const mover = await registerTestUser(app, 'confirm-burn-mover')
    const change = await requestChange(mover.token, target)

    await request(app).post('/api/auth/register').send({ email: target, password: TEST_PASSWORD })
    await request(app).post('/api/account/email/confirm').send({ token: change.token })

    // The blocker frees the address; the original link must still work.
    await prisma.user.deleteMany({ where: { email: target } })

    const retry = await request(app)
      .post('/api/account/email/confirm')
      .send({ token: change.token })

    expect(retry.status).toBe(200)
  })

  it('needs no access token, since the link opens wherever the mail is read', async () => {
    // The natural device for reading mail sent to a *new* address is often not
    // the signed-in one. The password was already demanded at request time.
    const user = await registerTestUser(app, 'confirm-anon')
    const change = await requestChange(user.token, testEmail('confirm-anon-new'))

    const res = await request(app).post('/api/account/email/confirm').send({ token: change.token })

    expect(res.status).toBe(200)
  })
})

describe('GET /api/account/export', () => {
  it('returns the user’s whole library as a download', async () => {
    const user = await registerTestUser(app, 'export-basic')

    const setRes = await request(app)
      .post('/api/sets')
      .set('Authorization', auth(user.token))
      .send({ title: 'Hardware' })
    const setId = (setRes.body as { set: { id: string } }).set.id

    await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', auth(user.token))
      .send({
        title: 'The CPU',
        paragraph: 'The CPU is the brain of the computer',
        answers: [{ startOffset: 4, endOffset: 7 }],
        tags: ['exam'],
      })

    const res = await request(app).get('/api/account/export').set('Authorization', auth(user.token))

    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('attachment')
    // The file is the user's entire library; a copy in a shared cache is
    // exactly the leak this endpoint exists to avoid being.
    expect(res.headers['cache-control']).toContain('no-store')

    const body = res.body as DataExport
    expect(body.formatVersion).toBe(2)
    expect(body.account.email).toBe(user.email)
    expect(body.sets).toHaveLength(1)
    expect(body.sets[0]?.cards).toHaveLength(1)
    expect(body.sets[0]?.cards[0]?.answers[0]?.answerText).toBe('CPU')
    expect(body.sets[0]?.cards[0]?.tags).toEqual([])
  })

  it('never contains a password hash', async () => {
    const user = await registerTestUser(app, 'export-nohash')
    const res = await request(app).get('/api/account/export').set('Authorization', auth(user.token))

    expect(JSON.stringify(res.body)).not.toContain('$2')
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('is empty but well-formed for a new account', async () => {
    // A zero and an absence are different facts; an importer should not have to
    // guess which one an omitted key was.
    const user = await registerTestUser(app, 'export-empty')
    const res = await request(app).get('/api/account/export').set('Authorization', auth(user.token))

    const body = res.body as DataExport
    expect(body.sets).toEqual([])
    expect(body.reviews).toEqual([])
    expect(body.dailyStats).toEqual([])
    expect(body.settings).toBeDefined()
  })

  it('never contains another user’s data', async () => {
    const owner = await registerTestUser(app, 'export-owner')
    const stranger = await registerTestUser(app, 'export-stranger')

    await request(app)
      .post('/api/sets')
      .set('Authorization', auth(owner.token))
      .send({ title: 'Private notes' })

    const res = await request(app)
      .get('/api/account/export')
      .set('Authorization', auth(stranger.token))

    expect((res.body as DataExport).sets).toEqual([])
    expect(JSON.stringify(res.body)).not.toContain('Private notes')
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/account/export')
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/account', () => {
  const confirmation = ACCOUNT_DELETE_CONFIRMATION

  it('deletes the account and everything hanging off it', async () => {
    const user = await registerTestUser(app, 'delete-cascade')

    const setRes = await request(app)
      .post('/api/sets')
      .set('Authorization', auth(user.token))
      .send({ title: 'Doomed' })
    const setId = (setRes.body as { set: { id: string } }).set.id

    await request(app)
      .post(`/api/sets/${setId}/cards`)
      .set('Authorization', auth(user.token))
      .send({
        title: 'The CPU',
        paragraph: 'The CPU is the brain of the computer',
        answers: [{ startOffset: 4, endOffset: 7 }],
      })

    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, confirmation })

    expect(res.status).toBe(204)

    // Hard delete, not a `deleted_at` column that keeps every paragraph.
    expect(await prisma.user.findUnique({ where: { id: user.userId } })).toBeNull()
    expect(await prisma.studySet.findMany({ where: { userId: user.userId } })).toEqual([])
    expect(await prisma.studyCard.findMany({ where: { studySetId: setId } })).toEqual([])
    expect(await prisma.userSettings.findUnique({ where: { userId: user.userId } })).toBeNull()
  })

  it('stops the old credentials logging in', async () => {
    const user = await registerTestUser(app, 'delete-login')
    await request(app)
      .delete('/api/account')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, confirmation })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })

    expect(login.status).toBe(401)
  })

  it('clears the refresh cookie', async () => {
    const email = testEmail('delete-cookie')
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD })

    const token = (registerRes.body as { accessToken: string }).accessToken
    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(token))
      .send({ currentPassword: TEST_PASSWORD, confirmation })

    expect(res.status).toBe(204)
    expect(refreshCookie(res)).toBe('')
  })

  it('rejects a wrong password and keeps the account', async () => {
    const user = await registerTestUser(app, 'delete-wrongpw')
    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: 'not-my-password-77', confirmation })

    expect(res.status).toBe(401)
    expect(await prisma.user.findUnique({ where: { id: user.userId } })).not.toBeNull()
  })

  it('rejects a missing or wrong confirmation phrase', async () => {
    /*
      Checked server-side as well as in the UI. A client-side confirmation is a
      suggestion — `DELETE /api/account` is one curl away regardless of what the
      form does, and this is the one irreversible action in the product.
    */
    const user = await registerTestUser(app, 'delete-confirm')

    for (const body of [
      { currentPassword: TEST_PASSWORD },
      { currentPassword: TEST_PASSWORD, confirmation: 'delete' },
      { currentPassword: TEST_PASSWORD, confirmation: '' },
    ]) {
      const res = await request(app)
        .delete('/api/account')
        .set('Authorization', auth(user.token))
        .send(body)

      expect(res.status).toBe(400)
    }

    expect(await prisma.user.findUnique({ where: { id: user.userId } })).not.toBeNull()
  })

  it('treats a second click as success, not a 500', async () => {
    /*
      Two tabs, two clicks — and the second one carries an access token that is
      still perfectly valid, because `requireAuth` checks a signature and never
      reads the database. The handler therefore has to cope with a token whose
      account is gone; loading it with `findUniqueOrThrow` made this a 500.
      The user's intent is satisfied either way, so it is a success.
    */
    const user = await registerTestUser(app, 'delete-twice')
    const body = { currentPassword: TEST_PASSWORD, confirmation }

    const first = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(user.token))
      .send(body)
    expect(first.status).toBe(204)

    const second = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(user.token))
      .send(body)

    expect(second.status).toBe(204)
  })

  it('requires authentication', async () => {
    const res = await request(app)
      .delete('/api/account')
      .send({ currentPassword: TEST_PASSWORD, confirmation })

    expect(res.status).toBe(401)
  })

  it('answers 401, not 500, on every route once the account is gone', async () => {
    /*
      An access token is valid for its full fifteen minutes whether or not the
      row it names still exists — `requireAuth` verifies a signature and does not
      touch the database. So every account route has to treat "no such user" as
      an expired credential rather than letting `findUniqueOrThrow` escape as an
      unclassified 500. `GET /export` is the one worth naming: it takes no
      password, so nothing re-authenticates in front of it.
    */
    const user = await registerTestUser(app, 'delete-stale')
    const deleted = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(user.token))
      .send({ currentPassword: TEST_PASSWORD, confirmation })
    expect(deleted.status).toBe(204)

    const stale = auth(user.token)

    const responses = await Promise.all([
      request(app).get('/api/account/export').set('Authorization', stale),
      request(app)
        .post('/api/account/password')
        .set('Authorization', stale)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'lantern-copper-31-drift' }),
      request(app)
        .post('/api/account/email')
        .set('Authorization', stale)
        .send({ email: testEmail('delete-stale-new'), currentPassword: TEST_PASSWORD }),
    ])

    for (const res of responses) {
      expect(res.status).toBe(401)
    }
  })

  it('cannot delete another user’s account', async () => {
    const owner = await registerTestUser(app, 'delete-owner')
    const stranger = await registerTestUser(app, 'delete-stranger')

    // The route takes no id — it acts on the token's own account — so the worst
    // a stranger can do with the owner's password is delete themselves.
    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', auth(stranger.token))
      .send({ currentPassword: TEST_PASSWORD, confirmation })

    expect(res.status).toBe(204)
    expect(await prisma.user.findUnique({ where: { id: owner.userId } })).not.toBeNull()
  })
})

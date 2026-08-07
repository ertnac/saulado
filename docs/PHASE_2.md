# Phase 2 — Auth & App Shell

> What was built, why it is shaped this way, and how to prove it works.
>
> **Commits:** `5e71052` (backend) · `7b7818f` (frontend) · [Plan §Phase 2](../IMPLEMENTATION_PLAN.md)

---

## Table of contents

1. [What Phase 2 is](#1-what-phase-2-is)
2. [The 15 checkpoints](#2-the-15-checkpoints)
3. [How a session actually works](#3-how-a-session-actually-works)
4. [The five decisions worth knowing](#4-the-five-decisions-worth-knowing)
5. [Verifying it yourself](#5-verifying-it-yourself)
6. [Problems hit and how they were fixed](#6-problems-hit-and-how-they-were-fixed)
7. [Before starting Phase 3](#7-before-starting-phase-3)

---

## 1. What Phase 2 is

Phase 0 proved the pipes. Phase 1 built the cloze engine as pure functions. Phase 2
is the first phase with **users** in it — identity, sessions, and the frame the rest
of the app hangs off.

**The bar:** _register, close the tab, reopen it, still be logged in — and a wrong
password is rate-limited._

That sentence is doing more work than it looks. "Close the tab" kills the access
token, because the access token lives in a JavaScript variable. Surviving the reopen
is the refresh cookie's job, and getting that handoff right is most of this phase.

---

## 2. The 15 checkpoints

### Backend (plan §2.1)

| #   | Checkpoint                                    | Where it lives                     |
| --- | --------------------------------------------- | ---------------------------------- |
| 1   | `POST /register` — bcrypt ≥12, uniqueness     | `backend/src/routes/auth.ts:73`    |
| 2   | `POST /login` — 15-min access JWT + refresh   | `backend/src/routes/auth.ts:120`   |
| 3   | `POST /refresh`, `POST /logout`               | `backend/src/routes/auth.ts:157`   |
| 4   | Forgot/reset — single-use, hashed, 1-hour TTL | `backend/src/routes/auth.ts:265`   |
| 5   | Email provider, swappable                     | `backend/src/auth/email.ts`        |
| 6   | `requireAuth` middleware                      | `backend/src/http/require-auth.ts` |
| 7   | Rate limiting, 5/15min per IP+email           | `backend/src/http/rate-limit.ts`   |
| 8   | Zod on every body + one shared error shape    | `routes/auth.schemas.ts`, `http/`  |
| 9   | Helmet, CORS allowlist, 1 MB body cap         | `backend/src/app.ts:29`            |

### Frontend (plan §2.2)

| #   | Checkpoint                              | Where it lives                               |
| --- | --------------------------------------- | -------------------------------------------- |
| 10  | Router v6 + `<ProtectedRoute>`          | `frontend/src/components/ProtectedRoute.tsx` |
| 11  | Register / Login / Forgot / Reset pages | `frontend/src/features/auth/`                |
| 12  | Zustand store + 401 silent-refresh      | `stores/auth.ts`, `services/api.ts`          |
| 13  | App shell, nav, dark mode via `class`   | `components/layout/AppShell.tsx`             |
| 14  | Toasts, error boundary, 404             | `stores/toast.ts`, `components/`             |
| 15  | Empty dashboard with skeletons          | `features/dashboard/DashboardPage.tsx`       |

All 15 are done. One item in the plan was **deliberately not** implemented as
written — see §4.2.

---

## 3. How a session actually works

```
register/login
      │
      ├─► access JWT (15 min) ──────► returned in the body,
      │                               held in a module variable
      │
      └─► refresh token (30 days) ──► Set-Cookie: httpOnly, path=/api/auth
                                      never visible to JavaScript

  ┌─────────────────── 15 minutes later ───────────────────┐
  │  request → 401 TOKEN_EXPIRED                          │
  │       → POST /api/auth/refresh  (cookie rides along)  │
  │       → new access token + NEW refresh cookie         │
  │       → original request replayed once                │
  └────────────────────────────────────────────────────────┘

  reopen the tab: access token is gone, cookie is not
      → one refresh on mount → signed in, no login screen
```

**Rotation on every use.** Each refresh issues a new token and retires the old one.
Present a retired token and the server treats it as theft: the entire token family
is revoked, so both the thief and the victim are logged out. Loud, on purpose — a
silent session takeover is worse than an unexpected logout.

---

## 4. The five decisions worth knowing

### 4.1 The access token is never stored anywhere

It lives in a module-scope variable in `services/api.ts`. Not `localStorage`, not
`sessionStorage`, not a readable cookie.

Any of those turns one XSS into a token an attacker can read, exfiltrate, and replay
from their own machine for the next 15 minutes. A closure variable dies with the tab
and cannot be read from the console. Surviving a reload is the httpOnly cookie's job,
and a cookie JavaScript cannot read is a cookie XSS cannot steal.

### 4.2 `SameSite=None` in production, not `Strict`

The plan says `Strict`. `Strict` is correct when the API and the app share a domain.
Ours do not — the frontend is on Vercel, the API on Render — and a `Strict` cookie is
simply **not sent** on a cross-site request, so refresh would never work in production.

`SameSite` was the CSRF defence, so dropping to `None` hands that back. It is replaced
with an explicit Origin check (`hasAllowedOrigin`, `backend/src/auth/cookies.ts:80`):
a cross-site form post cannot forge the `Origin` header, so requiring a known origin
blocks the forged-request case. Requests with no `Origin` at all are allowed, because
curl and the test suite legitimately omit it and neither is the threat model — CSRF
is specifically about tricking a _browser_ that already holds the cookie.

Put the API on a subdomain of the app and you can set `COOKIE_SAMESITE=strict` and
delete the trade entirely.

### 4.3 Auth status is three states, not a boolean

```ts
type AuthStatus = 'restoring' | 'authenticated' | 'anonymous'
```

On first paint the app genuinely does not know whether a session exists. JavaScript
cannot test for an httpOnly cookie — that is the whole point of the flag — so the only
way to find out is to ask the server.

A boolean forces "don't know yet" to collapse into "signed out", and the route guard
then bounces a signed-in user to the login page on every single reload. That is
precisely the bug the done-when criterion is written to catch.

### 4.4 Refresh is single-flight

```ts
let refreshInFlight: Promise<AuthResponse | null> | null = null
```

Because the server revokes the family on token reuse, two concurrent refreshes are not
merely wasteful — the second one presents an already-spent token and logs the user out
of their own app. Three tabs waking together, or three parallel queries all hitting
401, would do it.

Sharing one in-flight promise also makes React StrictMode's double-invoked effects
safe for free, which is otherwise a development-only logout that looks like a ghost.

### 4.5 The store and the API layer do not import each other

`stores/auth.ts` never touches the access token; `services/api.ts` never imports the
store. They meet through an `onSessionChange` callback registered at module scope.

Without the bridge it is a circular import, and the obvious fix — putting the token in
the store — makes it reachable from any devtools console.

---

## 5. Verifying it yourself

### 5.1 The static gate

```bash
pnpm verify        # typecheck → lint → format:check → test   (exactly what CI runs)
pnpm build
```

Expect **204 tests** passing: 191 shared, 9 frontend, 4 backend.

### 5.2 The done-when criterion, in a browser

```bash
pnpm db:up
pnpm dev
```

Then, at <http://localhost:5173>:

| #   | Do this                              | Expect                                             |
| --- | ------------------------------------ | -------------------------------------------------- |
| 1   | Register with a fresh email          | Land on the dashboard                              |
| 2   | **Close the tab. Reopen it.**        | Dashboard again — no login screen, no flash of it  |
| 3   | Hard reload (Ctrl+Shift+R)           | Same                                               |
| 4   | DevTools → Application → Cookies     | `saulado_rt`, HttpOnly ✓, no access token anywhere |
| 5   | Console: `localStorage`              | Only `saulado-theme`. No token.                    |
| 6   | Sign out, then visit `/`             | Redirected to `/login`                             |
| 7   | Sign in with a **wrong** password ×6 | 6th says "wait about 15 minutes"                   |
| 8   | Visit `/nope`                        | 404 page naming the path                           |
| 9   | Toggle the theme, then reload        | Theme sticks, and does **not** flash the old one   |
| 10  | Forgot password → check the terminal | Reset link printed in the server log               |
| 11  | Open that link, set a new password   | Redirected to login; the new password works        |

Step 2 is the criterion. Step 9 is the one people skip and then live with.

### 5.3 Proving it at the API level

The frontend proxies `/api` to `:3000`, so curl against `:5173` takes the same path a
browser does — including the Origin check.

```bash
# Register, keeping the cookie jar
curl -s -c jar.txt -X POST http://localhost:5173/api/auth/register \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' \
  -d '{"email":"you@example.com","password":"correct-horse-battery"}'

grep saulado_rt jar.txt        # → #HttpOnly_localhost ... /api/auth

# The "reopened tab": cookie only, no access token
curl -s -b jar.txt -c jar.txt -X POST http://localhost:5173/api/auth/refresh \
  -H 'Origin: http://localhost:5173'
# → 200, and the token in jar.txt has CHANGED (rotation)
```

To see theft detection, save the token before that refresh and replay it after:
both it **and** the newly-rotated one come back `TOKEN_INVALID`. That is the family
revocation working, and it is the single easiest thing to get wrong silently.

---

## 6. Problems hit and how they were fixed

### 1. The refresh cookie was silently dropped — every session would die

`REFRESH_COOKIE_NAME` used the `__Host-` prefix. `__Host-` is a contract the browser
**enforces**: it requires `Secure` _and_ `Path=/` _and_ no `Domain`. The cookie was
scoped to `/api/auth`, and dev has no TLS — so two of the three failed.

A cookie that fails its prefix is not downgraded. It is **dropped entirely**, with no
error anywhere. Login returned 200 and looked perfect; the session just evaporated.

Fixed by switching to `__Secure-`, which requires only `Secure` and so composes with
both the narrow path and `COOKIE_DOMAIN`. Found by reading the curl cookie jar — no
typecheck, lint, or unit test could have caught it.

### 2. `ERR_ERL_KEY_GEN_IPV6`

`express-rate-limit` v7 rejects a `keyGenerator` that uses `req.ip` raw, because IPv6
hands one subscriber an entire /64 — an attacker walks addresses inside their own
allocation and gets a fresh budget each time. Fixed with the library's `ipKeyGenerator`
helper, which normalises to the subnet prefix.

### 3. `index.html` hardcoded `class="dark"`

It overrode the stored preference until React hydrated, so a light-mode user got a dark
flash on every load. Replaced with a blocking inline script that reads `saulado-theme`
and `prefers-color-scheme` **before first paint**. Doing this from React cannot work:
the page has already painted by then.

### 4. `window.matchMedia` does not exist in jsdom

Every test reaching the app shell crashed into the error boundary, because the theme
toggle calls it unconditionally. Stubbed in `src/test/setup.ts` rather than guarded in
the hook — `matchMedia` is universal in real browsers, so a guard would be dead code
shaped like a bug fix.

### 5. CI had no `JWT_SECRET`

`env.ts` refuses to boot without it and `createApp()` loads `env`, so every Supertest
suite would have failed at import. It had not gone red yet only because none of the
Phase 1 or Phase 2 commits were pushed. Added to `ci.yml` as a throwaway value.

---

## 7. Before starting Phase 3

### One real gap

**Backend auth tests do not exist** (plan task #22). The backend's only coverage is
4 health tests. The whole auth flow has been verified by hand and at the API level, but
nothing stops a future edit from breaking it silently.

Worth writing before Phase 3, because Phase 3 adds `user_id` scoping to every query and
its own done-when depends on auth already being trustworthy. Specifically:

- Supertest integration tests over register → login → refresh → logout
- Rotation and family-revocation-on-reuse — the highest-value test here
- The full reset flow, including single-use and expiry
- Unit tests for `auth/tokens.ts` and `auth/password.ts`
- The rate limiter is `skip: () => env.isTest`, so covering it needs an app built with
  it forced on. The comment at `http/rate-limit.ts:11` claims this test exists; it does
  not, and that comment should be made true rather than deleted.

### Not blocking, but do them at some point

- **Nothing is pushed.** 8 local commits, CI last ran on Phase 0. The first push will
  be the real test of the `ci.yml` fix.
- **No email provider.** The logging adapter is the default and works end to end; set
  `RESEND_API_KEY` when reset mail needs to reach a real inbox. Phase 3 does not need it.
- **`COOKIE_SAMESITE` on Render.** Production defaults to `none` + `Secure`, which is
  correct for split hosting, but confirm it once the deployed frontend logs in.
- **Email verification is unused.** `emailVerifiedAt` exists on the user and is never
  set. Fine — nothing gates on it. Decide in a later phase whether it should.

### Prerequisite check for Phase 3

Phase 3 needs, and now has: a `requireAuth` middleware to hang routes off, a `userId`
on every authenticated request, a shared error shape for field-level validation errors,
a working app shell to render inside, and toasts for save confirmations. Nothing in
Phase 3's plan is blocked.

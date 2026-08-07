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

Expect **292 tests** passing: 191 shared, 9 frontend, 92 backend.

### 5.2 The done-when criterion, in a browser

```bash
pnpm db:up
pnpm dev
```

**Preflight.** Two things produce failures that look exactly like auth bugs and are
not. Check both before touching the table:

1. **The Vite banner must read `http://localhost:5173/`.** A stale dev server holding
   the port used to make Vite drift to 5174, and every refresh then came back 401 —
   see §6.6. `strictPort: true` now turns that into a hard startup failure, so if Vite
   starts at all, the port is right.
2. **DevTools network throttling must be off.** Step 9 asks you to set it to Slow 3G.
   Leaving it there — or on Offline — makes every request fail with
   `net::ERR_INTERNET_DISCONNECTED` whenever DevTools is open, which reads precisely
   like a dead server.

Then, at <http://localhost:5173>:

| #   | Do this                              | Pass signal                                                         |
| --- | ------------------------------------ | ------------------------------------------------------------------- |
| 1   | Register with a fresh email          | `Welcome, <name>` heading on the dashboard                          |
| 2   | **Close the tab. Reopen it.**        | Dashboard again — one `/refresh` returning **200**, no login screen |
| 3   | Hard reload (Ctrl+Shift+R)           | Same                                                                |
| 4   | DevTools → Application → Cookies     | `saulado_rt`, HttpOnly ✓, Path `/api/auth` — and nothing beside it  |
| 5   | Console: `Object.keys(localStorage)` | `[]`, or `['saulado-theme']` once toggled. No token.                |
| 6   | Sign out, then visit `/`             | Redirected to `/login`                                              |
| 7   | Sign in with a **wrong** password ×6 | 6th says "about 15 minutes"                                         |
| 8   | Visit `/nope`                        | `No page here`, naming `/nope`                                      |
| 9   | Toggle the theme, then reload        | Theme sticks, with **no flash** of the old one                      |
| 10  | Forgot password → the backend log    | `─── email (not actually sent) ───` box holding a `?token=` link    |
| 11  | Open that link, set a new password   | Redirected to login; the new password works                         |

Step 2 is the criterion. Step 9 is the one people skip and then live with.

> **One 401 on `/api/auth/refresh` while signed out is correct behaviour.**
> JavaScript cannot test for an httpOnly cookie, so the app asks the server; 401 is
> the answer "no session", handled at `services/api.ts:149`. DevTools logs it before
> your code ever sees it, and every signed-out page load produces exactly one.
> **Two** on a single load _is_ a bug — single-flight (`api.ts:170`) has broken, and
> the second replays a spent token and revokes the family.

### 5.3 The four steps that get misread

Steps 4, 5, 9 and 10 each have a pass state that looks like a failure.

**4 — the cookie.** The name is `saulado_rt`, **unprefixed**. `__Secure-` is
production-only (`auth/cookies.ts:20`); seeing it locally means the browser is
silently dropping the cookie and the session will die on the next reload. Two further
things make a perfectly good cookie look absent: **cookies ignore ports**, so this one
is shared across `:5173`, `:5174` and `:3000` alike, and `Path=/api/auth` means it is
not sent on ordinary page loads at all — only to the auth routes. Neither hides it
from the Application panel, which lists every cookie for the domain regardless of
path. If it is genuinely missing, check the login response for `Set-Cookie` before
suspecting anything else.

**5 — localStorage.** An empty array is a **pass**. `saulado-theme` is only written
when the theme is toggled (`useTheme.ts:67`); reading it never creates it. The step
tests that no _token_ is stored, not that the theme key exists. Browser extensions
also write to `localStorage` on `localhost`, so re-run in an incognito window if
unfamiliar keys appear.

**9 — the theme flash.** Two mechanisms set the theme: the blocking IIFE in
`index.html`, before first paint, and `useTheme`, after mount. The second alone yields
a correct theme _eventually_ — paint light, boot React, snap to dark. That snap is
what this step exists to catch, and on a fast machine with a warm cache it is roughly
one frame, which is why it gets marked pass and shipped. To actually see it, throttle
the Network tab to **Slow 3G** (never Offline) and hard reload: throttling delays the
bundle but not the inline script, so a working setup stays dark for the whole slow
load. **Turn throttling back off afterwards** — see the preflight above.

**10 — the reset link.** Nothing is logged for an address with no account. The handler
returns early at `routes/auth.ts:275`, and the page says _"If that email has an
account, a reset link is on its way"_ either way — deliberately, so the form is not a
membership oracle. **"Success on screen, nothing in the terminal" is therefore the
correct output for a typo'd or unregistered address**, not a broken email adapter.
Confirm the address exists with `pnpm db:studio` first. Two other causes, in order:
`passwordResetLimiter` is 5/hour per IP+email and rejects request 6 _before_ the
handler runs, so no mail is attempted (that shows a red banner, not the ✓); and
`pnpm dev` interleaves Vite and backend output in one terminal, so run
`cd backend && pnpm dev` on its own if the box might simply have scrolled past.

### 5.4 Proving it at the API level

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

### 6. A stale dev server on 5173 broke session restore

Vite's default when its port is taken is to pick the next free one. A leftover dev
server — a `pnpm` wrapper killed without taking its child down, which is routine on
Windows — held 5173, so Vite came up on **5174** with one easily-missed line of
output.

The port is not cosmetic. It is in the backend's `CORS_ORIGIN`, and
`/api/auth/refresh` rejects any Origin outside that list (`hasAllowedOrigin`,
`auth/cookies.ts:80`). Vite's `changeOrigin: true` rewrites **Host**, not **Origin**,
so the backend saw `http://localhost:5174` and returned 401.

Only `/refresh` carries that guard, which is what made it confusing: register and
login worked and genuinely set the cookie, so the app looked signed in — until the
first refresh, which cleared the session and bounced to `/login`. The Phase 2
done-when criterion failing, with nothing wrong in the auth code.

Fixed with `strictPort: true` in `frontend/vite.config.ts`. Vite now refuses to start
rather than booting into a configuration where session restore cannot work.

### 7. Two console messages that are not bugs

Worth recording because both cost real debugging time:

- **`401` on `/api/auth/refresh` while signed out.** The mount-time session probe.
  Expected, unsuppressable, once per signed-out load. See the note in §5.2.
- **`net::ERR_INTERNET_DISCONNECTED` whenever DevTools is open.** Network throttling
  left on Offline — most likely from step 9. It only applies while DevTools is open
  and persists per browser profile, which is exactly the shape of a server that
  "disconnects when I inspect it".

---

## 7. Before starting Phase 3

### The gap that was here is closed

**Backend auth tests now exist** (plan task #22). Backend coverage went from 4 health
tests to **92** across 7 files. This was worth doing before Phase 3, because Phase 3
adds `user_id` scoping to every query and its own done-when assumes auth is already
trustworthy.

| File                           | Covers                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| `auth/tokens.test.ts`          | token shape and entropy, `hashToken` determinism, `safeCompareHex` |
| `auth/password.test.ts`        | bcrypt cost factor, salting, multibyte bytes, `burnPasswordTiming` |
| `routes/auth.test.ts`          | register → login → `/me` → logout, and the non-oracle guarantees   |
| `routes/auth.rotation.test.ts` | rotation, family revocation on reuse, Origin enforcement           |
| `routes/auth.reset.test.ts`    | forgot → reset, single-use, expiry, session revocation             |
| `http/rate-limit.test.ts`      | every limiter, with `env.isTest` flipped off per test              |
| `routes/health.test.ts`        | pre-existing                                                       |

Three things about these tests are worth knowing before you edit them:

- **They run against the development database.** `vitest.config.ts` points
  `DATABASE_URL` at the same `saulado` database `pnpm dev` uses. Nothing truncates a
  table — cleanup is scoped to rows created by the run via a random `RUN_ID` embedded
  in each test email (`src/test/helpers.ts`). A `TRUNCATE users` here would delete your
  own account, so keep cleanup row-scoped.
- **The limiter suite flips `env.isTest` at runtime.** `skip: () => env.isTest` is
  evaluated per request, so `Object.defineProperty` in `beforeEach` is enough to force
  limiters on without a second app factory. The comment at `http/rate-limit.ts:11` is
  now true rather than aspirational. Note that `registerLimiter` is IP-only with one
  process-wide budget, so exactly one test in that file may touch `/register`.
- **`onDelete: Cascade` makes one route branch unreachable.** Deleting a user deletes
  their refresh tokens, so a refresh with a deleted account returns TOKEN_EXPIRED (no
  row found) and never reaches the "Account no longer exists" TOKEN_INVALID branch at
  `routes/auth.ts:199`. The rotation suite pins TOKEN_EXPIRED deliberately, so dropping
  the cascade later shows up as a failing test rather than a silent behaviour change.

### Not blocking, but do them at some point

- ~~**Nothing is pushed.**~~ Pushed. CI is green on `e3b3a21`, which was the real test
  of the `ci.yml` fix — `pnpm install --frozen-lockfile` included.
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

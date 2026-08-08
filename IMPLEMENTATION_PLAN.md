# Saulado — Implementation Plan & Roadmap

> **Learn in Context. Remember for Life.**

This document is the single source of truth for _what_ Saulado is, _what it is not_, and _in what order it gets built_. It is written to be executed sequentially by a small team or a solo developer.

- **Part 1 — Scope Analysis:** what we're actually committing to, and where the risk lives.
- **Part 2 — Architecture Decisions:** the handful of choices that are expensive to reverse later.
- **Part 3 — Phased Roadmap:** eight phases, each ending in something you can use.
- **Part 4 — Operating Notes:** risks, budgets, metrics, definition of done.

---

# Part 1 — Scope Analysis

## 1.1 What this product actually is

Stripped to its core, Saulado is three mechanisms bolted together:

| #   | Mechanism                                                                                    | Why it matters                                                              | Build risk |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| 1   | **Cloze engine** — turn highlighted spans of a paragraph into independently-gradeable blanks | This is the entire product differentiator. Everything else is table stakes. | **High**   |
| 2   | **Scheduler** — decide which cards a user sees today                                         | Determines whether the app works pedagogically                              | **Medium** |
| 3   | **A CRUD app with auth** — sets, cards, dashboard, search, settings                          | Necessary, well-understood, low novelty                                     | **Low**    |

The plan below front-loads (1), de-risks (2) with a proven algorithm, and treats (3) as commodity work that should be built fast and not over-engineered.

## 1.2 Complexity assessment

**Overall: Medium.** Not medium-high. The app has no realtime collaboration, no media pipeline, no multi-tenancy, and no complex permissions in v1. The single genuinely hard problem is text-offset management (§2.1), and it is hard in a _contained_ way — it's a pure function you can exhaustively unit-test in a day.

**Where effort actually goes** (rough proportions of total build):

```
Cloze engine + highlight editor   ████████████████░░░░░░░░  30%
Study mode + scheduler            ██████████░░░░░░░░░░░░░░  20%
CRUD (sets/cards/search)          ██████████░░░░░░░░░░░░░░  18%
Auth + account                    ██████░░░░░░░░░░░░░░░░░░  12%
Dashboard + progress              █████░░░░░░░░░░░░░░░░░░░  10%
Polish, a11y, perf, deploy        █████░░░░░░░░░░░░░░░░░░░  10%
```

The highlight editor is consistently underestimated. Browser text selection across a contenteditable surface, on mobile, with overlapping-edit prevention, is a multi-day problem on its own. It is called out as its own phase for that reason.

## 1.3 Scope contradictions found in the source docs

These need a decision before Phase 3. My recommendation is in the last column.

| #   | Conflict                                                                                                                                                        | Recommendation                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tags.** `objectives` lists Tags as a field on Study Card and as a search filter (v1). `CLAUDE.md` lists the tag system under _Future Feature Considerations_. | **Include in v1**, but as a simple `text[]` column on `study_cards`, not a `tags` + join-table system. Full normalization is a Phase 9 concern. Cost: ~half a day instead of ~3 days.                                                                                                        |
| 2   | **Notifications.** Listed under Settings (v1), but needs either an email provider or Web Push + service worker + permission UX.                                 | **Ship the settings toggle in v1, persisted, but no delivery.** Wire actual delivery in Phase 9. Do not let this leak into the MVP critical path.                                                                                                                                            |
| 3   | **Forgot Password.** Listed in v1 auth. Requires a transactional email provider — an external dependency and an account signup.                                 | **Include**, but provision the email provider in Phase 1 so it never blocks. Resend or Postmark; ~30 min of setup.                                                                                                                                                                           |
| 4   | **Cloud sync** listed as a _future_ feature.                                                                                                                    | Saulado is server-backed from day one, so sync is implicit. This line item only becomes real work if you later go **local-first/offline**. Reframe it as "Offline support" and treat it as a genuine future phase.                                                                           |
| 5   | **Quiz mode** (future) vs **Study mode** (v1).                                                                                                                  | Keep distinct: Study mode = spaced-repetition queue. Quiz mode = ad-hoc "test me on this whole set now" with no scheduling side effects. Quiz mode is cheap _if_ Study mode's session engine is built to accept a pluggable card-source (§2.4). Build that seam now, ship the feature later. |

## 1.4 Explicitly out of scope for v1

Restating so it's unambiguous: AI generation, PDF import, OCR, shared/public sets, offline mode, quiz mode, AI tutor, voice answering, mobile widgets, native apps, payments, teams/orgs, i18n.

## 1.5 Timeline

Estimates are in **focused engineering days** — not calendar days. Convert honestly.

| Cadence                  | Multiplier | MVP calendar time |
| ------------------------ | ---------- | ----------------- |
| Solo, full-time          | 1.0×       | ~11–13 weeks      |
| Solo, ~15 hrs/week       | 2.6×       | ~7 months         |
| Two devs (FE + BE split) | ~0.65×     | ~7–8 weeks        |

Totals per phase are given in Part 3. **Phases 0–5 are the MVP** (~48 focused days). Phases 6–7 are the difference between "works" and "people keep using it."

---

# Part 2 — Architecture Decisions

These are the decisions that are cheap now and expensive in month four.

## 2.1 ✦ The offset model (most important decision in the project)

**Store the paragraph as immutable plain text. Store answers as character ranges into it. Never store the rendered blanked text.**

```ts
// Persisted
interface StudyCard {
  id: string
  paragraph: string // NFC-normalized, immutable source of truth
  answers: CardAnswer[]
}

interface CardAnswer {
  id: string
  startOffset: number // inclusive, Unicode code points (NOT UTF-16 units)
  endOffset: number // exclusive
  answerText: string // denormalized == [...paragraph].slice(start,end).join('')
  ordinal: number // 0-based, ordered by startOffset
  altAnswers: string[] // optional accepted alternatives
}

// Derived at render time — never persisted
type Segment =
  { kind: 'text'; text: string } | { kind: 'blank'; ordinal: number; answerLength: number }

function renderCloze(paragraph: string, answers: CardAnswer[]): Segment[]
```

**Why:**

- Storing `displayText` with `____` baked in makes the original paragraph unrecoverable and makes editing a highlight a destructive operation.
- Character offsets survive re-rendering, theming, and mobile/desktop differences. HTML markers (`<mark>`) do not — they leak into search indexes and break on copy-paste.
- `answerText` is denormalized _deliberately_: it's the validation payload and a corruption tripwire. Assert `answerText === slice(paragraph, start, end)` on read; if it fails, the paragraph was edited without reconciliation.

**Invariants to enforce in code and in a DB check constraint:**

1. `0 <= startOffset < endOffset <= length(paragraph)`
2. Answers never overlap.
3. Answers are stored sorted by `startOffset`; `ordinal` matches that order.
4. An answer must not be pure whitespace.

**Use code points, not `String.length`.** `"café".length` is 4 or 5 depending on normalization; emoji and CJK will produce off-by-N bugs that only appear in user data. Normalize to NFC on write and index with `Array.from(paragraph)`.

**Editing an existing paragraph** is the nastiest edge case in the app. Policy: on paragraph edit, attempt to re-anchor each answer by searching for its `answerText` near its old offset; unmatched answers are surfaced to the user as "this highlight no longer matches — re-highlight or delete." Do not silently drop them. Budget a full day for this in Phase 3.

## 2.2 ✦ Split scheduling state from review history

`CLAUDE.md` puts `next_review` on the `Reviews` table. That means "what's due today?" becomes _"for each card, find its most recent review, then filter"_ — a correlated subquery or window function on the hottest path in the app.

**Split it:**

```sql
-- Current state: exactly one row per (user, card). Small, hot, indexed.
card_schedules (
  id, user_id, card_id,
  ease_factor   NUMERIC(3,2) NOT NULL DEFAULT 2.50,
  interval_days INTEGER      NOT NULL DEFAULT 0,
  repetitions   INTEGER      NOT NULL DEFAULT 0,
  lapses        INTEGER      NOT NULL DEFAULT 0,
  due_at        DATE         NOT NULL,
  last_reviewed_at TIMESTAMPTZ,
  UNIQUE (user_id, card_id)
)

-- Append-only log. Grows forever. Never read on the hot path.
reviews (
  id, user_id, card_id,
  grade        SMALLINT NOT NULL,   -- 0=again 1=hard 2=good 3=easy
  blank_results JSONB   NOT NULL,   -- [{ordinal, submitted, correct, matchType}]
  duration_ms  INTEGER,
  reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

The due-cards query then collapses to a single index scan:

```sql
CREATE INDEX idx_schedules_due ON card_schedules (user_id, due_at);
SELECT * FROM card_schedules WHERE user_id = $1 AND due_at <= CURRENT_DATE ORDER BY due_at LIMIT 50;
```

`blank_results` as JSONB is a deliberate trade: per-blank analytics without a fourth table. If per-blank querying becomes a real need, promote it then.

## 2.3 Full schema (v1)

```sql
users            (id, email UNIQUE CITEXT, password_hash, created_at, email_verified_at)
user_settings    (user_id PK/FK, dark_mode, daily_goal INT DEFAULT 20,
                  new_cards_per_day INT DEFAULT 10, notifications_enabled,
                  typo_tolerance BOOL, blank_width_mode TEXT, timezone TEXT)
password_resets  (id, user_id, token_hash, expires_at, used_at)
refresh_tokens   (id, user_id, token_hash, expires_at, revoked_at, user_agent)

study_sets       (id, user_id, title, description, color, archived_at, created_at, updated_at)
study_cards      (id, study_set_id, title, paragraph, tags TEXT[] DEFAULT '{}',
                  created_at, updated_at)
card_answers     (id, card_id, start_offset, end_offset, answer_text,
                  alt_answers TEXT[], ordinal)

card_schedules   (see §2.2)
reviews          (see §2.2)
user_daily_stats (user_id, day DATE, reviews_count, correct_count,
                  goal_met BOOL, PRIMARY KEY (user_id, day))
```

**`user_daily_stats` is a rollup, not a source of truth.** Streaks and dashboard charts read it; it's written transactionally alongside each review. Deriving streaks from `reviews` at read time works at 1k reviews and falls over at 100k. Make it reconstructible from `reviews` by a backfill script so a bug is never permanent data loss.

**Required indexes** (add these in the initial migration, not after the first slow query):

```sql
idx_sets_user            ON study_sets (user_id, updated_at DESC)
idx_cards_set            ON study_cards (study_set_id, created_at DESC)
idx_answers_card         ON card_answers (card_id, ordinal)
idx_schedules_due        ON card_schedules (user_id, due_at)
idx_reviews_user_date    ON reviews (user_id, reviewed_at DESC)
idx_cards_tags           ON study_cards USING GIN (tags)
idx_cards_fts            ON study_cards USING GIN (
                            to_tsvector('english', title || ' ' || paragraph))
```

**Streak semantics — decide once, write it down:** a streak day is a day (in the _user's_ timezone) with ≥1 review. Store `timezone` on settings; compute day boundaries server-side using it. Not doing this means every traveller and every non-UTC user gets a broken streak, and streaks are the single most emotionally load-bearing number in the app.

## 2.4 Session engine seam

Study mode should not query the database directly. Give it a **card source**:

```ts
interface CardSource {
  next(): Promise<SessionCard | null>
  size(): number
  onGraded(cardId: string, grade: Grade): Promise<void>
}
```

- `SpacedRepetitionSource` — due cards + capped new cards; `onGraded` writes schedule + review.
- `QuizSource` (Phase 9) — every card in a set, shuffled; `onGraded` is a no-op.
- `CrammingSource` (Phase 9) — cards you've recently failed.

One interface, ~20 lines, written in Phase 4. It converts a future feature from a rewrite into an afternoon.

## 2.5 Answer validation ladder

Normalize both sides, then walk the ladder and stop at the first hit:

```ts
function normalize(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'") // smart → straight quotes
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
}

type MatchType = 'exact' | 'alternative' | 'typo' | 'wrong'
```

1. `normalize(input) === normalize(answerText)` → **exact**
2. matches any `normalize(alt)` → **alternative**
3. `levenshtein(a, b) <= min(2, floor(len / 6))` → **typo** — counted correct, but the UI shows the exact spelling
4. otherwise → **wrong**

Typo tolerance must be **user-configurable and default ON**. Off by default punishes mobile typing; forced on is wrong for spelling-critical subjects (medical terms, foreign vocabulary). Threshold scales with length so short answers ("CPU") aren't matched by anything two edits away.

**Grading a multi-blank card:** all blanks correct → `good`; some correct → `hard`; none correct → `again`. Store every blank's individual result regardless.

## 2.6 SM-2 parameters

Follow `CLAUDE.md`'s `calculateNextReview`, with three additions that matter in practice:

- **Interval fuzz:** multiply the final interval by a random factor in `[0.95, 1.05]`. Without it, a big import creates a permanent review avalanche that recurs on the same days forever.
- **Interval cap:** 365 days. Beyond a year, SM-2's confidence isn't earned.
- **Lapse counter:** increment on every `again`. A card with `lapses >= 8` is a "leech" — surface it so the user can rewrite or delete it. Cheap to add, high user value.

## 2.7 Blank rendering

**Default to fixed-width blanks.** Sizing a blank to its answer's length leaks the answer — `_____` vs `______________` is a free hint, and it degrades recall. Offer `blank_width_mode: 'fixed' | 'proportional'` in settings for users who prefer the visual cue.

Whichever mode: **the blank's rendered width must equal the width of the revealed answer**, or the paragraph reflows on reveal and the user loses their place. Reserve the space.

## 2.8 Stack

`CLAUDE.md`'s stack stands. Resolving the "or" choices:

| Decision     | Pick                        | Reason                                                                                                                             |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| State        | **Zustand**                 | Redux Toolkit's ceremony isn't earned here; app state is a session object and a settings object. TanStack Query owns server state. |
| Backend      | **Express (or Fastify)**    | Nest's DI/module structure pays off on large teams. This is a small, well-bounded API.                                             |
| ORM          | **Prisma**                  | Best-in-class migrations and TS types. Drop to raw SQL for the FTS and dashboard aggregate queries — expected, not a failure.      |
| Editor       | **Custom over ProseMirror** | See below.                                                                                                                         |
| Server state | **TanStack Query**          | Not in the original stack. Add it. Caching, invalidation, and optimistic updates are otherwise hand-rolled three times.            |

**On the editor:** Slate/ProseMirror are rich-text document editors. Saulado does not edit rich text — it edits _plain text plus a set of ranges_. A `<textarea>` for composing, plus a read-only rendered overlay with `window.getSelection()` for highlighting, is smaller, faster, more accessible, and far easier to keep offset-correct than fighting a document model that wants to own the content. **Prototype this in Phase 1 (0.5 day).** If mobile selection proves unworkable, fall back to ProseMirror with a decision record — but don't pay that complexity tax before you know you owe it.

---

# Part 3 — Phased Roadmap

Every phase ends in something demonstrable. If a phase ends and you can't show it to someone, the phase was defined wrong.

```
Phase 0  Walking Skeleton ──┐
Phase 1  Cloze Engine ──────┤  ← both are prerequisites, can run in parallel
                            ↓
Phase 2  Auth + App Shell
                            ↓
Phase 3  Sets, Cards & the Highlight Editor   ★ first usable slice
                            ↓
Phase 4  Study Mode + Scheduler               ★ product is real here
                            ↓
Phase 5  Dashboard & Progress                 ★ MVP complete
                            ↓
Phase 6  Search, Tags & Settings
                            ↓
Phase 7  Polish: a11y, mobile, performance
                            ↓
Phase 8  Ship
```

---

## Phase 0 — Walking Skeleton

**3 days · Goal: one HTTP request travels browser → API → Postgres → browser, in CI, deployed.**

- [x] Monorepo: `frontend/`, `backend/`, `shared/` (pnpm workspaces or npm workspaces)
- [x] `shared/` package for types used by both sides — the single most valuable 20 lines of config in the repo
- [x] TypeScript **strict mode** everywhere, `noUncheckedIndexedAccess` on
- [x] Vite + React + Tailwind + shadcn/ui initialized
- [x] Express + Prisma + Postgres (Docker Compose for local)
- [x] `GET /api/health` → checks DB → rendered on a React page
- [x] ESLint + Prettier + a pre-commit hook
- [x] Vitest configured on both sides; one passing test each
- [x] GitHub Actions: typecheck + lint + test on every push
- [x] Deployed to staging (Vercel frontend + Render API + Neon Postgres)

**Done when:** a push to `main` auto-deploys a page showing live DB status.

**✅ COMPLETE — 2026-08-06.** Verified: an empty commit to `main` (`b5eba0e`) triggered
automatic deploys on both platforms, and the live page reports
`database: connected` with a 174.87 ms round-trip — a real `SELECT 1` against
Neon, not a config check.

Staging topology (Railway was dropped — its free tier no longer exists):

| Piece    | Platform | Note                                                                  |
| -------- | -------- | --------------------------------------------------------------------- |
| Frontend | Vercel   | static Vite build, `VITE_API_URL` → Render origin                     |
| API      | Render   | free plan, builds `backend/Dockerfile`, gated on `/api/ready`         |
| Postgres | Neon     | free tier is permanent; Render's own free DB is deleted after 90 days |

Free-plan caveat: the API sleeps after 15 min idle, so the next request takes
30–60 s. Fine for staging, not for a demo — warm it up first.

> Deploying in week one, not week sixteen, is deliberate. Deployment problems discovered at the end are schedule-destroying; discovered on day three they're a ten-minute fix.

---

## Phase 1 — Cloze Engine (pure, standalone)

**5 days · Goal: the core IP exists as a tested library with zero dependencies on React, Express, or the database.**

Build in `shared/src/cloze/`. No I/O. No framework. Just functions.

### 1.1 Core (2 days)

- [x] `toCodePoints(s)` / `sliceCodePoints(s, start, end)` — the offset primitives
- [x] `normalizeParagraph(s)` — NFC, normalize line endings, strip trailing whitespace
- [x] `createAnswer(paragraph, start, end)` → validates and returns a `CardAnswer`
- [x] `validateAnswers(paragraph, answers)` → enforces all four invariants from §2.1
- [x] `renderCloze(paragraph, answers)` → `Segment[]`
- [x] `reanchorAnswers(oldParagraph, newParagraph, answers)` → `{ matched, orphaned }`

### 1.2 Validation (1.5 days)

- [x] `normalize(s)` per §2.5
- [x] `levenshtein(a, b)` — bounded early-exit variant, not the naive full matrix
- [x] `checkAnswer(input, answer, opts)` → `{ correct: boolean; matchType: MatchType }`
- [x] `gradeCard(blankResults)` → `Grade`

### 1.3 Scheduler (0.5 day)

- [x] `calculateNextReview(...)` per `CLAUDE.md` + fuzz, cap, and lapse counter (§2.6)

### 1.4 Editor spike (0.5 day)

- [x] Throwaway prototype: `<textarea>` + selection overlay, on desktop Chrome/Safari **and a real phone**
      — verified on Android; all 8 checks passed, spike deleted after acceptance
- [x] Write the decision (custom vs ProseMirror) into `docs/adr/0001-editor.md`
      — Accepted: Option A (native Selection API), ProseMirror/Slate rejected

### 1.5 Test suite (0.5 day)

Non-negotiable cases:

- [x] Answer at index 0; answer at the very end of the paragraph
- [x] Two adjacent answers with no gap between them
- [x] Multi-word answer spanning punctuation (`"HyperText Markup Language"`)
- [x] Accented characters, emoji, CJK — offsets must be code-point correct
- [x] Empty / whitespace-only selection → rejected
- [x] Overlapping ranges → rejected
- [x] Answer text containing the blank placeholder characters themselves
- [x] Windows `\r\n` line endings in pasted content
- [x] `renderCloze` round-trip: rendering then reconstructing yields the original paragraph
- [x] Every worked example from the objectives doc, verbatim, as a test case

**Done when:** `npm test` is green, coverage on `shared/src/cloze/` is >95%, and you can paste the CPU/RAM example into a Node REPL and get two independently gradeable blanks.

**Status — 2026-08-06: ✅ COMPLETE. All three criteria met.**

| Criterion                       | State  | Evidence                                                                                                              |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm test` green                | ✅ met | 179 tests pass (`pnpm -w run verify`): 172 shared, 3 frontend, 4 backend                                              |
| Coverage on `shared/src/cloze/` | ✅ met | **100%** statements / functions / lines, 97.95% branches — gate enforced at 95% in `shared/vitest.config.ts`          |
| CPU/RAM → two gradeable blanks  | ✅ met | `shared/src/cloze/done-when.test.ts` — 11 assertions covering render, independent grading, and the resulting schedule |

Phase 1.4's real-device gate closed on Android: all 8 checks in
`docs/adr/0001-editor.md` §5 passed, including handle-dragging (test 3), which
the risk table flagged as the interaction most likely to fail on touch. ADR 0001
is **Accepted** — Option A, native Selection API, no editor dependency. The
spike (`frontend/src/spike/`, the `#spike` route, `docs/SPIKE_1_4.md`) has been
deleted; it is recoverable from commit `3d0e729`.

The coverage gate is enforced, not eyeballed: `pnpm --filter @saulado/shared test:coverage`
fails the build below 95%. The remaining uncovered branches are
`if (!previous || !current) continue` guards that exist only to satisfy
`noUncheckedIndexedAccess` and are unreachable at runtime.

**Carried into Phase 3:** the mobile test was single-device (Android). A pass on
iOS Safari is worth doing before the real editor ships — WebKit's selection
handles behave differently from Blink's.

> This is the phase to be slow and thorough in. A bug here surfaces as corrupted user data six weeks later, and there is no clean migration back.

---

## Phase 2 — Auth & App Shell

**6 days · Goal: register, log in, land on an (empty) dashboard, stay logged in across a refresh.**

### 2.1 Backend (3 days)

- [x] `POST /api/auth/register` — bcrypt ≥12 rounds, email uniqueness, password policy
- [x] `POST /api/auth/login` — access JWT (15 min) + refresh token
- [x] `POST /api/auth/refresh`, `POST /api/auth/logout` (revokes the refresh token)
- [x] `POST /api/auth/forgot-password` / `reset-password` — single-use, 1-hour token, **hash the token in the DB**
- [x] Email provider wired (Resend/Postmark) — swappable seam built; the logging adapter
      is the default and works end to end. Set `RESEND_API_KEY` to reach a real inbox.
- [x] `requireAuth` middleware
- [x] Rate limiting on all auth routes (`express-rate-limit`, 5/15min per IP+email)
- [x] Zod validation on every request body; a shared error-response shape
- [x] Helmet, CORS allowlist, request-body size limit

**Refresh tokens go in an `httpOnly; Secure; SameSite=Strict` cookie.** Access token in memory only. `localStorage` for either is an XSS-to-account-takeover pipeline.

> **Deviation, deliberate:** production ships `SameSite=None`, not `Strict`. The frontend
> is on Vercel and the API on Render, and a `Strict` cookie is simply not sent on a
> cross-site request — refresh would never work in production. `SameSite` was the CSRF
> defence, so it is replaced with an explicit Origin allowlist check. Full reasoning in
> [`docs/PHASE_2.md` §4.2](docs/PHASE_2.md). Put the API on a subdomain of the app and
> `COOKIE_SAMESITE=strict` becomes correct again.

### 2.2 Frontend (3 days)

- [x] React Router v6 with a `<ProtectedRoute>` wrapper
- [x] Register / Login / Forgot / Reset pages
- [x] Auth store (Zustand) + TanStack Query client with a 401 → silent-refresh interceptor
- [x] App shell: nav, responsive layout, dark mode via `class` strategy + `prefers-color-scheme`
- [x] Toast system, error boundary, 404 page
- [x] Empty dashboard with real skeleton loaders

**Done when:** you can register, close the tab, reopen it, and still be logged in — and a wrong password is rate-limited.

**Status — 2026-08-07: ✅ COMPLETE.** All 15 checkpoints done, done-when verified in a
browser.

| Criterion                        | State  | Evidence                                                                                     |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Register → reopen tab → still in | ✅ met | One `/refresh` on mount returns 200; no login screen. `AuthStatus` is 3-state, not a boolean |
| Wrong password rate-limited      | ✅ met | 5 attempts then 429 + `retryAfter: 900`, keyed on IP **and** email                           |
| Tests green                      | ✅ met | **292** passing: 191 shared, 9 frontend, 92 backend (`pnpm verify`)                          |

Commits: `5e71052` (backend) · `7b7818f` (frontend) · `f4b0cb7` (docs + CI env gap) ·
`e3b3a21` (`strictPort`, verification gotchas) · `9d47b47` (92 backend auth tests).

Backend auth coverage went from 4 health tests to 92 — rotation and
family-revocation-on-reuse, the reset flow, the non-oracle guarantees on login and
forgot-password, and every rate limiter. Written before Phase 3 on purpose: Phase 3
layers `user_id` scoping on top of auth it assumes is already sound.

**Carried into Phase 3:** the Phase 1.4 mobile selection test was Android-only. An iOS
Safari pass is worth doing before the real editor ships — WebKit's selection handles
behave differently from Blink's.

---

## Phase 3 — Sets, Cards & the Highlight Editor ★

**12 days · Goal: the first genuinely usable slice — write a paragraph, highlight words, see the blanks.**

This is the biggest phase in the project. Do not compress it.

### 3.1 Study Sets (2 days)

- [x] `GET/POST/PATCH/DELETE /api/sets` (+ cursor pagination, `?archived=`)
- [x] Every query scoped by `user_id` — write an integration test that proves user A gets a 404, not a 403, on user B's set
- [x] List view with card counts; create/edit dialog; delete with confirmation
- [ ] ~~Due counts in the list~~ — deferred to Phase 4. There is no `card_schedules` table yet, so a due count would be a hardcoded zero pretending to be data.
- [x] Empty state that teaches the core concept rather than saying "No study sets"

### 3.2 Cards API (2 days)

- [x] `POST /api/sets/:id/cards` — body is `{ title, paragraph, answers: [{start, end}], tags }`
- [x] **The server recomputes `answerText` from offsets. Never trust client-supplied answer text.**
- [x] Server-side `validateAnswers` — reject invalid ranges with a field-level error
- [x] `GET /api/cards/:id`, `PATCH`, `DELETE`; `GET /api/sets/:id/cards` (paginated)
- [x] Paragraph length cap (5,000 chars) and answers-per-card cap (20), enforced both sides

### 3.3 Highlight Editor (5 days) — the hard part

- [x] **Compose mode:** plain `<textarea>`, autosize, paste-safe, debounced draft persistence to `localStorage`
- [x] **Highlight mode:** rendered read-only paragraph; `window.getSelection()` → code-point offsets
- [x] Selection → offset mapping that survives the DOM splitting text nodes at highlight boundaries
- [x] Visual highlight with a numbered badge per answer
- [x] Click/tap a highlight → popover to remove it or add alternative answers
- [x] Reject overlapping selections with an inline explanation, not a silent no-op
- [x] **Mobile:** long-press selection + a "Highlight selection" action bar pinned above the keyboard
- [ ] Test on a real iOS Safari and a real Android Chrome — **not done.** jsdom cannot exercise selection handles; this needs two physical devices. Carried forward with the Phase 1.4 debt below.
- [x] **Keyboard:** select with Shift+arrows, `Ctrl/Cmd+H` to highlight, Tab through existing highlights, Delete to remove
- [x] Live preview pane showing the generated question
- [x] Paragraph-edit reconciliation flow (§2.1) with clear UI for orphaned highlights

### 3.4 Card views (2 days)

- [x] Card list within a set — paragraph preview, tags, blank count
- [ ] ~~Card detail with an original ↔ blanked toggle~~ — the editor's Write/Highlight tabs plus its Preview pane already show both forms of the same card, so a third read-only view would be a second place to maintain the same rendering. Revisit if shared/public sets need a non-editable view.
- [ ] ~~Due state in the list~~ — deferred with due counts to Phase 4.
- [x] Edit flow reusing the same editor
- [ ] Bulk select → delete / move to another set — **not done.** Deferred: it needs a `PATCH /api/cards/:id/move` or a batch endpoint that does not exist yet, and single-card delete covers the common case.

### 3.5 Tags (1 day)

- [x] `text[]` column, tag input with autocomplete from the user's existing tags
- [x] `GET /api/tags` — distinct tags with counts

**Done when:** you can paste _"The CPU is the brain of the computer and RAM stores temporary data"_, highlight both terms, save, and see the card render with two blanks — on your phone.

**Status — 2026-08-08: ✅ COMPLETE** (with four items deferred, listed below).

| Criterion                         | State         | Evidence                                                                                                                             |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Paste → highlight → save → render | ✅ met        | End-to-end in the editor. `answerText` is derived server-side from offsets; `cards.test.ts` asserts a client-supplied one is ignored |
| Two blanks from one paragraph     | ✅ met        | Ordinals are positional, not submission order — proven in `useCardDraft.test.ts` and `cards.test.ts`                                 |
| A → B isolation is 404, not 403   | ✅ met        | 6 cross-user tests across `sets.test.ts` / `cards.test.ts`, including `GET /api/tags`                                                |
| Tests green                       | ✅ met        | **491** passing: 205 shared, 143 frontend, 143 backend. Typecheck, lint and format clean                                             |
| On your phone                     | ⚠️ unverified | Touch paths are built (`selectionchange`, pinned action bar) but not exercised on a physical device                                  |

Sub-phases: 3.0a shared contracts · 3.0b schema + migration · 3.0c sets/cards API ·
3.0d backend integration tests · 3.1a selection→offset mapping · 3.1b highlight editor ·
3.1c services + query hooks · 3.1d sets & cards UI · 3.1e verify + document.

**Deferred, deliberately:**

| Item                                    | Why                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Due counts / due state                  | Needs Phase 4's `card_schedules`. A zero rendered as data is worse than no column |
| Bulk select → delete / move             | Needs a move or batch endpoint that does not exist yet                            |
| Standalone card detail + toggle         | The editor's Write/Highlight tabs and Preview pane already show both forms        |
| Real-device iOS Safari / Android Chrome | jsdom cannot exercise selection handles; needs two physical devices               |

The last one now carries **two** debts: this phase's, and the Phase 1.4 mobile test that was
Android-only. Both want the same session on real hardware.

See `docs/PHASE_3.md` for the gotchas — the badge-offset corruption bug above all.
To check it by hand, `docs/PHASE_3_TEST_CHECKLIST.md` gives every step and its
expected result.

---

## Phase 4 — Study Mode & Scheduler ★

**10 days · Goal: Saulado becomes a study app rather than a note-taking app.**

### 4.1 Session backend (3 days)

- [x] `CardSource` interface + `SpacedRepetitionSource` (§2.4)
- [x] `POST /api/study/sessions` — `{ setId? }`, returns session + first batch of cards
- [x] Queue: due cards (`due_at <= today`, oldest first), then up to `new_cards_per_day` unseen cards, interleaved ~1 new per 4 reviews
- [x] `POST /api/study/sessions/:id/answers` — grades server-side, updates `card_schedules`, appends to `reviews`, updates `user_daily_stats`, **all in one transaction**
- [x] `POST /api/study/sessions/:id/complete` → session summary
- [x] Idempotency key on answer submission so a double-tap can't double-count
- [x] `GET /api/study/due` — the counts behind the dashboard and the library badges. Not in the original list; the study affordances have to come from somewhere, and a per-set count is the only way a Study button can honestly say what is waiting

**Grade on the server, not the client.** Client-side grading means the answer ships to the browser before the user submits — trivially inspectable in devtools, and it makes cheating the default rather than an effort.

### 4.2 Study UI (5 days)

- [x] Card presentation: paragraph as the visual focus, blanks as inline inputs
- [x] Auto-focus blank 0; Tab / Enter advance between blanks; Enter on the last blank submits
- [x] **Zero layout shift** between the input state and the revealed state (§2.7)
- [x] Per-blank feedback: correct (green), typo-accepted (amber + correct spelling shown), wrong (red + answer revealed)
- [x] "Reveal answers" escape hatch → grades as `again`
- [x] Progress: `7 / 24`, plus a thin progress bar
- [x] Session summary: accuracy, time, cards seen, cards to revisit, "study again" CTA
- [x] Interruption recovery — refreshing mid-session must not lose progress
- [x] Study entry points: dashboard panel, per-set Study badges, `/study?set=<id>`. Implied by the phase rather than listed — a session backend with no way in is not a study mode
- [ ] ~~Keyboard shortcuts overlay (`?`)~~ — deferred. There are two shortcuts, both named in a line under the card. An overlay listing two things is a second place to keep them correct

### 4.3 Scheduling polish (2 days)

- [x] Wire `calculateNextReview` with fuzz/cap/lapses
- [x] Daily review cap (setting) so a backlog doesn't present 400 cards
- [x] Overdue prioritization: sort by `due_at`, tie-break by `lapses DESC`
- [x] Leech detection at `lapses >= 8`
- [x] Timezone-correct day boundaries (§2.3)
- [x] Integration test: simulate 90 days of reviews, assert intervals grow as expected and nothing is orphaned

**Done when:** you study a set, get it wrong, and the card is due tomorrow; get it right repeatedly, and it's due in a month.

**Status — 2026-08-08: ✅ COMPLETE** (one item deferred, listed above).

| Criterion                          | Result | Evidence                                                                                                                            |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Wrong → due tomorrow               | ✅ met | `again` resets `interval_days` to 1 with no fuzz, and increments `lapses`. `grading.test.ts` plus `study.answers.test.ts`           |
| Right repeatedly → due in a month  | ✅ met | 1 → 6 → ~15 → ~37 days. `simulation.test.ts` runs a synthetic learner for 90 days and asserts the ladder rather than one review     |
| No answer text reaches the browser | ✅ met | Asserted against `JSON.stringify(session)`, not a text query — a leak into a `value` or `data-` attribute would pass `queryByText`  |
| Zero layout shift on reveal        | ✅ met | Input and graded span share `calc(${answerLength}ch + 1rem)`; every blank on a card shares one width. `BlankSlot.test.tsx`          |
| A → B isolation is 404, not 403    | ✅ met | Every study route takes a session id from the URL, which is the shape an IDOR takes. Cross-user tests on read, answer, and complete |
| Tests green                        | ✅ met | **652** passing: 240 shared, 226 backend, 186 frontend. Typecheck, lint and format clean                                            |

Full write-up in [docs/PHASE_4.md](./docs/PHASE_4.md); the manual pass is
[docs/PHASE_4_TEST_CHECKLIST.md](./docs/PHASE_4_TEST_CHECKLIST.md).

**Deferred, with reasons:**

| Item                          | Why it waits                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Keyboard shortcuts overlay    | Two shortcuts, both already named under the card. An overlay is a second place for them to go stale           |
| Undo on a submitted answer    | Needs a compensating write across three tables. The re-queue softens a mistype, which covers the common case  |
| `exact` blank width in the UI | `settings.ts` supports it, but shipping it means shipping a mode that leaks answer lengths by design          |
| Acting on a leech             | Detection is wired and surfaced in the summary. Suspending cards is a scheduling policy Phase 5 can decide on |

**Carried into Phase 5:** `user_daily_stats` is written on every review and read by
nothing. The streak inputs are accumulating now, so Phase 5's progress views have real
history to render rather than starting from the day they ship.

---

## Phase 5 — Dashboard & Progress ★ _(MVP complete)_

**7 days**

### 5.0 Shared progress contracts

- [x] `shared/src/progress/` — `DayStat`, `StreakSummary`, `DashboardResponse`, `ProgressResponse`, the `ProgressRange` enum
- [x] `fillDaySeries` (dense windows) and `accuracyPercent` (`null` for zero reviews, never 0)

### 5.1 Backend (2 days)

- [x] `GET /api/dashboard` — one request returning due count, streak, today's progress vs goal, recent sets, 7-day sparkline. **One request, not six.**
- [x] `GET /api/progress?range=30d` — daily counts, accuracy trend, per-set breakdown
- [x] Streak calculation from `user_daily_stats`, timezone-aware
- [x] Backfill script that rebuilds `user_daily_stats` from `reviews` — dry run by default, `--apply` to write

### 5.2 Frontend (5 days)

- [x] Dashboard: due-today hero with a single dominant "Start studying" CTA, streak, daily-goal ring, recent sets, quick-create
- [x] Progress page: reviews-per-day chart, accuracy trend, per-set table, contribution heatmap
- [x] Streak states that are honest and non-punitive — "2 days" and "Start a streak today" both read fine; avoid loss-framing
- [x] Genuine empty states for a brand-new user (no zeroed charts)
- [x] ~~Charts: Recharts or `visx`~~ — hand-rolled instead, see [ADR 0002](./docs/adr/0002-charts.md). The accessible table, the colour-blind-safe ramp and the touch behaviour are ours to write either way; the library would have supplied `value / max * 100`. `prefers-reduced-motion` is met by construction (nothing animates), contrast in both themes, intensity by lightness not hue.

**Done when:** a new user can go signup → create set → create card → study → see the result on the dashboard, with no dead ends.

**Status — 2026-08-08: ⚠️ CODE COMPLETE, UNVERIFIED.**

Every sub-phase above is written and on disk, including the tests. **None of it has
been typechecked or run** — the shell has been unavailable for the whole of the
session that finished it, so `tsc`, `vitest` and `lint` have not executed once
against any Phase 5 file. Treat the checkboxes as "written", not "working".

What stands in for the gate so far is a read-only review: every Prisma field
cross-checked against `schema.prisma`, every `@saulado/shared` import against its
definition, the router wiring in `app.ts`, and a hand-trace of the `TrendChart`
fixture against the render structure its test asserts. That review found two wrong
doc comments and no code defects, which is weaker evidence than a green suite and
should not be mistaken for it.

| Criterion                               | Result         | Evidence                                                                                 |
| --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Signup → set → card → study → dashboard | ⏳ unverified  | Written end to end; Part L of the checklist is the manual pass                           |
| No dead ends                            | ⏳ unverified  | Every empty and error state carries a CTA; asserted in tests that have not run           |
| Tests green                             | ⏳ **not run** | Target ≥ 676 before the new Phase 5 suites (240 → 264 shared, 226 backend, 186 frontend) |

**To close this out**, in dependency order — shared must build first, since both
consumers resolve `@saulado/shared` to `./dist`:

```bash
pnpm --filter @saulado/shared build
pnpm --filter @saulado/backend exec tsc --noEmit
pnpm --filter @saulado/frontend typecheck
pnpm --filter @saulado/backend test -- --run
pnpm --filter @saulado/frontend test -- --run
pnpm lint
```

Then the manual pass in
[docs/PHASE_5_TEST_CHECKLIST.md](./docs/PHASE_5_TEST_CHECKLIST.md) — Part B (a
genuinely fresh account shows no zeroed charts) and Part E.4 (a rest day gaps the
accuracy line rather than dipping it to zero) are the two most likely to be broken
and least likely to be noticed. Full write-up in
[docs/PHASE_5.md](./docs/PHASE_5.md).

**No migration.** Phase 5 adds no tables and no columns; every number is derived
from what Phase 4 already writes.

**Carried into Phase 6:**

| Item                                   | Note                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `longest` is window-scoped to 400 days | Understated for a run older than that, never overstated                                                  |
| `goalMet` cannot be rebuilt            | The review log does not record the day's goal, so the backfill can only promote it, never clear it       |
| No per-set filter on `/progress`       | The table lists every set studied in the window; there is no way to chart one set alone                  |
| Heatmap has no year navigation         | `365d` is the last 365 days, not a calendar year                                                         |
| Per-set query fetches all card ids     | One query, but it grows with the library. The fix when it matters is a grouped join through `study_sets` |

---

## Phase 6 — Search, Settings & Account

**5 days**

- [ ] Postgres FTS over `title + paragraph` with a GIN index and `ts_headline` snippets
- [ ] Filters: set, tags, date range, due state; sort by relevance / recency
- [ ] Global search (`Cmd/Ctrl+K`) with debounced input and keyboard nav
- [ ] Settings: dark mode, daily goal, new-cards/day, typo tolerance, blank width, timezone, notification toggle (stored only)
- [ ] Account: change email (with re-verification), change password, **export all data as JSON**, delete account (hard delete, cascading, with typed confirmation)

> Export and delete aren't polish. They're GDPR/CCPA obligations the moment you have a real user, and both are ~2 hours if the schema is clean.

---

## Phase 7 — Polish: Accessibility, Mobile, Performance

**8 days.** Use the `/saulado-ux` and `/saulado-perf` skills throughout this phase.

### 7.1 Accessibility (3 days) — target WCAG 2.1 AA

- [ ] Full keyboard operability, visible focus rings on every interactive element
- [ ] Screen-reader pass on the study flow: blanks announce as "blank 1 of 3", results via `aria-live="polite"`
- [ ] The highlight editor needs a keyboard-only path — assume `getSelection()` is unavailable
- [ ] 4.5:1 contrast in both themes; never colour-only feedback (pair with icons/text)
- [ ] `prefers-reduced-motion` honoured; skip-to-content link; correct heading hierarchy
- [ ] axe-core in CI + one manual VoiceOver/NVDA run of the study flow

### 7.2 Mobile (2 days)

- [ ] 320px → 1440px verified at every breakpoint
- [ ] ≥44×44px touch targets; primary actions in thumb reach
- [ ] Keyboard-aware layout during study (`visualViewport`) — the submit button must never hide behind the keyboard
- [ ] `inputmode`, `autocapitalize="off"`, `autocorrect="off"` on answer inputs — autocorrect silently rewriting an answer is a rage-quit bug
- [ ] Real-device testing on iOS Safari + Android Chrome

### 7.3 Performance (3 days) — measure first

- [ ] Bundle analysis; route-level code splitting; charts and the editor lazy-loaded
- [ ] Budgets: initial JS <180 KB gzipped, LCP <2.0s on 4G, INP <200ms
- [ ] Virtualize card lists past ~100 items
- [ ] `EXPLAIN ANALYZE` every dashboard and study query; confirm index usage
- [ ] Prefetch the next study card while the current one is being answered — the single highest-impact perceived-speed win in the app
- [ ] Kill N+1s (Prisma `include`, or `DataLoader`)
- [ ] Optimistic UI on answer submission
- [ ] p95 API latency <200ms under a seeded 10k-card account

---

## Phase 8 — Ship

**4 days**

- [ ] Production infra: managed Postgres w/ automated backups, **restore tested at least once**
- [ ] Sentry (FE + BE), structured logging, uptime monitoring
- [ ] Privacy-respecting analytics (Plausible/Umami) on the activation funnel
- [ ] Security pass: `npm audit`, dependency review, OWASP top-10 walkthrough, verify authorization on every endpoint
- [ ] Load test: 100 concurrent study sessions
- [ ] Legal: privacy policy, terms
- [ ] Onboarding: a 3-step first-run flow with a pre-made demo set
- [ ] Cross-browser: Chrome, Safari, Firefox, Edge
- [ ] `README`, `CONTRIBUTING`, OpenAPI spec, ADRs

**MVP total: Phases 0–5 ≈ 43 focused days. Through Phase 8 ≈ 60.**

---

## Post-MVP

| Phase  | Theme                                                                                             | Notes                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **9**  | Quiz mode, cramming mode, leech management, Anki/CSV import & export, notification delivery       | Quiz/cram are cheap because of the §2.4 seam                                                 |
| **10** | AI: highlight suggestions, distractor generation, difficulty estimation, long-paragraph splitting | Use the Anthropic API. Suggestions only — the user always confirms. Never auto-create cards. |
| **11** | Sharing: public sets, clone-to-my-library, browse/search directory                                | Needs a real permissions model — this is where multi-tenancy complexity finally arrives      |
| **12** | Ingestion: PDF import, OCR, URL clipping                                                          | Highest infra cost, highest user-perceived magic                                             |
| **13** | Offline-first: local SQLite/IndexedDB + sync, PWA, native shells                                  | This is what the "cloud sync" line item in the objectives actually means                     |

---

# Part 4 — Operating Notes

## 4.1 Risk register

| Risk                                               | Sev      | Signal it's happening                                | Mitigation                                                                                                                         |
| -------------------------------------------------- | -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Highlight editor doesn't work acceptably on mobile | **High** | Phase 1.4 spike is frustrating on a real phone       | Spike in Phase 1, not Phase 3. Fallback: word/phrase tap-to-select instead of free selection — arguably better UX on touch anyway. |
| Offset corruption from Unicode or paragraph edits  | **High** | Off-by-one blanks on any non-ASCII content           | Code-point offsets; DB check constraints; the `answerText` tripwire; the Phase 1.5 test suite                                      |
| Scheduler feels wrong (too many / too few cards)   | Med      | You stop using your own app                          | Daily caps + interval fuzz; make `new_cards_per_day` user-visible from day one                                                     |
| Scope creep from the "future features" list        | Med      | Phase 4 slipping while an AI feature gets prototyped | Part 1.4 is a contract. Log ideas, don't build them.                                                                               |
| Solo-dev burnout on an 11-week build               | Med      | Phases stop closing                                  | Phase 3 exists so you have something usable at week 4 rather than week 11                                                          |
| Timezone/streak bugs                               | Low-Med  | Users report broken streaks                          | Store user timezone in Phase 2; test with a non-UTC user in Phase 4                                                                |

## 4.2 Performance budgets

| Metric                                   | Budget                          |
| ---------------------------------------- | ------------------------------- |
| Initial JS (gzip)                        | < 180 KB                        |
| LCP (4G, mid-tier Android)               | < 2.0 s                         |
| INP                                      | < 200 ms                        |
| API p95                                  | < 200 ms                        |
| Study card → next card                   | < 100 ms perceived (prefetched) |
| Lighthouse: Perf / A11y / Best Practices | ≥ 90 / ≥ 95 / ≥ 95              |
| DB: any query on the study path          | < 50 ms                         |

## 4.3 Success metrics

**Activation (the one that matters):** % of signups who create a card _and_ complete one study session within 24h. Target **>40%**. Everything upstream of that number is a vanity metric.

**Retention:** D7 ≥ 25%, D30 ≥ 12%. For a study app, D30 is the real signal — spaced repetition only pays off if people come back.

**Product health:** median time from "paste paragraph" to "card saved" < 60 s; session completion rate > 70%; median answer accuracy 70–85% (below 70% = scheduler too aggressive; above 85% = too conservative).

## 4.4 Definition of done (every phase)

1. Feature works on desktop **and a real phone**
2. Unit tests on logic; integration tests on endpoints
3. Keyboard-operable; screen-reader-sane
4. Loading, empty, and error states all exist
5. No TypeScript `any`; no console errors
6. Authorization verified — a second user cannot reach the first user's data
7. Deployed to staging and used for real for at least a day

## 4.5 Testing strategy

- **Unit** (Vitest): cloze engine, validation, scheduler, date/timezone math. This is where most of the value is — the pure functions are the risky code.
- **Integration** (Supertest + test DB): every endpoint, incl. an authz test per resource.
- **E2E** (Playwright, ~6 tests total): signup→first card, create card w/ multiple blanks, full study session, paragraph-edit reconciliation, search, account deletion.

Don't chase a coverage number app-wide. Do hold `shared/src/cloze/` above 95%.

## 4.6 Immediate next steps

1. Decide the five items in §1.3 (30 minutes — do it before writing code)
2. Phase 0, day 1: scaffold the monorepo and get `/api/health` green in CI
3. Phase 0, day 3: staging deploy live
4. Phase 1, day 1: `shared/src/cloze/` — start with `renderCloze` and its tests
5. Phase 1, day 5: the editor spike, on a real phone, with a written ADR

**First milestone (end of week 2):** a fully tested cloze engine and a deployed, authenticated empty shell. From there the app only accumulates.

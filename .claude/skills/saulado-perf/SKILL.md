---
name: saulado-perf
description: Performance and efficiency rules for Saulado — frontend bundle, render cost, API latency, and Postgres query shape. Read BEFORE writing or reviewing a database query, a Prisma call, an API endpoint, a list that can grow, a route, a chart import, or any study-session data fetch. Triggers on - "slow", "optimize", "performance", "latency", "bundle size", "code splitting", "lazy load", "virtualize", "pagination", "N+1", "index", "EXPLAIN", "query", "prefetch", "cache", "TanStack Query", "re-render", "memo", "Lighthouse", "LCP", "INP". Also read when adding any endpoint that runs on the study or dashboard path.
---

# Saulado Performance

**Measure first.** Every optimization in this file is justified by a number. If you can't name the metric you're moving, you're guessing — and guessed optimizations cost readability permanently while buying nothing.

The study loop is the hot path. A 300ms stall between cards is felt on every single card, dozens of times per session. Everything else can be slow-ish; that cannot.

---

## Budgets (from `IMPLEMENTATION_PLAN.md` §4.2)

| Metric                      | Budget             |
| --------------------------- | ------------------ |
| Initial JS (gzip)           | < 180 KB           |
| LCP (4G, mid-tier Android)  | < 2.0 s            |
| INP                         | < 200 ms           |
| API p95                     | < 200 ms           |
| Study card → next card      | < 100 ms perceived |
| Any query on the study path | < 50 ms            |
| Lighthouse Perf / A11y / BP | ≥ 90 / ≥ 95 / ≥ 95 |

Test against a **seeded 10k-card account**, not an empty dev database. Every query is fast with 12 rows.

---

## 1. Database — where the real wins are

### 1.1 Never query `reviews` on the hot path

This is the single most consequential perf decision in the app (§2.2). `reviews` is an append-only log that grows forever. `card_schedules` holds exactly one row per (user, card).

```sql
-- WRONG: correlated subquery over an ever-growing log
SELECT * FROM cards c WHERE (
  SELECT next_review FROM reviews WHERE card_id = c.id
  ORDER BY reviewed_at DESC LIMIT 1
) <= CURRENT_DATE;

-- RIGHT: single index scan, constant cost as history grows
SELECT * FROM card_schedules
WHERE user_id = $1 AND due_at <= CURRENT_DATE
ORDER BY due_at LIMIT 50;
```

If you find yourself reading `reviews` outside of analytics or a backfill script, stop and reconsider.

### 1.2 Indexes ship with the initial migration

Not after the first slow query. Required set:

```sql
idx_sets_user         ON study_sets (user_id, updated_at DESC)
idx_cards_set         ON study_cards (study_set_id, created_at DESC)
idx_answers_card      ON card_answers (card_id, ordinal)
idx_schedules_due     ON card_schedules (user_id, due_at)   -- hottest index in the app
idx_reviews_user_date ON reviews (user_id, reviewed_at DESC)
idx_cards_tags        ON study_cards USING GIN (tags)
idx_cards_fts         ON study_cards USING GIN (to_tsvector('english', title || ' ' || paragraph))
```

### 1.3 `EXPLAIN ANALYZE` every study and dashboard query

Confirm index usage. A `Seq Scan` on `card_schedules` or `study_cards` is a defect, not a preference.

### 1.4 Kill N+1s

Loading a card list then fetching answers per card is the obvious one. Use Prisma `include`, or batch.

```ts
// WRONG — 1 + N queries
const cards = await prisma.studyCard.findMany({ where: { studySetId } })
for (const c of cards) c.answers = await prisma.cardAnswer.findMany({ where: { cardId: c.id } })

// RIGHT — 1 query
const cards = await prisma.studyCard.findMany({
  where: { studySetId },
  include: { answers: { orderBy: { ordinal: 'asc' } } },
})
```

Log query counts per request in dev. A card-list request should be 1–2 queries regardless of page size.

### 1.5 One request per screen

`GET /api/dashboard` returns due count, streak, today's progress, recent sets, and the 7-day sparkline in **one** response. Six round-trips on a 4G connection is ~600ms of pure latency before rendering starts.

### 1.6 Rollups, not recomputation

`user_daily_stats` is written transactionally alongside each review. Deriving streaks from `reviews` at read time works at 1k reviews and collapses at 100k. Keep a backfill script so a bug is recoverable.

### 1.7 One transaction per answer submission

Schedule update + review append + daily-stats update commit together. Plus an idempotency key so a double-tap can't double-count. This is correctness _and_ perf — it's one round-trip instead of three.

---

## 2. The study loop

### 2.1 Prefetch the next card

**The single highest-impact perceived-speed win in the app.** While the user answers card N, card N+1 is already in memory. Card transitions become instant.

```ts
// as card N renders
queryClient.prefetchQuery({ queryKey: ['session', id, index + 1], queryFn: ... })
```

Or return cards in batches of ~10 from the session endpoint and paginate client-side. Either works; doing neither means every card costs a network round-trip.

### 2.2 Optimistic submission

Show per-blank feedback immediately from client-side comparison, then reconcile with the server verdict. The user never waits on the network to learn they were right.

**Caveat that overrides this:** grading is authoritative **on the server** — the answer must not ship to the browser before submission, or it's readable in devtools and cheating becomes the default. Optimistic UI here means optimistically rendering _the submission_, not pre-shipping answers. If the design conflicts, correctness wins.

### 2.3 Don't re-render the paragraph on every keystroke

Each blank owns its own input state. Typing in blank 2 must not re-render blanks 1 and 3 or the surrounding text segments.

```tsx
const Blank = memo(function Blank({ ordinal, ... }) { /* owns its own state */ })
```

Verify with React DevTools Profiler: one keystroke → one component updates.

---

## 3. Frontend

### 3.1 Route-level code splitting

```ts
const StudySession = lazy(() => import('./features/study/StudySession'))
const Progress = lazy(() => import('./features/dashboard/Progress'))
const CardEditor = lazy(() => import('./features/cards/CardEditor'))
```

**Charts and the highlight editor are lazy-loaded, always.** A charting library is 50–150 KB that a user studying on their phone never needs to download.

### 3.2 Analyze before you optimize

`rollup-plugin-visualizer` on every build. Check the treemap before adding a dependency, not after the bundle doubles. Date libraries, icon sets, and chart libraries are the usual culprits — import individual icons, never the barrel.

### 3.3 Virtualize lists past ~100 items

Card lists, search results, review history. `@tanstack/react-virtual`. Below 100 items it's unnecessary complexity; above ~500 it's the difference between usable and not.

### 3.4 Cursor pagination, not offset

`OFFSET 10000` makes Postgres scan 10,000 rows to discard them. Cursor on `(created_at, id)`.

### 3.5 TanStack Query owns server state

Don't mirror server data into Zustand — you'll hand-roll caching and invalidation three times and get it subtly wrong each time. Zustand holds session state and settings; TanStack Query holds everything that came from the API.

Set `staleTime` deliberately. Settings and set lists tolerate minutes. Due counts don't.

### 3.6 Debounce

Search input and card-draft persistence: 300ms. Every keystroke hitting the API is both a latency problem and a cost problem.

---

## 4. Where NOT to optimize

Effort spent here is effort not spent on the study loop:

- Micro-optimizing the cloze engine. It runs on paragraphs under 5,000 chars, in microseconds. Clarity beats cleverness — this is the code most likely to harbour a data-corrupting bug.
- `memo`-ing every component. Memoization has its own cost and obscures the real hotspots.
- Caching layers (Redis) before measuring. Postgres with correct indexes handles this workload at small scale comfortably.
- Bundle golf below the 180 KB budget. Under budget is done.

---

## Review checklist

- [ ] New query `EXPLAIN ANALYZE`d, index confirmed, no `Seq Scan` on a large table
- [ ] Study path doesn't touch `reviews`
- [ ] No N+1 (query count logged and checked)
- [ ] Screen data comes from one request, not several
- [ ] Lists >100 items virtualized; pagination is cursor-based
- [ ] New route lazy-loaded; charts and editor not in the initial bundle
- [ ] Bundle checked against the 180 KB budget
- [ ] Next study card prefetched
- [ ] Keystroke in one blank re-renders only that blank
- [ ] Verified against a seeded 10k-card account, not an empty dev DB

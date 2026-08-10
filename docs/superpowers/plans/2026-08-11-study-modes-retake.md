# Study Modes & Retake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two explicitly chosen set-scoped study methods — Memorization (creation order) and Review (shuffled) — plus a practice-only retake pass for cards the user left blank.

**Architecture:** Three new `CardSource` implementations (`SequentialSource`, `ShuffledSource`, `RetakeSource`) alongside the existing `SpacedRepetitionSource`, selected by a new `study_sessions.mode` column. The queue is built and persisted server-side exactly as today; the client only walks it. A new `GradeVerdict.record` field gates whether a graded answer writes a `Review` row, which is what makes the retake pass leave no trace.

**Tech Stack:** TypeScript, Express 4, Prisma 6 + Postgres, zod 3, Vitest 3, React 18 + Vite (web), React Native 0.86 / Expo 57 (mobile), TanStack Query 5, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-11-study-modes-retake-design.md`

## Global Constraints

- **Answers must never reach the client before submission.** `SessionCard` carries `segments`, never `paragraph` + `answers` (`shared/src/study/types.ts:4-16`). Any new response shape obeys this.
- **The client never orders or reorders a queue.** Order is decided in a `CardSource`, written to `study_session_cards.position`, and read back from those rows. A client-side shuffle would break resume.
- **Grading is server-side.** No `grade` field in any request schema (`backend/src/routes/study.schemas.ts:4-12`).
- **One study route.** `/study`, scoped by query params. No new routes, per ADR §4.10.
- **`answers: { some: {} }` filter is load-bearing.** A card with no highlights grades `again` forever and cannot be escaped (`backend/src/study/session.ts:113-119`). Every card query in this plan keeps it.
- **Card ordering never ties on `createdAt` alone.** A bulk import shares `created_at` to the millisecond; always tiebreak on `cardId` (`backend/src/study/card-source.ts:103-106`).
- **Package manager is `pnpm`.** Run tests from the package root: `cd backend && pnpm test`.
- **Backend tests need a live Postgres.** `backend/src/test/helpers.ts` registers real users; `docker-compose up -d` first if it is not running.
- Mode strings are exactly `spaced` | `sequential` | `shuffled` | `retake`. User-facing labels are "Memorization" and "Review" — never the internal strings.

---

## File Structure

**Created:**

| File                                                       | Responsibility                                  |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `shared/src/study/queue.test.ts`                           | Unit tests for `shuffle`                        |
| `backend/prisma/migrations/<ts>_study_modes/migration.sql` | Enum + two columns                              |
| `backend/src/study/pool.ts`                                | Whole-subtree card loader for the two new modes |
| `frontend/src/features/study/ModePicker.tsx`               | The two-card mode chooser                       |
| `mobile/components/mode-picker.tsx`                        | Mobile equivalent                               |

**Modified:**

| File                                                                                       | Change                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `shared/src/study/queue.ts`                                                                | `shuffle`, `Rng`                                                                              |
| `shared/src/study/index.ts`                                                                | Export the above                                                                              |
| `shared/src/study/types.ts`                                                                | `SessionMode`, `StudySession.mode`, `SessionSummary.unanswered`, `StartSessionRequest` fields |
| `backend/prisma/schema.prisma`                                                             | Enum + two columns                                                                            |
| `backend/src/study/card-source.ts`                                                         | `GradeVerdict.record`, three new source classes, `verdictFor`                                 |
| `backend/src/study/session.ts`                                                             | Mode-aware resume + source switch + `mode` in `getSession` + `unanswered` in summary          |
| `backend/src/study/grading.ts`                                                             | Verdict by mode, `hadEmptyBlank`, `record`/`reschedule` gates                                 |
| `backend/src/routes/study.schemas.ts`                                                      | `mode`, `retakeOf`                                                                            |
| `backend/src/routes/study.ts`                                                              | Pass the new fields through                                                                   |
| `frontend/src/services/study.ts`                                                           | `startSession` argument shape                                                                 |
| `frontend/src/features/study/queries.ts`                                                   | `useStartSession` variables type                                                              |
| `frontend/src/features/study/StudySessionPage.tsx`                                         | Picker gate, retake wiring                                                                    |
| `frontend/src/features/study/SessionSummaryView.tsx`                                       | Retake prompt block                                                                           |
| `mobile/app/(app)/study.tsx`, `mobile/lib/api.ts`, `mobile/components/session-summary.tsx` | Mobile mirror                                                                                 |

**Task order rationale:** shared types and `shuffle` first (everything depends on them), then the schema, then sources (pure, fully testable), then the two service files that consume sources, then routes, then clients. Each task ends green.

---

### Task 1: `shuffle` in shared

Cherry-picks the Fisher-Yates helper that already exists on the `worktree-sets-ui-and-shuffle` branch. That branch's `card-source.ts` change is deliberately **not** taken — it shuffles the spaced queue unconditionally, which is out of scope (spec §11).

**Files:**

- Modify: `shared/src/study/queue.ts` (append after `interleaveNew`, around line 85)
- Modify: `shared/src/study/index.ts`
- Test: `shared/src/study/queue.test.ts` (create)

**Interfaces:**

- Consumes: nothing
- Produces: `shuffle<T>(items: readonly T[], rng?: Rng): T[]`, `type Rng = () => number`

- [ ] **Step 1: Write the failing test**

Create `shared/src/study/queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shuffle } from './queue.js'

/**
 * The shuffle is tested with a pinned `rng` rather than by asserting "the output
 * differs from the input" — that assertion passes by luck one run in n! and is
 * exactly the kind of flake nobody debugs.
 */
describe('shuffle', () => {
  it('returns a permutation of the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = shuffle(input, () => 0.5)

    expect([...result].sort()).toEqual([...input].sort())
    expect(result).toHaveLength(input.length)
  })

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c']
    shuffle(input, () => 0.99)

    expect(input).toEqual(['a', 'b', 'c'])
  })

  it('produces a pinned order for a pinned rng', () => {
    // rng always 0 sends every swap to index 0, which rotates the array.
    expect(shuffle(['a', 'b', 'c', 'd'], () => 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([], () => 0.5)).toEqual([])
    expect(shuffle(['only'], () => 0.5)).toEqual(['only'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd shared && pnpm vitest run src/study/queue.test.ts`
Expected: FAIL — `shuffle` is not exported from `./queue.js`.

- [ ] **Step 3: Implement `shuffle`**

Append to `shared/src/study/queue.ts`, after `interleaveNew` (line 85) and before the `REQUEUE_GAP` docblock:

```ts
/** Returns a float in `[0, 1)`. Injectable so a test can pin the order. */
export type Rng = () => number

/**
 * Fisher-Yates, on a copy.
 *
 * Two reasons the shuffle is a real algorithm rather than a sort on a random
 * key: an unbiased shuffle is one pass instead of a comparator that is asked to
 * be inconsistent (which `Array.sort` is entitled to turn into any permutation,
 * including a barely-shuffled one), and `rng` being a parameter is what lets the
 * tests assert a specific order instead of asserting "not the input order" and
 * flaking one run in `n!`.
 *
 * Randomising a queue does not make a resumed session reorder: the built queue
 * is written to `study_session_cards.position` at session start, and every later
 * read comes back from those rows rather than from a rebuild.
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = result[i]
    const b = result[j]
    // Indices are in range by construction; the guard is for `noUncheckedIndexedAccess`.
    if (a !== undefined && b !== undefined) {
      result[i] = b
      result[j] = a
    }
  }

  return result
}
```

- [ ] **Step 4: Export it**

In `shared/src/study/index.ts`, find the line exporting from `./queue.js` and add `shuffle` to the value exports and `Rng` to the type exports. The file uses explicit named exports, so append to the existing lists rather than adding a new statement.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd shared && pnpm vitest run src/study/queue.test.ts`
Expected: PASS, 4 tests.

Then the existing suite, to confirm nothing regressed:
Run: `cd shared && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/study/queue.ts shared/src/study/index.ts shared/src/study/queue.test.ts
git commit -m "feat(shared): add Fisher-Yates shuffle with injectable rng"
```

---

### Task 2: Shared types for modes

Type-only. Nothing consumes these yet, so the "test" is the typecheck.

**Files:**

- Modify: `shared/src/study/types.ts`

**Interfaces:**

- Consumes: Task 1 (nothing directly)
- Produces:
  - `type SessionMode = 'spaced' | 'sequential' | 'shuffled' | 'retake'`
  - `StudySession.mode: SessionMode`
  - `SessionSummary.mode: SessionMode`
  - `SessionSummary.unanswered: SessionCardRef[]`
  - `StartSessionRequest.mode?: StartableMode`, `.retakeOf?: string`
  - `type StartableMode = 'spaced' | 'sequential' | 'shuffled'`

- [ ] **Step 1: Add the mode types**

In `shared/src/study/types.ts`, immediately after the module docblock (line 16) and before the `// ── The queue ──` banner:

```ts
// ── Modes ───────────────────────────────────────────────────────────────────

/**
 * How a session picks and orders its cards.
 *
 * - `spaced` — due cards plus interleaved new ones, capped. The scheduler's own
 *   session, reached from the dashboard.
 * - `sequential` — every card in the set subtree, in creation order. "Learn this
 *   set top to bottom."
 * - `shuffled` — the same pool, randomised. Tests recall rather than sequence.
 * - `retake` — a practice pass over the cards a prior session left blank.
 *   Records nothing.
 */
export type SessionMode = 'spaced' | 'sequential' | 'shuffled' | 'retake'

/**
 * The modes a client may ask for by name.
 *
 * `retake` is absent deliberately: a retake session is derived from
 * `retakeOf`, so a client cannot start one over an arbitrary pool and have it
 * silently skip recording.
 */
export type StartableMode = Exclude<SessionMode, 'retake'>
```

- [ ] **Step 2: Add `mode` to `StudySession`**

In the `StudySession` interface (line 56-64), after `studySetId`:

```ts
/** Which source built this queue. Needed to resume into the right mode. */
mode: SessionMode
```

- [ ] **Step 3: Add `mode` and `unanswered` to `SessionSummary`**

In `SessionSummary` (line 156-172), immediately after the `toRevisit` field:

```ts
  /**
   * Which method produced this session.
   *
   * The summary screen reads it to caption a practice pass honestly: a retake's
   * Cards and Correct tiles are real counts of a pass that changed nothing, and
   * without a caption they read as progress the user did not earn.
   */
  mode: SessionMode

  /**
   * Cards the user left at least one blank empty on — the retake candidates.
   *
   * Distinct from {@link SessionSummary.toRevisit}, which is about *grades*: a
   * card answered wrong is worth revisiting but was attempted, and the user
   * already has their verdict on it. These were not attempted at all, which is
   * a different offer ("finish these") and a different pass (practice only).
   *
   * Always empty for a `retake` session — nothing it does is recorded, so there
   * is nothing to build a second list from.
   */
  unanswered: SessionCardRef[]
```

- [ ] **Step 4: Extend `StartSessionRequest`**

Replace the `StartSessionRequest` interface (line 176-179) with:

```ts
export interface StartSessionRequest {
  /** Omit to study every set. Required for `sequential` and `shuffled`. */
  studySetId?: string
  /** Defaults to `spaced` server-side. */
  mode?: StartableMode
  /**
   * Start a retake pass over this session's unanswered cards.
   *
   * Mutually exclusive with `mode` — the server derives `retake` from this,
   * rather than trusting a client to name a mode that records nothing.
   */
  retakeOf?: string
}
```

- [ ] **Step 5: Typecheck**

Run: `cd shared && pnpm typecheck`
Expected: PASS.

Run: `cd backend && pnpm typecheck`
Expected: **FAIL** — `session.ts` and `grading.ts` build `StudySession` and `SessionSummary` objects that now lack `mode` and `unanswered`. This is the correct failing state; Tasks 4-6 fix it.

- [ ] **Step 6: Commit**

```bash
git add shared/src/study/types.ts
git commit -m "feat(shared): add SessionMode and retake types"
```

---

### Task 3: Schema — mode and hadEmptyBlank

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<generated>/migration.sql` (via the CLI, not by hand)

**Interfaces:**

- Consumes: Task 2 (`SessionMode` string union must match the enum values exactly)
- Produces: `StudySession.mode`, `StudySessionCard.hadEmptyBlank` on the Prisma client

⚠️ There is **uncommitted schema drift** in the working tree: `nickname` and `profileImage` were added to `UserSettings` with no migration. Check `git diff backend/prisma/schema.prisma` before starting. If that drift is still present, `prisma migrate dev` will try to fold it into your migration. Either commit/migrate it separately first, or confirm with the user. Do not silently ship it inside this migration.

- [ ] **Step 1: Add the enum**

In `backend/prisma/schema.prisma`, near the other enums (or directly above `model StudySession`):

```prisma
/// Which source built a session's queue. See `shared/src/study/types.ts`.
enum SessionMode {
  spaced
  sequential
  shuffled
  retake

  @@map("session_mode")
}
```

- [ ] **Step 2: Add the columns**

In `model StudySession` (schema.prisma:385-400), after `studySetId`:

```prisma
  mode SessionMode @default(spaced)
```

In `model StudySessionCard` (schema.prisma:413-436), after `correct`:

```prisma
  /// At least one blank was submitted empty — the retake trigger.
  hadEmptyBlank Boolean @default(false) @map("had_empty_blank")
```

`@default(spaced)` and `@default(false)` are what make this migration safe on existing rows: every current session backfills as `spaced`, which is what it was.

- [ ] **Step 3: Generate the migration**

Run: `cd backend && pnpm prisma migrate dev --name study_modes`
Expected: a new folder under `backend/prisma/migrations/`, and `prisma generate` runs automatically.

- [ ] **Step 4: Verify the generated SQL**

Read the generated `migration.sql`. It must contain `CREATE TYPE "session_mode"`, `ALTER TABLE "study_sessions" ADD COLUMN "mode"`, and `ALTER TABLE "study_session_cards" ADD COLUMN "had_empty_blank"`. It must **not** contain any `user_settings` changes — if it does, stop; the drift from the warning above got folded in.

- [ ] **Step 5: Confirm the client regenerated**

Run: `cd backend && pnpm typecheck`
Expected: still fails on `session.ts` / `grading.ts` (from Task 2), but **not** on `session.mode` being unknown to Prisma. If Prisma still doesn't know the field, run `pnpm prisma generate`.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add session mode and had_empty_blank"
```

---

### Task 4: `GradeVerdict.record` and the three sources

The heart of the feature. Pure logic, no Prisma, fully unit-testable.

**Files:**

- Modify: `backend/src/study/card-source.ts`
- Test: `backend/src/study/card-source.test.ts` (extend)

**Interfaces:**

- Consumes: `shuffle`, `Rng` (Task 1); `SessionMode` (Task 2)
- Produces:
  - `GradeVerdict.record: boolean`
  - `interface GradeInput { grade: Grade; attempts: number; hadEmptyBlank: boolean; isDue: boolean; correct: boolean }`
  - `class SequentialSource` — `new SequentialSource({ cards })`
  - `class ShuffledSource` — `new ShuffledSource({ cards, rng? })`
  - `class RetakeSource` — `new RetakeSource({ cards })`
  - `interface PoolCard { cardId: string; studySetId: string; createdAt: Date }`
  - `verdictFor(mode: SessionMode, input: GradeInput): GradeVerdict`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/study/card-source.test.ts`. The existing file already defines `due()`, `fresh()` and `options` at the top — reuse them; add `pool()` below them.

```ts
import {
  RetakeSource,
  SequentialSource,
  ShuffledSource,
  verdictFor,
  type PoolCard,
} from './card-source.js'

function pool(cardId: string, createdAt: string): PoolCard {
  return { cardId, studySetId: 'set-1', createdAt: new Date(`${createdAt}T00:00:00.000Z`) }
}

describe('SequentialSource', () => {
  it('orders by creation date, oldest first', () => {
    const source = new SequentialSource({
      cards: [pool('c', '2026-03-01'), pool('a', '2026-01-01'), pool('b', '2026-02-01')],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a creation-date tie on card id', () => {
    // A bulk import shares created_at to the millisecond, so without this the
    // order is whatever Postgres returns and "resume" can reorder the queue.
    const source = new SequentialSource({
      cards: [pool('z', '2026-01-01'), pool('a', '2026-01-01'), pool('m', '2026-01-01')],
    })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['a', 'm', 'z'])
  })

  it('marks every card as not new', () => {
    // isNew drives a UI badge that means "never studied". A sequential drill
    // over a whole set says nothing about whether a card has been seen.
    const source = new SequentialSource({ cards: [pool('a', '2026-01-01')] })

    expect(source.build()[0]?.isNew).toBe(false)
  })

  it('reports its kind and totals', () => {
    const source = new SequentialSource({
      cards: [pool('a', '2026-01-01'), pool('b', '2026-02-01')],
    })

    expect(source.kind).toBe('sequential')
    expect(source.total()).toBe(2)
    expect(source.size()).toBe(2)
    expect(source.next()?.cardId).toBe('a')
    expect(source.size()).toBe(1)
  })
})

describe('ShuffledSource', () => {
  it('returns every card exactly once', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => pool(id, '2026-01-01'))
    const source = new ShuffledSource({ cards, rng: () => 0.5 })

    expect(
      source
        .build()
        .map((slot) => slot.cardId)
        .sort(),
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('produces a pinned order for a pinned rng', () => {
    const cards = ['a', 'b', 'c', 'd'].map((id) => pool(id, '2026-01-01'))
    const source = new ShuffledSource({ cards, rng: () => 0 })

    // Sorted by (createdAt, cardId) first, then rotated by the all-zero rng.
    expect(source.build().map((slot) => slot.cardId)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('numbers positions from zero regardless of order', () => {
    const cards = ['a', 'b', 'c'].map((id) => pool(id, '2026-01-01'))
    const source = new ShuffledSource({ cards, rng: () => 0 })

    expect(source.build().map((slot) => slot.position)).toEqual([0, 1, 2])
  })
})

describe('RetakeSource', () => {
  it('keeps the order it was handed', () => {
    // The rows come from the prior session already ordered by position; a
    // retake re-walks that pass rather than inventing a new order.
    const source = new RetakeSource({ cards: ['c', 'a', 'b'] })

    expect(source.build().map((slot) => slot.cardId)).toEqual(['c', 'a', 'b'])
    expect(source.kind).toBe('retake')
  })
})

describe('verdictFor', () => {
  const base = {
    grade: 'good' as const,
    attempts: 1,
    hadEmptyBlank: false,
    isDue: true,
    correct: true,
  }

  it('records and reschedules in spaced mode', () => {
    expect(verdictFor('spaced', base)).toEqual({ requeue: false, reschedule: true, record: true })
  })

  it('requeues a wrong answer in spaced mode, as today', () => {
    expect(verdictFor('spaced', { ...base, grade: 'again', correct: false }).requeue).toBe(true)
  })

  it('never reschedules in sequential mode', () => {
    expect(verdictFor('sequential', base)).toEqual({
      requeue: false,
      reschedule: false,
      record: true,
    })
  })

  it('requeues a wrong answer in sequential mode', () => {
    expect(verdictFor('sequential', { ...base, grade: 'again', correct: false }).requeue).toBe(true)
  })

  it('does not requeue a blank, in either new mode', () => {
    // D8: a blank is held for the end-of-session retake prompt instead.
    for (const mode of ['sequential', 'shuffled'] as const) {
      const verdict = verdictFor(mode, {
        ...base,
        grade: 'again',
        correct: false,
        hadEmptyBlank: true,
      })

      expect(verdict.requeue).toBe(false)
    }
  })

  it('lets a blank beat a wrong answer on the requeue decision', () => {
    // A card can be both: two blanks filled wrong, a third left empty.
    const verdict = verdictFor('sequential', {
      ...base,
      grade: 'again',
      correct: false,
      hadEmptyBlank: true,
      attempts: 1,
    })

    expect(verdict.requeue).toBe(false)
  })

  it('reschedules a due card in shuffled mode whether right or wrong', () => {
    expect(verdictFor('shuffled', { ...base, isDue: true, correct: true }).reschedule).toBe(true)
    expect(
      verdictFor('shuffled', { ...base, isDue: true, correct: false, grade: 'again' }).reschedule,
    ).toBe(true)
  })

  it('never punishes a not-due card answered wrong in shuffled mode', () => {
    // D4: the card keeps its existing next_review rather than resetting to
    // tomorrow. Drilling ahead must not be able to damage the schedule.
    expect(
      verdictFor('shuffled', { ...base, isDue: false, correct: false, grade: 'again' }).reschedule,
    ).toBe(false)
  })

  it('still rewards a not-due card answered correctly in shuffled mode', () => {
    expect(verdictFor('shuffled', { ...base, isDue: false, correct: true }).reschedule).toBe(true)
  })

  it('records nothing at all in retake mode', () => {
    expect(verdictFor('retake', base)).toEqual({
      requeue: false,
      reschedule: false,
      record: false,
    })
  })

  it('records nothing in retake mode even for a wrong answer', () => {
    expect(
      verdictFor('retake', { ...base, grade: 'again', correct: false, hadEmptyBlank: true }),
    ).toEqual({ requeue: false, reschedule: false, record: false })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pnpm vitest run src/study/card-source.test.ts`
Expected: FAIL — `SequentialSource` etc. are not exported.

- [ ] **Step 3: Add `record` to `GradeVerdict`**

In `backend/src/study/card-source.ts`, extend the interface (lines 38-49):

```ts
/** What a source decides after a card is graded. */
export interface GradeVerdict {
  /** Show the card again later in this same session. */
  requeue: boolean
  /**
   * Write the new SM-2 state to `card_schedules`.
   *
   * False for a sequential drill, and for a card that was not actually due —
   * studying ahead should not be able to reset a schedule the user has earned.
   */
  reschedule: boolean
  /**
   * Write a `Review` row and roll up daily stats.
   *
   * False only for `retake`, which is an explicitly practice-only pass: the
   * blank the user is finishing was already graded and counted when they left
   * it blank, and counting the finish too would let one card book two reviews.
   */
  record: boolean
}
```

- [ ] **Step 4: Update `SpacedRepetitionSource.verdict`**

The static at line 160-162 becomes:

```ts
  static verdict(grade: Grade, attempts: number): GradeVerdict {
    return { requeue: shouldRequeue(grade, attempts), reschedule: true, record: true }
  }
```

- [ ] **Step 5: Add `PoolCard` and the three sources**

Append to `backend/src/study/card-source.ts`. Import `shuffle` and `Rng` by extending the existing import from `@saulado/shared` at line 2, and add `import type { SessionMode } from '@saulado/shared'`.

```ts
/**
 * A card from a whole-set pool.
 *
 * Distinct from {@link CandidateCard}: the two new modes do not rank by due date
 * or lapses at all, so carrying `dueAt`/`lapses` here would be four fields of
 * scheduling state that nothing in these sources reads.
 */
export interface PoolCard {
  cardId: string
  studySetId: string
  createdAt: Date
}

/** Creation order, tie-broken on id so the same pool always builds the same queue. */
function byCreation(a: PoolCard, b: PoolCard): number {
  const delta = a.createdAt.getTime() - b.createdAt.getTime()
  if (delta !== 0) return delta
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0
}

/** Walks a fixed list of card ids. Shared by all three whole-set sources. */
abstract class FixedQueueSource implements CardSource {
  abstract readonly kind: SessionMode

  protected queue: QueueSlot[] | null = null
  private cursor = 0

  abstract build(): QueueSlot[]

  next(): QueueSlot | null {
    const queue = this.build()
    return this.cursor < queue.length ? (queue[this.cursor++] ?? null) : null
  }

  size(): number {
    return Math.max(0, this.build().length - this.cursor)
  }

  total(): number {
    return this.build().length
  }

  abstract onGraded(cardId: string, grade: Grade, attempts: number): GradeVerdict

  /**
   * `isNew` is false for every card in a whole-set pool.
   *
   * The flag drives a "first time seeing this" badge, and a drill over an entire
   * set says nothing about whether the user has met a given card — it did not
   * consult `card_schedules` to build the queue.
   */
  protected toSlots(cardIds: readonly string[]): QueueSlot[] {
    return cardIds.map((cardId, position) => ({ cardId, position, isNew: false }))
  }
}

/**
 * Every card in the set, in the order they were written.
 *
 * The point is learning a set the way its author laid it out — chapter order,
 * argument order, chronology. That is also its weakness, which is what
 * {@link ShuffledSource} is for: sequence becomes a cue, and a card recalled
 * because it follows the last one was not really recalled.
 */
export class SequentialSource extends FixedQueueSource {
  readonly kind = 'sequential' as const

  constructor(private readonly options: { cards: readonly PoolCard[] }) {
    super()
  }

  build(): QueueSlot[] {
    this.queue ??= this.toSlots([...this.options.cards].sort(byCreation).map((c) => c.cardId))
    return this.queue
  }

  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return verdictFor('sequential', {
      grade,
      attempts,
      hadEmptyBlank: false,
      isDue: false,
      correct: grade !== 'again',
    })
  }
}

/**
 * Every card in the set, randomised.
 *
 * Sorted before shuffling so an all-zero test `rng` has something deterministic
 * to permute — the sort costs nothing and makes the ordering tests pinnable.
 */
export class ShuffledSource extends FixedQueueSource {
  readonly kind = 'shuffled' as const

  constructor(private readonly options: { cards: readonly PoolCard[]; rng?: Rng }) {
    super()
  }

  build(): QueueSlot[] {
    this.queue ??= this.toSlots(
      shuffle(
        [...this.options.cards].sort(byCreation).map((c) => c.cardId),
        this.options.rng,
      ),
    )
    return this.queue
  }

  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return verdictFor('shuffled', {
      grade,
      attempts,
      hadEmptyBlank: false,
      isDue: false,
      correct: grade !== 'again',
    })
  }
}

/**
 * The cards a prior session left blank, in that session's order.
 *
 * Handed ids rather than rows because the ordering decision was already made —
 * re-sorting here would present the retake in a different order than the pass
 * it is finishing, for no gain.
 */
export class RetakeSource extends FixedQueueSource {
  readonly kind = 'retake' as const

  constructor(private readonly options: { cards: readonly string[] }) {
    super()
  }

  build(): QueueSlot[] {
    this.queue ??= this.toSlots(this.options.cards)
    return this.queue
  }

  onGraded(_cardId: string, grade: Grade, attempts: number): GradeVerdict {
    return verdictFor('retake', {
      grade,
      attempts,
      hadEmptyBlank: false,
      isDue: false,
      correct: grade !== 'again',
    })
  }
}
```

- [ ] **Step 6: Add `GradeInput` and `verdictFor`**

Also in `card-source.ts`, after the `GradeVerdict` interface:

```ts
/** Everything a mode needs to decide what a graded answer means. */
export interface GradeInput {
  grade: Grade
  /** Attempts *including* this one. */
  attempts: number
  /** At least one blank was submitted empty. */
  hadEmptyBlank: boolean
  /** The card's schedule was due on or before today — false for a card with no schedule row. */
  isDue: boolean
  correct: boolean
}

/**
 * What a grade means, per mode.
 *
 * A lookup table rather than a chain of `if (mode === …)` through the grading
 * transaction. Grading holds a session row and a grade, not a built queue, so it
 * cannot ask a source instance — and constructing one around empty card lists
 * just to reach `onGraded` would read as though the queue mattered here.
 *
 * The rules, and why:
 *
 * - **A blank never requeues** in the two new modes. It goes to the retake list
 *   instead, which is the whole feature: an unanswered card is a different thing
 *   from a wrong one and gets a different offer.
 * - **Sequential never reschedules.** Walking a set in order means the sequence
 *   is carrying part of the recall, so the result is not honest evidence about
 *   any single card.
 * - **Shuffled reschedules a *due* card either way, and a not-due card only when
 *   it was answered correctly.** Studying ahead should be able to earn a longer
 *   interval and must never be able to reset one — otherwise drilling a set the
 *   day before an exam would drop every card in it back to a one-day interval.
 * - **Retake decides nothing at all.** The blank was already graded and counted
 *   when the user left it blank.
 */
export function verdictFor(mode: SessionMode, input: GradeInput): GradeVerdict {
  const { grade, attempts, hadEmptyBlank, isDue, correct } = input
  const requeue = !hadEmptyBlank && shouldRequeue(grade, attempts)

  switch (mode) {
    case 'spaced':
      return { requeue: shouldRequeue(grade, attempts), reschedule: true, record: true }
    case 'sequential':
      return { requeue, reschedule: false, record: true }
    case 'shuffled':
      return { requeue, reschedule: isDue || correct, record: true }
    case 'retake':
      return { requeue: false, reschedule: false, record: false }
  }
}
```

Note `spaced` keeps the _unmodified_ requeue rule — a blank in the scheduler's own session behaves exactly as it does today. Only the two new modes hold blanks back.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && pnpm vitest run src/study/card-source.test.ts`
Expected: PASS — the pre-existing `SpacedRepetitionSource` cases plus the new ones. If the existing `verdict` cases fail on a missing `record` key, update those assertions to include `record: true`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/study/card-source.ts backend/src/study/card-source.test.ts
git commit -m "feat(study): add sequential, shuffled and retake card sources"
```

---

### Task 5: The whole-set card pool

`loadCandidates` is due-only and stays that way. The new modes need a sibling.

**Files:**

- Create: `backend/src/study/pool.ts`
- Test: covered by Task 7's integration tests (a query needs a database; a unit test here would only assert that Prisma was called with an object)

**Interfaces:**

- Consumes: `PoolCard` (Task 4)
- Produces:
  - `loadSetPool(userId: string, studySetId: string): Promise<PoolCard[]>`
  - `loadRetakePool(userId: string, sessionId: string): Promise<{ cardIds: string[]; studySetId: string | null }>`

- [ ] **Step 1: Write the module**

Create `backend/src/study/pool.ts`:

```ts
import { prisma } from '../db/client.js'
import { ApiError } from '../http/errors.js'
import { subtreeIds } from '../routes/set-tree.js'
import type { PoolCard } from './card-source.js'

/**
 * Card pools for the explicitly-chosen study modes.
 *
 * Separate from `loadCandidates` in `session.ts`, which is due-only by design.
 * Memorization and Review are deliberate drills over a whole set — filtering
 * them to what the scheduler thinks is due would make "study this set" quietly
 * mean "study the eleven cards of it that are due", which is the one thing the
 * user did not ask for.
 */

/**
 * Every studiable card in a set and its descendants.
 *
 * `answers: { some: {} }` is the load-bearing filter, exactly as in
 * `loadCandidates`: a card saved without highlights grades `again` forever, so
 * including one puts a card in the queue that no amount of knowing the material
 * can clear.
 *
 * Archived descendants are included. Asking for a set by id is an explicit
 * override — the same rule the due-based path already applies.
 */
export async function loadSetPool(userId: string, studySetId: string): Promise<PoolCard[]> {
  const rows = await prisma.studyCard.findMany({
    where: {
      studySetId: { in: await subtreeIds(userId, studySetId) },
      answers: { some: {} },
    },
    select: { id: true, studySetId: true, createdAt: true },
  })

  return rows.map((row) => ({
    cardId: row.id,
    studySetId: row.studySetId,
    createdAt: row.createdAt,
  }))
}

/**
 * The cards a prior session left blank, in that session's presentation order.
 *
 * Ownership is checked on the *session*, not on the cards: a retake is defined
 * by "the pass I just finished", so a session id belonging to someone else is a
 * 404 for the same reason every other session route treats it as one — a 403
 * would confirm the row exists, which is all id enumeration needs.
 */
export async function loadRetakePool(
  userId: string,
  sessionId: string,
): Promise<{ cardIds: string[]; studySetId: string | null }> {
  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: {
      studySetId: true,
      cards: {
        where: { hadEmptyBlank: true },
        orderBy: { position: 'asc' },
        select: { cardId: true },
      },
    },
  })

  if (!session) throw new ApiError('NOT_FOUND', 'That study session could not be found.')

  return {
    cardIds: session.cards.map((card) => card.cardId),
    studySetId: session.studySetId,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && pnpm typecheck`
Expected: still fails in `session.ts`/`grading.ts` from Task 2, but `pool.ts` itself must report no errors. Confirm no error line references `pool.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/study/pool.ts
git commit -m "feat(study): add whole-set and retake card pools"
```

---

### Task 6: Grading — mode-aware verdicts

**Files:**

- Modify: `backend/src/study/grading.ts:45-201`
- Test: `backend/src/routes/study.answers.test.ts` (extended in Task 8, once sessions can be started in a mode)

**Interfaces:**

- Consumes: `verdictFor`, `GradeInput` (Task 4); `SessionMode` (Task 2); `hadEmptyBlank` column (Task 3)
- Produces: `submitAnswer` unchanged in signature; `AnswerResponse` unchanged

- [ ] **Step 1: Select the session's mode**

In `submitAnswer`, the session lookup at line 51-54 currently selects `{ id, completedAt }`. Add `mode`:

```ts
const session = await tx.studySession.findFirst({
  where: { id: context.sessionId, userId: context.userId },
  select: { id: true, completedAt: true, mode: true },
})
```

- [ ] **Step 2: Select the schedule's due date**

The schedule lookup at line 101-104 needs `dueAt` so the verdict can tell a due card from one studied ahead:

```ts
const schedule = await tx.cardSchedule.findUnique({
  where: { userId_cardId: { userId: context.userId, cardId: card.id } },
  select: {
    easeFactor: true,
    intervalDays: true,
    repetitions: true,
    lapses: true,
    dueAt: true,
  },
})
```

- [ ] **Step 3: Derive `hadEmptyBlank` and `isDue`**

Immediately after the `gradeSubmission` call (line 95-99), add:

```ts
/**
 * A blank the user did not fill, as opposed to one they filled wrongly.
 *
 * Read off `results` rather than the raw request so an omitted blank counts
 * the same as an empty string — `gradeSubmission` normalises a missing
 * ordinal to `''`, and a client that simply leaves untouched blanks out of
 * the payload must not read as though the user had answered them.
 *
 * A reveal is not a blank. The user asked to see the answer; that is an
 * attempt with an outcome, and offering to "retake" it would loop them back
 * to a card they have deliberately given up on.
 */
const hadEmptyBlank =
  context.body.revealed !== true && results.some((result) => result.submitted.trim() === '')

// No schedule row means never studied, which is not "due" — a first sight of
// a card in a shuffled drill should be able to create a schedule, and
// `isDue` only ever *widens* rescheduling for a card answered wrong.
const isDue = schedule ? schedule.dueAt <= today : false
```

- [ ] **Step 4: Replace the verdict call**

Line 162-163 currently reads:

```ts
const attempts = slot.attempts + 1
const verdict = SpacedRepetitionSource.verdict(grade, attempts)
```

Replace with:

```ts
const attempts = slot.attempts + 1
const verdict = verdictFor(session.mode, {
  grade,
  attempts,
  hadEmptyBlank,
  isDue,
  correct,
})
```

Update the import at the top of the file: `SpacedRepetitionSource` may now be unused — if so, remove it and import `verdictFor` from `./card-source.js` instead.

- [ ] **Step 5: Gate the schedule upsert**

The `cardSchedule.upsert` at line 138-142 becomes conditional:

```ts
if (verdict.reschedule) {
  await tx.cardSchedule.upsert({
    where: { userId_cardId: { userId: context.userId, cardId: card.id } },
    create: { userId: context.userId, cardId: card.id, ...scheduleData },
    update: scheduleData,
  })
}
```

- [ ] **Step 6: Gate the review row and daily stats**

Lines 144-160 become:

```ts
if (verdict.record) {
  await tx.review.create({
    data: {
      userId: context.userId,
      cardId: card.id,
      grade: gradeToCode(grade),
      blankResults: results as unknown as Prisma.InputJsonValue,
      durationMs: context.body.durationMs ?? null,
      reviewedAt: context.now,
    },
  })

  await upsertDailyStats(tx, {
    userId: context.userId,
    day: today,
    correct,
    dailyGoal: settings.dailyGoal,
  })
}
```

- [ ] **Step 7: Persist `hadEmptyBlank`**

The session-card update at line 166-174 becomes:

```ts
await tx.studySessionCard.update({
  where: { id: slot.id },
  data: {
    attempts,
    hadEmptyBlank,
    ...(verdict.requeue
      ? { position: requeuePosition(slot.position, queueLength) }
      : { answeredAt: context.now, grade: gradeToCode(grade), correct }),
  },
})
```

`hadEmptyBlank` is written on both branches: a requeued card that was blank still needs the flag, and the second attempt overwrites it with whatever happened then.

- [ ] **Step 8: Report the response `dueAt` honestly**

`AnswerResponse.dueAt` (line 180) currently reports the _computed_ due date even though the schedule may not have been written. When `verdict.reschedule` is false, report the existing schedule's date instead:

```ts
      dueAt: verdict.reschedule
        ? dueKey
        : schedule
          ? dayKeyInZone(schedule.dueAt, settings.timezone)
          : dueKey,
```

Without this the feedback panel tells the user "back in 6 days" after a sequential drill that changed nothing.

- [ ] **Step 9: Verify the existing suites still pass**

Run: `cd backend && pnpm vitest run src/study/`
Expected: PASS. Every existing session is `mode: spaced` by the column default, and `verdictFor('spaced', …)` reproduces the old behavior exactly.

Run: `cd backend && pnpm vitest run src/routes/study.answers.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/src/study/grading.ts
git commit -m "feat(study): resolve grade verdicts by session mode"
```

---

### Task 7: Session lifecycle — start, resume, summary

**Files:**

- Modify: `backend/src/study/session.ts` (`startSession` :29-111, `getSession` :210-243, `buildSummary` :276-340)
- Modify: `backend/src/routes/study.schemas.ts`
- Modify: `backend/src/routes/study.ts:31-43`
- Test: `backend/src/routes/study.test.ts` (extend)

**Interfaces:**

- Consumes: `loadSetPool`, `loadRetakePool` (Task 5); the three sources (Task 4); `SessionMode`, `StartableMode` (Task 2)
- Produces: `startSession(userId, options: StartSessionOptions, now: Date): Promise<StudySession>` where `interface StartSessionOptions { studySetId?: string; mode: StartableMode; retakeOf?: string }` — **note the signature change from three positional args to an options object**

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/routes/study.test.ts`. Reuse the existing `seedSet`, `auth` and `registerTestUser` helpers already in the file.

```ts
describe('study modes', () => {
  async function startIn(
    token: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; session?: SessionBody }> {
    const res = await request(app)
      .post('/api/study/sessions')
      .set('Authorization', auth(token))
      .send(body)

    return { status: res.status, session: (res.body as { session?: SessionBody }).session }
  }

  it('serves every card in the set in sequential mode, not just the due ones', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [
      { paragraph: `${PARAGRAPH} one`, answers: [CPU] },
      { paragraph: `${PARAGRAPH} two`, answers: [CPU] },
      { paragraph: `${PARAGRAPH} three`, answers: [CPU] },
    ])

    const { status, session } = await startIn(token, { studySetId: setId, mode: 'sequential' })

    expect(status).toBe(200)
    expect(session?.queue).toHaveLength(3)
    expect(session?.mode).toBe('sequential')
    // Creation order — the set was seeded one, two, three.
    expect(visibleText(session?.queue[0])).toContain('one')
    expect(visibleText(session?.queue[2])).toContain('three')
  })

  it('serves the same cards in shuffled mode', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }, { answers: [CPU] }, { answers: [CPU] }])

    const { status, session } = await startIn(token, { studySetId: setId, mode: 'shuffled' })

    expect(status).toBe(200)
    expect(session?.queue).toHaveLength(3)
    expect(session?.mode).toBe('shuffled')
  })

  it('rejects sequential mode without a set', async () => {
    const { token } = await registerTestUser(app)

    const { status } = await startIn(token, { mode: 'sequential' })

    expect(status).toBe(400)
  })

  it('rejects a set with no highlighted cards', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ paragraph: 'No highlights here', answers: [] }])

    const { status } = await startIn(token, { studySetId: setId, mode: 'sequential' })

    expect(status).toBe(400)
  })

  it('does not resume a session started in a different mode', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }, { answers: [CPU] }])

    const first = await startIn(token, { studySetId: setId, mode: 'sequential' })
    const second = await startIn(token, { studySetId: setId, mode: 'shuffled' })

    expect(second.session?.id).not.toBe(first.session?.id)
    expect(second.session?.mode).toBe('shuffled')
  })

  it('resumes a session started in the same mode', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }, { answers: [CPU] }])

    const first = await startIn(token, { studySetId: setId, mode: 'sequential' })
    const second = await startIn(token, { studySetId: setId, mode: 'sequential' })

    expect(second.session?.id).toBe(first.session?.id)
  })

  it('defaults to spaced when no mode is sent', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])

    const { session } = await startIn(token, { studySetId: setId })

    expect(session?.mode).toBe('spaced')
  })

  it('404s a retake of someone else’s session', async () => {
    const owner = await registerTestUser(app)
    const stranger = await registerTestUser(app)
    const setId = await seedSet(owner.token, [{ answers: [CPU] }])
    const theirs = await startIn(owner.token, { studySetId: setId, mode: 'sequential' })

    const { status } = await startIn(stranger.token, { retakeOf: theirs.session?.id })

    expect(status).toBe(404)
  })

  it('400s a retake with nothing left blank', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])
    const started = await startIn(token, { studySetId: setId, mode: 'sequential' })

    const { status } = await startIn(token, { retakeOf: started.session?.id })

    expect(status).toBe(400)
  })

  it('rejects a retake combined with an explicit mode', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])
    const started = await startIn(token, { studySetId: setId, mode: 'sequential' })

    const { status } = await startIn(token, {
      retakeOf: started.session?.id,
      mode: 'shuffled',
    })

    expect(status).toBe(400)
  })
})
```

Add `mode: string` to the `SessionBody` interface at the top of the file (line 28-37).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pnpm vitest run src/routes/study.test.ts`
Expected: FAIL — `mode` is not in the response and the new bodies are rejected or ignored.

- [ ] **Step 3: Extend the request schema**

Replace `startSessionSchema` in `backend/src/routes/study.schemas.ts` (lines 14-17):

```ts
export const startSessionSchema = z
  .object({
    /** Omit to study across every set. Required for `sequential` and `shuffled`. */
    studySetId: z.string().uuid('Not a valid set id.').optional(),
    /** Defaults to the scheduler's own session. */
    mode: z.enum(['spaced', 'sequential', 'shuffled']).optional(),
    /**
     * Start a retake over this session's unanswered cards.
     *
     * `retake` is deliberately absent from `mode`: a client that could name it
     * could start a session over any pool that records nothing, which is a free
     * way to study without the scheduler ever hearing about it.
     */
    retakeOf: z.string().uuid('Not a valid session id.').optional(),
  })
  .refine((body) => !(body.retakeOf && body.mode), {
    message: 'A retake takes its mode from the session it is retaking.',
    path: ['mode'],
  })
  .refine(
    (body) =>
      body.retakeOf || body.mode === undefined || body.mode === 'spaced' || !!body.studySetId,
    {
      message: 'Memorization and Review need a set to study.',
      path: ['studySetId'],
    },
  )
```

- [ ] **Step 4: Rewrite `startSession`**

In `backend/src/study/session.ts`, replace the signature and body of `startSession` (lines 29-111):

```ts
export interface StartSessionOptions {
  studySetId?: string
  mode: StartableMode
  retakeOf?: string
}

export async function startSession(
  userId: string,
  options: StartSessionOptions,
  now: Date,
): Promise<StudySession> {
  const settings = await loadSettings(userId)
  const mode: SessionMode = options.retakeOf ? 'retake' : options.mode

  /**
   * A retake resolves its pool and its set before anything else.
   *
   * The set has to come from the session being retaken rather than from the
   * request: the retake prompt is offered from a summary screen that may have
   * been left open across a navigation, and taking the set from the prior
   * session is the only reading that cannot disagree with the cards.
   */
  const retake = options.retakeOf ? await loadRetakePool(userId, options.retakeOf) : null

  if (retake && retake.cardIds.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Nothing was left blank in that session.')
  }

  const studySetId = retake ? (retake.studySetId ?? undefined) : options.studySetId

  const existing = await prisma.studySession.findFirst({
    where: { userId, completedAt: null, studySetId: studySetId ?? null, mode },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  })

  if (existing) {
    const resumed = await getSession(userId, existing.id)

    // (docblock unchanged — an open session with an empty queue is spent, not
    // resumable. See the original comment, which stays exactly as it is.)
    if (resumed.queue.length > 0) return resumed

    await prisma.studySession.update({
      where: { id: existing.id },
      data: { completedAt: now },
    })
  }

  if (studySetId) {
    const set = await prisma.studySet.findFirst({
      where: { id: studySetId, userId },
      select: { id: true },
    })
    if (!set) throw new ApiError('NOT_FOUND', 'That study set could not be found.')
  }

  const source = await buildSource(userId, { ...options, mode, studySetId }, retake, settings, now)
  const slots = source.build()

  if (slots.length === 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      mode === 'spaced'
        ? 'Nothing is due right now. Come back later.'
        : 'This set has no cards to study yet.',
    )
  }

  const session = await prisma.studySession.create({
    data: {
      userId,
      studySetId: studySetId ?? null,
      mode,
      startedAt: now,
      cards: {
        create: slots.map((slot) => ({
          cardId: slot.cardId,
          position: slot.position,
          isNew: slot.isNew,
        })),
      },
    },
    select: { id: true },
  })

  return getSession(userId, session.id)
}

/**
 * Picks the source for a mode.
 *
 * A switch here rather than in the route, so the route stays what it is today:
 * resolve the caller, read the clock, hand off. Only `spaced` consults the
 * scheduler — the two drill modes deliberately skip the daily cap and the
 * new-card interleave, because a user who asked to study a set asked for the
 * set, not for the scheduler's opinion of it.
 */
async function buildSource(
  userId: string,
  options: StartSessionOptions & { mode: SessionMode },
  retake: { cardIds: string[] } | null,
  settings: UserSettings,
  now: Date,
): Promise<CardSource> {
  if (options.mode === 'retake') {
    return new RetakeSource({ cards: retake?.cardIds ?? [] })
  }

  if (options.mode === 'sequential' || options.mode === 'shuffled') {
    // The schema guarantees a set id for these two modes.
    const cards = await loadSetPool(userId, options.studySetId ?? '')
    return options.mode === 'sequential'
      ? new SequentialSource({ cards })
      : new ShuffledSource({ cards })
  }

  const today = todayFor(settings, now)
  const { due, fresh } = await loadCandidates(userId, options.studySetId, today)

  return new SpacedRepetitionSource({
    due,
    fresh,
    newCardsPerDay: settings.newCardsPerDay,
    dailyCap: dailyCapFor(settings),
    reviewsToday: await countReviewsToday(userId, today),
  })
}
```

Add the imports this needs at the top of `session.ts`: `RetakeSource`, `SequentialSource`, `ShuffledSource`, `type CardSource` from `./card-source.js`; `loadRetakePool`, `loadSetPool` from `./pool.js`; `type SessionMode`, `type StartableMode` from `@saulado/shared`.

- [ ] **Step 5: Return `mode` from `getSession`**

In `getSession` (line 213-226), add `mode: true` to the select, and add `mode: session.mode` to the returned object (around line 236).

- [ ] **Step 6: Add `mode` and `unanswered` to the summary**

In `buildSummary` (line 282-304), add `mode: true` to the `findFirstOrThrow` select and `hadEmptyBlank: true` to the per-card select. Then add to the returned object, after `toRevisit`:

```ts
    mode: session.mode,
    /**
     * Cards left blank, offered back as a retake.
     *
     * Filtered from the rows already in hand rather than queried again — the
     * summary has every answered card of the session loaded for `toRevisit`.
     *
     * A retake session reports none: nothing it does is recorded, so a second
     * retake would be a pass over a pass, and the offer would never stop.
     */
    unanswered:
      session.mode === 'retake'
        ? []
        : session.cards
            .filter((card) => card.hadEmptyBlank)
            .map((card) => ({
              cardId: card.cardId,
              studySetId: card.card.studySetId,
              label: cardLabel(card.card.paragraph),
            })),
```

- [ ] **Step 7: Update the route**

In `backend/src/routes/study.ts` (lines 34-42), the call becomes:

```ts
const body = req.body as StartSessionBody
const session = await startSession(
  requireUserId(req),
  {
    studySetId: body.studySetId,
    mode: body.mode ?? 'spaced',
    retakeOf: body.retakeOf,
  },
  new Date(),
)
```

- [ ] **Step 8: Run the tests**

Run: `cd backend && pnpm vitest run src/routes/study.test.ts`
Expected: PASS — both the new mode cases and every pre-existing case.

Run: `cd backend && pnpm test`
Expected: PASS across the backend.

- [ ] **Step 9: Commit**

```bash
git add backend/src/study/session.ts backend/src/routes/study.ts backend/src/routes/study.schemas.ts backend/src/routes/study.test.ts
git commit -m "feat(study): start sessions in a chosen mode, with retake"
```

---

### Task 8: Grading behaviour over HTTP

Task 6 changed grading; this proves it end-to-end. Separate task because it needs Task 7's ability to start a session in a mode.

**Files:**

- Test: `backend/src/routes/study.answers.test.ts` (extend)

**Interfaces:**

- Consumes: everything from Tasks 4, 6, 7
- Produces: nothing — verification only

- [ ] **Step 1: Write the tests**

Append to `backend/src/routes/study.answers.test.ts`, reusing that file's existing helpers for seeding and answering.

```ts
describe('mode-specific grading', () => {
  it('does not requeue a card left blank in sequential mode', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }, { answers: [CPU] }])
    const session = await startSession(token, { studySetId: setId, mode: 'sequential' })
    const card = session.queue[0]

    const res = await answer(token, session.id, {
      cardId: card.cardId,
      blanks: [{ ordinal: 0, submitted: '' }],
      idempotencyKey: 'blank-no-requeue-01',
    })

    expect(res.body.requeued).toBe(false)
  })

  it('still requeues a wrong answer in sequential mode', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }, { answers: [CPU] }])
    const session = await startSession(token, { studySetId: setId, mode: 'sequential' })

    const res = await answer(token, session.id, {
      cardId: session.queue[0].cardId,
      blanks: [{ ordinal: 0, submitted: 'definitely wrong' }],
      idempotencyKey: 'wrong-requeues-01',
    })

    expect(res.body.requeued).toBe(true)
  })

  it('lists a blank card as unanswered in the summary', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])
    const session = await startSession(token, { studySetId: setId, mode: 'sequential' })

    await answer(token, session.id, {
      cardId: session.queue[0].cardId,
      blanks: [{ ordinal: 0, submitted: '' }],
      idempotencyKey: 'blank-in-summary-01',
    })

    const summary = await complete(token, session.id)

    expect(summary.unanswered).toHaveLength(1)
    expect(summary.unanswered[0].cardId).toBe(session.queue[0].cardId)
  })

  it('does not list a wrong-but-attempted card as unanswered', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])
    const session = await startSession(token, { studySetId: setId, mode: 'sequential' })

    // Two attempts: the requeue means one submission does not finish the card.
    for (const key of ['wrong-a', 'wrong-b']) {
      await answer(token, session.id, {
        cardId: session.queue[0].cardId,
        blanks: [{ ordinal: 0, submitted: 'nonsense' }],
        idempotencyKey: `${key}-summary-01`,
      })
    }

    const summary = await complete(token, session.id)

    expect(summary.unanswered).toHaveLength(0)
  })

  it('records no review for a retake answer', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])
    const first = await startSession(token, { studySetId: setId, mode: 'sequential' })

    await answer(token, first.id, {
      cardId: first.queue[0].cardId,
      blanks: [{ ordinal: 0, submitted: '' }],
      idempotencyKey: 'retake-setup-01',
    })
    await complete(token, first.id)

    const before = await dueCounts(token)

    const retake = await startSession(token, { retakeOf: first.id })
    await answer(token, retake.id, {
      cardId: retake.queue[0].cardId,
      blanks: [{ ordinal: 0, submitted: 'CPU' }],
      idempotencyKey: 'retake-answer-01',
    })
    const summary = await complete(token, retake.id)

    // Nothing was recorded, so today's review count is untouched.
    expect(summary.reviewsToday).toBe(before.reviewsToday ?? summary.reviewsToday)
    expect(summary.unanswered).toHaveLength(0)
  })

  it('offers no second retake', async () => {
    const { token } = await registerTestUser(app)
    const setId = await seedSet(token, [{ answers: [CPU] }])
    const first = await startSession(token, { studySetId: setId, mode: 'sequential' })

    await answer(token, first.id, {
      cardId: first.queue[0].cardId,
      blanks: [{ ordinal: 0, submitted: '' }],
      idempotencyKey: 'no-second-retake-01',
    })
    await complete(token, first.id)

    const retake = await startSession(token, { retakeOf: first.id })
    await answer(token, retake.id, {
      cardId: retake.queue[0].cardId,
      blanks: [{ ordinal: 0, submitted: '' }],
      idempotencyKey: 'no-second-retake-02',
    })
    const summary = await complete(token, retake.id)

    expect(summary.unanswered).toHaveLength(0)
  })
})
```

The helpers `startSession`, `answer`, `complete` and `dueCounts` already exist in this file in some form — read the file first and adapt these calls to their actual signatures rather than adding duplicates. `startSession` there currently takes a bare set id; widen it to take the same body object used in Task 7.

- [ ] **Step 2: Run the tests**

Run: `cd backend && pnpm vitest run src/routes/study.answers.test.ts`
Expected: PASS. If "records no review for a retake answer" fails, the `verdict.record` gate in Task 6 Step 6 is the place to look.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/study.answers.test.ts
git commit -m "test(study): cover mode-specific grading over HTTP"
```

---

### Task 9: Web — service and query layer

Small, mechanical, and separated so the UI task starts against a settled API.

**Files:**

- Modify: `frontend/src/services/study.ts:19-24`
- Modify: `frontend/src/features/study/queries.ts:88-99`

**Interfaces:**

- Consumes: `StartSessionRequest` (Task 2)
- Produces: `api.startSession(body: StartSessionRequest): Promise<SessionResponse>`; `useStartSession(): UseMutationResult<SessionResponse, Error, StartSessionRequest>`

- [ ] **Step 1: Widen the service call**

Replace `startSession` in `frontend/src/services/study.ts`:

```ts
export function startSession(body: StartSessionRequest = {}): Promise<SessionResponse> {
  return authorizedRequest<SessionResponse>('/api/study/sessions', {
    method: 'POST',
    body,
  })
}
```

Add `StartSessionRequest` to the type import from `@saulado/shared` at the top.

- [ ] **Step 2: Widen the mutation**

In `frontend/src/features/study/queries.ts`, replace `useStartSession`:

```ts
export function useStartSession(): UseMutationResult<SessionResponse, Error, StartSessionRequest> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: StartSessionRequest) => api.startSession(body),
    onSuccess: (data) => {
      // Seeded rather than invalidated: this response *is* the session, so a
      // refetch would ask the server for what we are already holding.
      queryClient.setQueryData(studyKeys.session(data.session.id), data)
    },
  })
}
```

Add `StartSessionRequest` to the type import from `@saulado/shared`.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: **FAIL** at `StudySessionPage.tsx:89` — `start.mutateAsync(studySetId ?? undefined)` now passes a string where an object is expected. That is the correct failing state; Task 10 fixes it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/study.ts frontend/src/features/study/queries.ts
git commit -m "feat(web): accept mode and retakeOf when starting a session"
```

---

### Task 10: Web — mode picker and retake prompt

**Files:**

- Create: `frontend/src/features/study/ModePicker.tsx`
- Modify: `frontend/src/features/study/StudySessionPage.tsx`
- Modify: `frontend/src/features/study/SessionSummaryView.tsx`
- Test: `frontend/src/features/study/StudySessionPage.test.tsx` (extend)

**Interfaces:**

- Consumes: `useStartSession` (Task 9); `SessionSummary.unanswered` (Task 2)
- Produces: `<ModePicker onPick={(mode: StartableMode) => void} />`; `SessionSummaryView` gains `onRetake: () => void`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/features/study/StudySessionPage.test.tsx`, following that file's existing render/mock helpers.

```ts
describe('mode picker', () => {
  it('offers the two methods instead of auto-starting when a set has no mode', async () => {
    renderStudyPage('?set=set-1')

    expect(await screen.findByRole('heading', { name: /how do you want to study/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /memorization/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /review/i })).toBeVisible()
    // Nothing was started.
    expect(startSessionMock).not.toHaveBeenCalled()
  })

  it('starts in the chosen mode', async () => {
    const user = userEvent.setup()
    renderStudyPage('?set=set-1')

    await user.click(await screen.findByRole('button', { name: /memorization/i }))

    expect(startSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ studySetId: 'set-1', mode: 'sequential' }),
    )
  })

  it('auto-starts without a picker when studying every set', async () => {
    renderStudyPage('')

    await waitFor(() => {
      expect(startSessionMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('heading', { name: /how do you want to study/i })).toBeNull()
  })

  it('auto-starts when a mode is already in the url', async () => {
    renderStudyPage('?set=set-1&mode=shuffled')

    await waitFor(() => {
      expect(startSessionMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'shuffled' }))
    })
  })

  it('falls back to the picker for an unknown mode', async () => {
    renderStudyPage('?set=set-1&mode=nonsense')

    expect(await screen.findByRole('heading', { name: /how do you want to study/i })).toBeVisible()
    expect(startSessionMock).not.toHaveBeenCalled()
  })
})

describe('retake prompt', () => {
  it('offers a retake when cards were left blank', async () => {
    renderSummary({ unanswered: [{ cardId: 'c1', studySetId: 'set-1', label: 'The CPU is…' }] })

    expect(await screen.findByText(/1 card.*left blank/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /retake/i })).toBeVisible()
  })

  it('offers nothing when every card was attempted', () => {
    renderSummary({ unanswered: [] })

    expect(screen.queryByRole('button', { name: /retake/i })).toBeNull()
  })

  it('starts a retake of the finished session', async () => {
    const user = userEvent.setup()
    renderSummary({
      sessionId: 'session-9',
      unanswered: [{ cardId: 'c1', studySetId: 'set-1', label: 'The CPU is…' }],
    })

    await user.click(await screen.findByRole('button', { name: /retake/i }))

    expect(startSessionMock).toHaveBeenCalledWith({ retakeOf: 'session-9' })
  })

  it('dismisses without starting anything', async () => {
    const user = userEvent.setup()
    renderSummary({ unanswered: [{ cardId: 'c1', studySetId: 'set-1', label: 'The CPU is…' }] })

    await user.click(await screen.findByRole('button', { name: /no thanks/i }))

    expect(screen.queryByRole('button', { name: /retake/i })).toBeNull()
    expect(startSessionMock).not.toHaveBeenCalled()
  })

  it('captions a retake summary as practice', () => {
    renderSummary({ mode: 'retake', unanswered: [] })

    expect(screen.getByText(/practice pass.*nothing.*recorded/i)).toBeVisible()
  })

  it('does not caption an ordinary summary', () => {
    renderSummary({ mode: 'sequential', unanswered: [] })

    expect(screen.queryByText(/practice pass/i)).toBeNull()
  })
})
```

`renderStudyPage(search)` and `renderSummary(overrides)` are helpers you add at the top of the describe blocks — build them from the file's existing render setup, which already wires a `MemoryRouter` and a mocked query client.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/features/study/StudySessionPage.test.tsx`
Expected: FAIL — no picker, no retake prompt.

- [ ] **Step 3: Build the picker**

Create `frontend/src/features/study/ModePicker.tsx`:

```tsx
import type { ReactElement } from 'react'
import type { StartableMode } from '@saulado/shared'
import { Card } from '@/components/ui/card'

/**
 * How the user wants to study this set.
 *
 * Asked every time rather than remembered, because the answer is about *today* —
 * a set you walked through in order last night is one you want shuffled this
 * morning, and a remembered choice would quietly keep handing you the wrong one.
 *
 * Shown only for a set-scoped session. "Study everything" from the dashboard is
 * the scheduler's own session and has no method to pick.
 */

interface ModePickerProps {
  onPick: (mode: StartableMode) => void
}

const METHODS: { mode: StartableMode; title: string; blurb: string }[] = [
  {
    mode: 'sequential',
    title: 'Memorization',
    blurb: 'Every card, in the order you wrote them. Good for learning something new end to end.',
  },
  {
    mode: 'shuffled',
    title: 'Review',
    blurb: 'The same cards, shuffled. Tests whether you know the material or just the order.',
  },
]

export function ModePicker({ onPick }: ModePickerProps): ReactElement {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">How do you want to study?</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {METHODS.map((method) => (
          <Card key={method.mode} className="p-0">
            <button
              type="button"
              onClick={() => {
                onPick(method.mode)
              }}
              className="h-full w-full rounded-[inherit] p-5 text-left focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-medium">{method.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{method.blurb}</span>
            </button>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

The whole card is the button rather than a card containing one, so the click target matches the visual target — a keyboard user tabbing here gets two stops, not two per card.

- [ ] **Step 4: Gate the page on the picker**

In `frontend/src/features/study/StudySessionPage.tsx`:

Read the mode from the URL, just below `studySetId` (line 46):

```tsx
const rawMode = params.get('mode')
const mode = rawMode === 'sequential' || rawMode === 'shuffled' ? rawMode : null
/**
 * The picker stands in for auto-start when a set was named without a method.
 *
 * An unrecognised `mode` lands here too rather than erroring: a stale link or
 * a typo should ask the question again, not present a failure the user has no
 * way to act on.
 */
const needsMode = studySetId !== null && mode === null
```

Change `begin` (line 83-101) to take a body:

```tsx
const begin = (body: StartSessionRequest): void => {
  started.current = true
  setStartError(null)
  setStarting(true)

  start
    .mutateAsync(body)
    .then((data) => {
      setSessionId(data.session.id)
      rememberSession(data.session.id)
      session.load(data.session)
    })
    .catch((error: unknown) => {
      setStartError(error instanceof Error ? error : new Error('Could not start this session.'))
    })
    .finally(() => {
      setStarting(false)
    })
}

/** The session this page's URL describes. */
const beginFromUrl = (): void => {
  begin({
    ...(studySetId ? { studySetId } : {}),
    ...(mode ? { mode } : {}),
  })
}
```

Update the mount effect (line 103-115) so the picker suppresses auto-start:

```tsx
if (started.current || resumeId !== null || needsMode) return

beginFromUrl()
```

Update the two other `begin()` call sites (the stale-pointer effect around line 135, and whatever `onStudyAgain` passes) to call `beginFromUrl()`.

Render the picker before any session UI — near the top of the returned JSX, ahead of the loading and session branches:

```tsx
if (needsMode && summary === null) {
  return (
    <ModePicker
      onPick={(picked) => {
        // A URL change rather than local state: the mode is part of what this
        // page *is*, so a reload or a shared link lands in the same session.
        setParams({ set: studySetId ?? '', mode: picked })
      }}
    />
  )
}
```

Switch the `useSearchParams()` destructure (line 45) to `const [params, setParams] = useSearchParams()`.

- [ ] **Step 5: Caption a retake summary as practice**

Still in `SessionSummaryView.tsx`, insert directly above the stat-tile grid (line 69), so the caption is read before the numbers it qualifies:

```tsx
{
  /*
        The tiles below are honest counts of a pass that changed nothing: a
        retake writes no review, moves no schedule and touches no daily total.
        Without this line "4 cards, 100%" sits in the same place it sits after a
        real session and means something entirely different.
      */
}
{
  summary.mode === 'retake' && (
    <p className="text-sm text-muted-foreground">
      A practice pass over the cards you left blank — nothing here was recorded.
    </p>
  )
}
```

- [ ] **Step 6: Add the retake prompt**

In `frontend/src/features/study/SessionSummaryView.tsx`, add `onRetake: () => void` to the props interface, and a `const [dismissed, setDismissed] = useState(false)` at the top of the component. Insert this block between the `toRevisit` card (ends line 103) and the button row:

```tsx
{
  /*
        A different offer from "worth another look" above, and deliberately
        below it: those cards were answered and are already scheduled, these
        were not answered at all. Finishing them changes nothing on the record —
        the blank was graded when it was left blank — so this is practice, and
        the copy says so rather than implying progress the user will not get.
      */
}
{
  summary.unanswered.length > 0 && !dismissed && (
    <Card as="section" className="p-5">
      <h2 className="font-medium">
        {summary.unanswered.length === 1
          ? '1 card left blank'
          : `${String(summary.unanswered.length)} cards left blank`}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Go through them again? This is practice — nothing is recorded and nothing is rescheduled.
      </p>
      <ul className="mt-3 space-y-1.5">
        {summary.unanswered.map((card) => (
          <li key={card.cardId} className="text-sm text-muted-foreground">
            {card.label}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={buttonClass()} disabled={pending} onClick={onRetake}>
          Retake
        </button>
        <button
          type="button"
          className={buttonClass({ variant: 'soft' })}
          onClick={() => {
            setDismissed(true)
          }}
        >
          No thanks
        </button>
      </div>
    </Card>
  )
}
```

The list is plain text, not links — unlike `toRevisit`, whose links exist so the user can rewrite a failing card. Here the next action is the Retake button.

- [ ] **Step 7: Wire the summary into the page**

Where `StudySessionPage` renders `<SessionSummaryView …>`, add:

```tsx
          onRetake={() => {
            setSummary(null)
            started.current = false
            begin({ retakeOf: summary.sessionId })
          }}
```

- [ ] **Step 8: Run the tests**

Run: `cd frontend && pnpm vitest run src/features/study/StudySessionPage.test.tsx`
Expected: PASS.

Run: `cd frontend && pnpm test`
Expected: PASS.

Run: `cd frontend && pnpm typecheck`
Expected: PASS — the Task 9 failure is now resolved.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/study
git commit -m "feat(web): add study method picker and retake prompt"
```

---

### Task 11: Mobile mirror

Mobile has **no test runner and zero tests** (`mobile/package.json` has no `test` script). Adding one is out of scope. This task ships verified by hand against a running app — the manual checklist in Step 5 is the deliverable's gate.

**Files:**

- Create: `mobile/components/mode-picker.tsx`
- Modify: `mobile/lib/api.ts` (the `startSession` wrapper)
- Modify: `mobile/app/(app)/study.tsx`
- Modify: `mobile/components/session-summary.tsx`

**Interfaces:**

- Consumes: everything from Tasks 2, 7
- Produces: nothing further

- [ ] **Step 1: Widen the API wrapper**

Find the `startSession` wrapper in `mobile/lib/api.ts` (the mobile equivalent of `frontend/src/services/study.ts`) and change it to take a `StartSessionRequest` body instead of a bare set id, exactly as in Task 9 Step 1. The inline `useMutation` in `mobile/app/(app)/study.tsx` (the file keeps its query hooks inline rather than in a `queries.ts` — see the comment at `study.tsx:29-41`) needs the same widening.

- [ ] **Step 2: Build the picker**

Create `mobile/components/mode-picker.tsx`. The copy is identical to the web version word for word — two platforms describing one feature differently is how a product starts feeling like two products.

```tsx
import { Pressable, Text, View } from 'react-native'
import type { StartableMode } from '@saulado/shared'

/**
 * How the user wants to study this set.
 *
 * Asked every time rather than remembered, because the answer is about *today* —
 * a set you walked through in order last night is one you want shuffled this
 * morning, and a remembered choice would quietly keep handing you the wrong one.
 *
 * Shown only for a set-scoped session. "Study everything" from the dashboard is
 * the scheduler's own session and has no method to pick.
 */

interface ModePickerProps {
  onPick: (mode: StartableMode) => void
}

const METHODS: { mode: StartableMode; title: string; blurb: string }[] = [
  {
    mode: 'sequential',
    title: 'Memorization',
    blurb: 'Every card, in the order you wrote them. Good for learning something new end to end.',
  },
  {
    mode: 'shuffled',
    title: 'Review',
    blurb: 'The same cards, shuffled. Tests whether you know the material or just the order.',
  },
]

export function ModePicker({ onPick }: ModePickerProps): React.JSX.Element {
  return (
    <View className="gap-6 p-5">
      <Text className="text-2xl font-semibold text-foreground">How do you want to study?</Text>

      <View className="gap-3">
        {METHODS.map((method) => (
          <Pressable
            key={method.mode}
            accessibilityRole="button"
            accessibilityLabel={method.title}
            onPress={() => {
              onPick(method.mode)
            }}
            className="rounded-xl border border-border bg-card p-5 active:opacity-70"
          >
            <Text className="font-medium text-foreground">{method.title}</Text>
            <Text className="mt-1 text-sm text-muted-foreground">{method.blurb}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
```

Check the class names against a neighbouring component (`mobile/components/session-summary.tsx`) before committing — this file assumes the NativeWind token names that file uses, and the theme is the authority, not this plan.

- [ ] **Step 3: Gate the study screen**

In `mobile/app/(app)/study.tsx`, read `mode` alongside the existing `set` param and apply the same rule as the web page:

```tsx
const { set: studySetId, mode: rawMode } = useLocalSearchParams<{ set?: string; mode?: string }>()
const mode = rawMode === 'sequential' || rawMode === 'shuffled' ? rawMode : null
const needsMode = studySetId !== undefined && mode === null
```

Suppress the auto-start effect when `needsMode` is true, and render the picker before any session UI:

```tsx
if (needsMode && summary === null) {
  return (
    <ModePicker
      onPick={(picked) => {
        // A param change rather than local state: the mode is part of what
        // this screen *is*, so returning to it lands in the same session.
        router.setParams({ mode: picked })
      }}
    />
  )
}
```

- [ ] **Step 4: Add the practice caption and retake prompt**

In `mobile/components/session-summary.tsx`, add `onRetake: () => void` to the props and `const [dismissed, setDismissed] = useState(false)` at the top of the component.

Above the stat tiles:

```tsx
{
  summary.mode === 'retake' && (
    <Text className="text-sm text-muted-foreground">
      A practice pass over the cards you left blank — nothing here was recorded.
    </Text>
  )
}
```

Between the "Worth another look" block and the button row:

```tsx
{
  summary.unanswered.length > 0 && !dismissed && (
    <View className="rounded-xl border border-border bg-card p-5">
      <Text className="font-medium text-foreground">
        {summary.unanswered.length === 1
          ? '1 card left blank'
          : `${String(summary.unanswered.length)} cards left blank`}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">
        Go through them again? This is practice — nothing is recorded and nothing is rescheduled.
      </Text>
      <View className="mt-3 gap-1.5">
        {summary.unanswered.map((card) => (
          <Text key={card.cardId} className="text-sm text-muted-foreground">
            {card.label}
          </Text>
        ))}
      </View>
      <View className="mt-4 flex-row flex-wrap gap-3">
        <Pressable
          accessibilityRole="button"
          onPress={onRetake}
          className="rounded-lg bg-primary px-4 py-2.5 active:opacity-70"
        >
          <Text className="font-medium text-primary-foreground">Retake</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDismissed(true)
          }}
          className="rounded-lg bg-secondary px-4 py-2.5 active:opacity-70"
        >
          <Text className="font-medium text-secondary-foreground">No thanks</Text>
        </Pressable>
      </View>
    </View>
  )
}
```

Wire `onRetake` from `study.tsx` the same way the web page does: clear the summary, reset the started ref, and start with `{ retakeOf: summary.sessionId }`.

- [ ] **Step 5: Verify by hand**

Run: `cd mobile && pnpm start`, then exercise on a device or simulator:

- [ ] Tapping Study on a set shows the picker, not a card
- [ ] Memorization serves cards in creation order
- [ ] Review serves the same cards in a different order
- [ ] Leaving a blank empty and finishing shows the retake prompt with the right count
- [ ] Retake serves only the blank cards
- [ ] "No thanks" dismisses and does not come back
- [ ] The dashboard's "study everything" still starts immediately with no picker
- [ ] Background the app mid-session and return — the session resumes in the same mode
- [ ] The retake's own summary carries the "nothing here was recorded" caption
- [ ] The retake's own summary offers no second retake

- [ ] **Step 6: Typecheck and commit**

Run: `cd mobile && pnpm typecheck`
Expected: PASS.

```bash
git add mobile/
git commit -m "feat(mobile): add study method picker and retake prompt"
```

---

### Task 12: Full-suite verification

**Files:** none — verification only.

- [ ] **Step 1: Run every suite**

```bash
cd shared && pnpm test
cd ../backend && pnpm test
cd ../frontend && pnpm test
```

Expected: PASS in all three. Backend needs Postgres up (`docker-compose up -d`).

- [ ] **Step 2: Typecheck the workspace**

```bash
cd shared && pnpm typecheck
cd ../backend && pnpm typecheck
cd ../frontend && pnpm typecheck
cd ../mobile && pnpm typecheck
```

Expected: PASS in all four.

- [ ] **Step 3: Lint**

Run: `pnpm lint` from the repository root.
Expected: PASS. The husky pre-commit hook has been running prettier on each commit already; this catches ESLint findings it does not.

- [ ] **Step 4: Confirm the spaced path is untouched**

The riskiest regression in this plan is a change to the scheduler's own session, since every existing session backfilled to `mode: spaced`. Verify by hand against a running app:

- [ ] Dashboard "Study" starts immediately, no picker
- [ ] Its queue still interleaves new cards
- [ ] A card graded `again` still comes back within the session
- [ ] Today's review count still increments
- [ ] The summary's "Worth another look" still lists again/hard cards

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(study): address verification findings"
```

---

## Notes for the implementer

**Do not touch the `worktree-sets-ui-and-shuffle` branch.** Task 1 reproduces its `shuffle` helper directly from this plan — no cherry-pick, no merge. That branch also changes `card-source.ts` to shuffle the _spaced_ queue unconditionally, which this feature deliberately does not do (spec §11). Leave it alone; it is a separate decision.

**`isNew` is false for every card in the new modes.** The flag means "you have never seen this card", and a whole-set pool never consults `card_schedules` to find out. It is not a bug that a genuinely new card shows no badge in a sequential drill.

**Why `record` and `reschedule` are two flags, not one.** A sequential drill records a review (it happened; the accuracy number should reflect it) but does not reschedule (the sequence was carrying part of the recall). A retake does neither. One flag could not express the middle case.

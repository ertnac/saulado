# Study Modes & Retake — Design Spec

**Date:** 2026-08-11
**Status:** Approved (brainstorming sign-off)
**Scope:** Web frontend + mobile app; backend and shared packages.

## 1. Goal

Give study mode two explicitly chosen methods plus a retake pass:

1. **Memorization** — cards presented in creation order (sequential), so the user
   can learn a set top-to-bottom the way it was written.
2. **Review** — the same pool, shuffled, so the user can test recall without
   learning the sequence instead of the material.
3. **Retake** — after a session, cards the user left _blank_ (at least one empty
   blank) can be re-attempted in a practice pass that records nothing.

The existing spaced-repetition session (due cards + new-card interleave + daily
cap) stays exactly as it is and remains the session reached from the Dashboard
and due counts. The two new methods are a separate, set-scoped path.

## 2. Decisions (confirmed)

| #   | Decision                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Retake triggers on **any empty blank**. Wrong answers are graded wrong and never enter retake. A partially filled card (2 of 3 blanks) does enter retake.                      |
| D2  | Blank grades `correct: false` in every mode.                                                                                                                                   |
| D3  | Both modes write a `Review` row and daily stats. **Only `shuffled` reschedules** (`card_schedules`). `sequential` never touches the schedule; `retake` records nothing at all. |
| D4  | "Never punish early": in `shuffled`, a not-due card answered wrong does **not** have its `next_review` reset. Correct answers always reschedule.                               |
| D5  | Retake prompt appears **once, at the end-of-session summary**. Retake is practice only — no Review row, no stats, no reschedule.                                               |
| D6  | Mode is chosen **every session** via a picker. No memory, no global default.                                                                                                   |
| D7  | Both new modes use the **same card pool** — every highlighted card in the set subtree. Order is the only difference.                                                           |
| D8  | A blank does **not** requeue mid-session in `sequential`/`shuffled`. It is held for the end-of-session retake prompt. Wrong answers still requeue as today.                    |
| D9  | **No resume.** The existing resume path is reused: an open session for the same `(set, mode)` is resumed, and a _different_ mode starts fresh. No teardown endpoint.           |
| D10 | Scope: **web + mobile**.                                                                                                                                                       |

## 3. Architecture

Three new `CardSource` implementations alongside `SpacedRepetitionSource`, in
`backend/src/study/card-source.ts`. The existing seam (`card-source.ts:4-23`)
was designed for exactly this — "so those arrive as new classes rather than as
`if (mode === 'cram')` branches through the session route".

Sources only rank cards and answer `onGraded`. No Prisma in a source.

```
┌─────────────┐   build() → QueueSlot[]       ┌────────────────────────┐
│  sources    │ ────────────────────────────► │ study_session_cards    │
│  sequential │                               │  position, isNew,      │
│  shuffled   │                               │  had_empty_blank       │
│  retake     │                               └────────────────────────┘
│  spaced     │                                 ▲                       │
└─────────────┘                                 │ submitAnswer()        │
      ▲                                         │ (route → grading.ts)  │
      │ onGraded() → GradeVerdict               │                       │
      └─────────────────────────────────────────┴───────────────────────┘
```

The client never builds or reorders a queue — it walks `study_session_cards`
rows via `GET /sessions/:id`, which is what makes resume work (`session.ts:11-19`)
and what keeps the ordering rules server-side.

### 3.1 The card source seam

`GradeVerdict` gains a third field:

```ts
export interface GradeVerdict {
  requeue: boolean // show the card again later in this session
  reschedule: boolean // write SM-2 state to card_schedules
  record: boolean // NEW — write the Review row + daily stats
}
```

`record: false` is what makes the retake pass leave no trace. Today
`grading.ts:144` writes the Review row unconditionally; it becomes conditional.

### 3.2 Sources and their semantics

| Source       | `kind`       | Pool                                     | Order                                        | `onGraded`                                                                              |
| ------------ | ------------ | ---------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `spaced`     | `spaced`     | due + new-card interleave, capped        | `compareDue`, `interleaveNew` (unchanged)    | unchanged                                                                               |
| `sequential` | `sequential` | **all** highlighted cards in set subtree | `createdAt ASC`, tiebreak `cardId`           | wrong → requeue; blank → no requeue; never reschedule; always record                    |
| `shuffled`   | `shuffled`   | same pool as sequential                  | `shuffle()` (Fisher-Yates, injectable `rng`) | wrong → requeue; blank → no requeue; reschedule iff `isDue \|\| correct`; always record |
| `retake`     | `retake`     | prior session's `hadEmptyBlank` cards    | prior session's order                        | no requeue; no reschedule; no record                                                    |

The `createdAt` tiebreak is not optional: a bulk import shares `created_at` to
the millisecond, so ordering on it alone is ordering on nothing
(`card-source.ts:103-106`). Tiebreak on `cardId` for stability across sessions.

`shuffle()` is a Fisher-Yates on a copy, living in `shared/src/study/queue.ts`,
with an injectable `rng: () => number` so tests can pin a permutation. It
already exists on the `worktree-sets-ui-and-shuffle` branch and is cherry-picked
as-is. That branch's unconditional `card-source.ts` shuffle is **not** taken.

### 3.3 Grade verdicts

The verdict matrix (the heart of the feature):

| Source       | requeue             | reschedule           | record  |
| ------------ | ------------------- | -------------------- | ------- |
| `spaced`     | unchanged           | `true`               | `true`  |
| `sequential` | wrong yes, blank no | `false`              | `true`  |
| `shuffled`   | wrong yes, blank no | `isDue \|\| correct` | `true`  |
| `retake`     | `false`             | `false`              | `false` |

**Precedence when a card is both wrong and blank.** A card with three blanks
where the user fills two incorrectly and leaves one empty is both. `hadEmptyBlank`
wins: the card does **not** requeue and it enters the retake list. Stated as a
rule — `hadEmptyBlank` short-circuits the requeue decision in `sequential` and
`shuffled`, so "wrong yes, blank no" above reads as "requeue iff
`shouldRequeue(grade, attempts) && !hadEmptyBlank`". This follows from D1 (any
empty blank means retake) and D8 (blanks are held for the prompt, not requeued).

Grading picks the source by `session.mode` via a `Record<SessionMode, ...>`
lookup — a map, not an `if` chain (`card-source.ts:13-18`).

## 4. Data model

### 4.1 New columns

```prisma
enum SessionMode {
  spaced
  sequential
  shuffled
  retake
}

model StudySession {
  mode SessionMode @default(spaced)   // NEW
}

model StudySessionCard {
  hadEmptyBlank Boolean @default(false) @map("had_empty_blank")  // NEW
}
```

- `StudySession.mode` — which source built the session. Persisted because
  grading is a separate request that only has the session row, and because a
  resumed session must know its mode (`getSession` returns it).
- `StudySessionCard.hadEmptyBlank` — set by grading when any blank submitted
  empty. It is what makes the retake query a plain `where` instead of digging
  `lastResult` JSON.

### 4.2 What changes where

| Location                                           | Change                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/prisma/schema.prisma`                     | enum + two columns                                                                                                                                     |
| `shared/src/study/types.ts`                        | `SessionMode` type, `StudySession.mode`, `SessionSummary.unanswered`, `StartSessionRequest` gains `mode` + `retakeOf`, `SubmitAnswerRequest` unchanged |
| `backend/src/study/card-source.ts`                 | `GradeVerdict.record`, three new classes                                                                                                               |
| `backend/src/study/grading.ts`                     | verdict resolution by mode, `hadEmptyBlank` write, `record` gate on Review + stats                                                                     |
| `backend/src/study/session.ts`                     | mode-aware resume lookup, source switch, mode-aware `loadCandidates` variant, summary `unanswered`, `getSession.mode`                                  |
| `backend/src/study/render.ts`                      | no change                                                                                                                                              |
| `backend/src/routes/study.ts` / `study.schemas.ts` | `mode`, `retakeOf` in start schema                                                                                                                     |
| `frontend` + `mobile`                              | picker, retake prompt, `useStartSession` arg shape                                                                                                     |

## 5. API

### 5.1 Route surface

No new routes. Existing 5 routes stay. `POST /api/study/sessions` body:

```ts
startSessionSchema = z.object({
  studySetId: z.string().uuid().optional(),
  mode: z.enum(['spaced', 'sequential', 'shuffled']).default('spaced'),
  retakeOf: z.string().uuid().optional(), // prior session id
})
```

`retakeOf` sets `mode: 'retake'` server-side; a client-supplied `retake` mode is
not trusted. Rejected (400):

- `retakeOf` combined with an explicit `mode`
- `sequential`/`shuffled` without `studySetId` (both are set-scoped by definition)

### 5.2 `startSession` (`backend/src/study/session.ts:29-111`)

1. Resume lookup gains `mode` (`:37`): the where clause becomes
   `{ userId, completedAt: null, studySetId: studySetId ?? null, mode }`. A user
   studying set A sequentially, then asking for shuffled, gets a new session
   rather than resuming the sequential one.
2. Source construction becomes a switch over `mode`. The `retake` arm loads the
   prior session's cards (`where: { sessionId: retakeOf, hadEmptyBlank: true }`),
   404s if that session isn't the user's, 400s if the list is empty.
3. `mode` is written to the created session row.

Sequential/shuffled skip `loadCandidates` (`:134-180`, due-only) and instead use
a sibling loader over the whole subtree via existing `subtreeIds`, keeping the
load-bearing `answers: { some: {} }` filter — an unhighlighted card is an
inescapable failure loop (`:113-119`). They also skip `dailyCapFor` and
`countReviewsToday`: a deliberate drill is not capped.

### 5.3 `getSession`

Adds `mode` to the select (`:213-226`). `StudySession` type gains
`mode: SessionMode`. The client needs it to decide whether to offer the retake
prompt and to label the session.

### 5.4 Summary

`SessionSummary` gains:

```ts
unanswered: SessionCardRef[]   // cards with hadEmptyBlank
```

`buildSummary` (`:276-340`) adds `hadEmptyBlank: true` as a second filter pass
over the already-selected cards — no extra query. Reuses `cardLabel()` and the
existing `SessionCardRef` shape, like `toRevisit`.

Retake sessions report `unanswered: []` — no retake-of-a-retake. Nothing was
recorded, so there is nothing to build a second list from.

## 6. Grading (`backend/src/study/grading.ts`)

### 6.1 Verdict resolution

`submitAnswer` (`:45-201`) today calls `SpacedRepetitionSource.verdict(grade, attempts)`
(`:163`). That becomes a lookup by `session.mode`:

```ts
const verdict = sourcesByMode[session.mode].onGraded(...)
```

The verdict needs `{ hadEmptyBlank, isDue, correct }`, so the signature widens.
`isDue` requires `dueAt` added to the schedule select (`:101-104`).

### 6.2 `hadEmptyBlank`

Any empty `submitted` → `hadEmptyBlank: true`, written to the session card row
alongside the existing verdict handling (`:166-174`).

### 6.3 `record` gate

Today the Review row and `upsertDailyStats` are written unconditionally
(`:144-160`). Both become conditional on `verdict.record`. `spaced`,
`sequential`, `shuffled` record; `retake` does not. The schedule upsert
(`:138-142`) is gated on `verdict.reschedule` (already effectively true today).

`gradeSubmission` (`:211-240`) itself is unchanged — it only grades. The gates
are applied around its effects.

## 7. Frontend (web)

### 7.1 Mode picker

Route stays one route (`/study`), per ADR §4.10 — mode arrives as a query param:
`/study?set=<id>&mode=sequential`.

The picker is **not a new screen**. `StudySessionPage` currently auto-starts on
mount (`StudySessionPage.tsx:103-115`). New rule: `set` present and no `mode` →
render the picker instead of auto-starting. Two cards — Memorization / Review —
each with a one-line explainer. Picking sets the search param; the existing
mount effect then fires with a mode.

No `set` (Dashboard "study everything") → unchanged, auto-starts `spaced`.
Existing entry points (`SetsPage.tsx:111`, `SetDetailPage.tsx:267`, Dashboard,
Progress) need no edits — a missing `mode` lands on the picker, which is the
desired behavior for set-scoped entries.

### 7.2 Retake prompt

Lives inside `SessionSummaryView.tsx` as a new block above the button row, same
visual shape as the existing "Worth another look" card (`:84-103`):

> **3 cards left blank** — Retake them? `[Retake]` `[No thanks]`

Retake calls `begin()` with `retakeOf: summary.sessionId`. "No thanks" hides
the block, nothing else. Shown only when `summary.unanswered.length > 0`.

A retake session's own summary shows `unanswered: []`, so the prompt cannot
recur. Its stat tiles carry a "practice — not recorded" note, so Cards/Correct
don't read as real progress.

### 7.3 Client state

`useStudySession` (both platforms) — no changes to the queue walker. It walks
whatever the server ordered.

`useStartSession` argument shape widens from `studySetId` to
`{ studySetId?, mode?, retakeOf? }`. `resume.ts` / `mobile/lib/study-resume.ts`
unchanged — they store an id only, and `getSession` returns `mode` with it.

## 8. Mobile

Mirror of the web changes in `mobile/app/(app)/study.tsx` and
`mobile/components/session-summary.tsx`: same query-param picker, same retake
prompt block. `useStartSession` arg shape matches.

## 9. Error handling

| Case                                                | Behavior                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sequential/shuffled, set has zero highlighted cards | 400 `VALIDATION_ERROR`, "This set has no cards to study yet." Reuses the existing 400-as-success branch (`StudySessionPage.tsx:244-279`) |
| `retakeOf` session not the user's                   | 404                                                                                                                                      |
| `retakeOf` has no blank cards                       | 400 (stale summary; prompt only shows when > 0)                                                                                          |
| Card deleted mid-session                            | Already handled (`render.ts:96-98` drops it)                                                                                             |
| Unknown `mode` in query param                       | Falls back to picker, not a crash                                                                                                        |

## 10. Testing

Follows existing file layout.

| File                                                    | Coverage                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/src/study/queue.test.ts`                        | `shuffle` cases (already on the worktree branch, cherry-pick)                                                                                                |
| `backend/src/study/card-source.test.ts`                 | sequential order + createdAt tiebreak; shuffled permutation with pinned `rng`; retake pool; **the verdict matrix per mode** (the whole feature in one table) |
| `backend/src/routes/study.test.ts`                      | mode param round-trip; resume keyed on mode; `retakeOf` 404/400                                                                                              |
| `backend/src/routes/study.answers.test.ts`              | blank doesn't requeue in new modes; retake writes no Review row; not-due card not punished                                                                   |
| `frontend/src/features/study/StudySessionPage.test.tsx` | picker renders without mode; retake prompt appears/hides                                                                                                     |

Mobile has no test runner and zero tests (`mobile/package.json`). Not adding
one for this feature — separate decision. Mobile ships verified by hand.

## 11. Out of scope

- Shuffling the existing spaced-repetition queue (the worktree branch's
  unconditional shuffle). Deliberate: a "shuffled" review that ignores the
  scheduler's ranked selection is a different feature.
- Resume-teardown endpoint (D9).
- A mobile test runner.
- Tag-based filtering, per-card retake, "retake only the empty blanks".

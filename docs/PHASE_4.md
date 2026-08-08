# Phase 4 — Study Mode & the Scheduler

> What was built, why it is shaped this way, and how to prove it works.
>
> **Plan:** [§Phase 4](../IMPLEMENTATION_PLAN.md) · **Depends on:** Phase 1's cloze
> engine, Phase 2's auth, Phase 3's sets and cards

---

## Table of contents

1. [What Phase 4 is](#1-what-phase-4-is)
2. [The nine sub-phases](#2-the-nine-sub-phases)
3. [The scheduling model](#3-the-scheduling-model)
4. [The decisions worth knowing](#4-the-decisions-worth-knowing)
5. [Verifying it yourself](#5-verifying-it-yourself)
6. [Problems hit and how they were fixed](#6-problems-hit-and-how-they-were-fixed)
7. [Before starting Phase 5](#7-before-starting-phase-5)

---

## 1. What Phase 4 is

Phase 3 made cards. Phase 4 is where they are **reviewed** — a queue, a typed
answer, a grade, and a date the card comes back on.

**The bar:** _open the app with cards due, answer them one at a time without the
layout jumping, get a summary, and come back tomorrow to a queue that reflects how
yesterday went._

Two things drove almost every decision:

**The answer key must not reach the browser.** A cloze card is a paragraph plus the
words removed from it. If the client is given both so it can grade locally, the
answers are in devtools — and the failure is invisible, because the UI renders
identically either way. Grading is therefore server-side, and the session payload
carries pre-rendered `segments`, never `paragraph` + `answers`.

**Nothing may move on reveal.** The moment a user submits, the blank is replaced by
the answer. If the blank was sized to its content, every word on the line shifts and
the eye loses the sentence it was reading. Blanks are a fixed width, decided
per-card, and the graded span reuses it.

---

## 2. The nine sub-phases

| #    | Sub-phase                   | Where it lives                                                                              |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------- |
| 4.0a | Shared study contracts      | `shared/src/study/` — `types.ts`, `grades.ts`, `queue.ts`, `session-card.ts`, `day.ts`      |
| 4.0b | Schema + migration          | `backend/prisma/schema.prisma`, `migrations/20260808022910_study_scheduling/`               |
| 4.0c | `CardSource` seam + grading | `backend/src/study/card-source.ts`, `grading.ts`, `settings.ts`                             |
| 4.0d | Study session API           | `backend/src/routes/study.ts`, `backend/src/study/session.ts`, `due-counts.ts`, `render.ts` |
| 4.0e | Backend tests + 90-day sim  | `study.test.ts`, `study.answers.test.ts`, `grading.test.ts`, `simulation.test.ts`           |
| 4.1a | Services + query hooks      | `frontend/src/services/study.ts`, `features/study/queries.ts`                               |
| 4.1b | Study card UI               | `StudyCardView.tsx`, `BlankSlot.tsx`, `useStudySession.ts`                                  |
| 4.1c | Feedback, summary, recovery | `FeedbackPanel.tsx`, `SessionSummaryView.tsx`, `resume.ts`                                  |
| 4.1d | Entry points, verify, docs  | dashboard + library study affordances, this file, the test checklist                        |

Shared came first, as in Phase 3: the grade names, the interval maths and the
day-key arithmetic are all things the two sides must agree about exactly.

The SM-2 maths itself is older than this phase — `shared/src/scheduler/sm2.ts` has
existed since Phase 1, unit-tested against nothing. Phase 4 is where it is finally
called: `grading.ts` imports `calculateNextReview` and `LEECH_THRESHOLD` from shared
rather than re-deriving intervals server-side.

---

## 3. The scheduling model

Three tables, written together in one transaction per review.

| Table              | Holds                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| `card_schedules`   | One row per (user, card): ease factor, interval, repetitions, lapses, `due_at` |
| `reviews`          | An append-only log — one row per graded presentation                           |
| `user_daily_stats` | Per-day rollup: reviews done, cards correct, streak inputs                     |

`due_at` is a **date**, not a timestamp. Spaced repetition is a day-granular idea:
a card due "tomorrow" should be answerable at 07:00 or at 23:00 without the
scheduler treating those differently. All day arithmetic goes through
`shared/src/study/day.ts`, so both sides agree on where a day boundary falls.

### The grades

Four grades, all derived on the server from what the user typed:

| Grade   | When                                       | Effect                              |
| ------- | ------------------------------------------ | ----------------------------------- |
| `again` | No blank correct, or the card was revealed | Interval resets to 1 day, lapse + 1 |
| `hard`  | Some blanks correct, not all               | Interval grows slowly, ease drops   |
| `good`  | Every blank correct                        | Standard SM-2 progression           |
| `easy`  | Every blank correct, first try, fast       | Interval jumps, ease rises          |

A card at `LEECH_THRESHOLD` (8) lapses is a **leech** — it is surfaced in the
summary rather than silently cycling forever.

---

## 4. The decisions worth knowing

### 4.1 The client never sees an answer before it submits

`SessionCard` carries `segments` — the output of `renderCloze` — where each blank is
`{ kind: 'blank', ordinal, answerLength }`. No answer text, and `answerLength` is
the card's uniform blank width, not the individual answer's length, so it does not
leak a length either.

The test asserts against `JSON.stringify(session)`, not `queryByText`. An answer
leaked into a `value` or a `data-` attribute would pass a text query and still be
sitting in the DOM.

### 4.2 Grading is server-side, and the request has no grade field

`submitAnswerSchema` has no `grade`. A client that could name its own grade could
mark every card `easy` and push its whole deck a year out — and the user would only
find out when the cards stopped arriving. A `grade` in the request body is ignored,
which `study.answers.test.ts` asserts directly.

### 4.3 Every blank on a card is the same width

Under the default `fixed` mode, all blanks on a card share one width: that card's
longest answer, floored at `MIN_BLANK_WIDTH` (5). A 3-character slot beside a
5-character one rules out `brain` before the user has thought about it.

The width is `calc(${answerLength}ch + 1rem)`. The `1rem` is `SLOT_PADDING`, matching
`px-2` on both the input and the graded span — that is what makes reveal shift
nothing.

### 4.4 A re-queued card is one card seen twice, not two cards

Fail a card and it goes back into the queue once. Progress reports
`{ answered: 0, total: 1 }` — the denominator does not grow and the numerator does
not advance, because the user has not finished anything. A second failure stops
re-queueing: an unbounded retry loop is a session the user cannot end.

### 4.5 One idempotency key per card _presentation_

The key is issued when a card is shown and reused across manual retries, so a retry
of a request that actually landed replays the original verdict instead of booking a
second review. `advance()` issues a fresh key. Without this, a double-tap on a phone
counts as two recalls and moves the card twice.

### 4.6 The queue is walked client-side and never refetched mid-session

`staleTime: Infinity`, `refetchOnWindowFocus: false`. A background refetch would swap
cards under the user's fingers — mid-typing, on a tab focus they did not think of as
an action.

### 4.7 `scheduledCards` separates two identical-looking zero states

`GET /api/study/due` only returns sets with something due or new, so `counts` is
empty **both** for a user who has never studied and for one who has cleared the day.
Those read completely differently — "caught up for today" is an achievement,
"nothing to study yet" is an invitation — and nothing else in the response tells
them apart. Hence a separate count of schedule rows.

It is deliberately not filtered by the "studiable" predicate: it answers _has this
user ever studied_, and archiving a set or un-highlighting a card does not undo that.

### 4.8 Archiving is observable

Archived sets are excluded from an all-sets session and from the due counts — these
numbers are a workload, and a set the user has put away is not work they owe. But a
session asked for **by id** still runs, mirroring the library, where an archived set
is hidden from the list but still opens.

### 4.9 Recovery stores the session id and nothing else

Interruption recovery keeps only the id, with a 12-hour max age. Storing the queue
would let a stale local copy contradict the server; storing typed answers would put
partial answers in `localStorage` for a feature whose whole point is that the client
is not trusted with grading.

### 4.10 One study route, scoped by query

`/study?set=<id>`, never `/study/sets/<id>`. There is one study screen; which cards
it serves is a parameter, not a different page.

---

## 5. Verifying it yourself

### 5.1 The static gate

```bash
pnpm --filter @saulado/shared build      # frontend typechecks against dist
pnpm --filter @saulado/shared test -- --run
pnpm --filter @saulado/backend exec tsc --noEmit
pnpm --filter @saulado/backend test -- --run
pnpm --filter @saulado/frontend typecheck
pnpm --filter @saulado/frontend test -- --run
pnpm lint                                # root only; backend has no lint script
```

Expected: **224 backend tests, 181 frontend tests, all green, lint clean.**

Build shared _before_ typechecking the frontend. The frontend resolves
`@saulado/shared` to `./dist`, so a new field in `src` that has not been built is
invisible to it — and the error points at the consumer, not the missing build.

### 5.2 The done-when criterion, by hand

Hands-on steps with expected results are in
[`PHASE_4_TEST_CHECKLIST.md`](./PHASE_4_TEST_CHECKLIST.md). The short version:
build a set with two cards, study it, fail one and pass one, and confirm the failed
card comes back in the same session while the passed one does not.

### 5.3 The parts that are easy to mis-verify

**Zero layout shift.** Do not eyeball it mid-sentence. Put a blank in the middle of a
line, note where the following word starts, then submit. Nothing after the blank may
move by a pixel.

**The answer leak.** Open devtools → Network, look at the session response, and search
it for your answer text. "I cannot see it on screen" is not the test.

**Idempotency.** Submit, then replay the same request with the same key from devtools.
The second response must be byte-identical and the progress count must not move.

### 5.4 The 90-day simulation

`simulation.test.ts` runs a synthetic learner for 90 days and asserts the properties
that only show up over time: intervals grow for cards answered correctly, a lapse
resets to 1 day, ease stays inside `[1.3, 2.5]`, and the daily queue does not grow
without bound. A scheduler can look right for one review and diverge over a month.

---

## 6. Problems hit and how they were fixed

### 6.1 The dashboard told a brand-new user "every review is done"

The first cut inferred "has studied" from `totalDue > 0 || newCards > 0`. Both are 0
for a caught-up user _and_ for a user who has just signed up, so a first-run account
was shown an achievement for work it had not begun. Fixed by adding `scheduledCards`
to the endpoint (§4.7) and branching the dashboard on it — four states, not one.

### 6.2 `advance()` dropped every re-queued card

It read `requeued` from inside a `setAnswer` updater. React runs updaters during the
next render, not at the call site, so it always read the previous value — `false` —
and the failed card was never put back. Fixed with an `answerRef` alongside the
state, written through one `setAnswerBoth` helper so the two cannot drift.

### 6.3 Shift+Enter both submitted and revealed

The submit handler matched `Enter` without checking modifiers, so the reveal shortcut
fired the submit on its way through. Fixed with `event.key === 'Enter' && !event.shiftKey`.

### 6.4 A due-counts query that could count another user's schedule rows

`prisma.cardSchedule.count({ where: { userId } })` is correct today, but a future
shared-set feature would make a schedule row reachable through a card the user does
not own. Scoped to `{ userId, card: { set: { userId } } }` so the count cannot widen
underneath us.

### 6.5 Two smaller ones

- The backend has **no** `lint` script — `pnpm --filter @saulado/backend lint` fails
  with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`. Lint is root-only.
- On Windows, a running dev server holds the Prisma query-engine DLL, so
  `prisma generate` fails until it is stopped.

---

## 7. Before starting Phase 5

### Carried forward

- **Blank width mode is a setting with one value in the UI.** `settings.ts` supports
  `fixed` and `exact`; only `fixed` is reachable. Exposing it is a Phase 5+ decision.
- **`totalDue` is uncapped while the session is capped.** Deliberate (§4.7 sibling:
  the badge answers "how much is waiting"), but it means a 300-card backlog shows 300
  and serves fewer. If that reads as broken to real users, the fix is copy, not a cap.
- **No undo on a submitted answer.** A mistyped answer books a real review. The
  re-queue softens it; an explicit undo does not exist.
- **Leeches are surfaced, not acted on.** Nothing suspends a leech yet.

### What Phase 5 can rely on

- Grading, scheduling and the day-boundary maths are server-side and tested,
  including over 90 simulated days.
- `card_schedules`, `reviews` and `user_daily_stats` are written in one transaction,
  so per-day stats cannot disagree with the review log.
- `GET /api/study/due` is the single source for every "what should I do now"
  affordance — dashboard panel, library badges, set-detail button.
- Session state survives a reload (§4.9) and a repeated submit (§4.5).

### Prerequisite check for Phase 5

```bash
pnpm --filter @saulado/backend test -- --run   # 224 passing
pnpm --filter @saulado/frontend test -- --run  # 181 passing
pnpm lint                                       # clean
```

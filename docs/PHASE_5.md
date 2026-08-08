# Phase 5 — Dashboard & Progress

> What was built, why it is shaped this way, and how to prove it works.
>
> **Plan:** [§Phase 5](../IMPLEMENTATION_PLAN.md) · **Depends on:** Phase 4's reviews,
> schedules and `user_daily_stats`

---

## Table of contents

1. [What Phase 5 is](#1-what-phase-5-is)
2. [The eleven sub-phases](#2-the-eleven-sub-phases)
3. [Where the numbers come from](#3-where-the-numbers-come-from)
4. [The decisions worth knowing](#4-the-decisions-worth-knowing)
5. [Verifying it yourself](#5-verifying-it-yourself)
6. [Problems hit and how they were fixed](#6-problems-hit-and-how-they-were-fixed)
7. [Before starting Phase 6](#7-before-starting-phase-6)

---

## 1. What Phase 5 is

Phase 4 made reviews happen. Phase 5 is where they are **reflected back** — a
dashboard that answers "what should I do now", and a progress page that answers
"how have I been doing".

**The bar:** _a new user can go signup → create set → create card → study → see the
result on the dashboard, with no dead ends._

Two things drove almost every decision:

**A zero and an absence are different facts.** This phase is one long application of
that. A user who studied nothing yesterday has `reviews: 0` for yesterday; a user who
had not signed up yet has no entry at all. A rest day is not 0% accuracy. A user with
no history has no streak — not a streak of zero. Collapse any of those and the app
starts telling people they have failed at something nobody asked them to do.

**Progress UI is where apps become punitive.** A streak that resets at midnight, a
ring that dims as the day goes on, a chart that plots a weekend at rock bottom — all
of it is technically accurate and all of it is a machine for making people feel bad.
The plan asks for "honest and non-punitive"; §4.2 is what that turned into in code.

---

## 2. The eleven sub-phases

| #    | Sub-phase                   | Where it lives                                                                                               |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 5.0  | Shared progress contracts   | `shared/src/progress/` — `types.ts`, `series.ts`                                                             |
| 5.1a | Streak calculation          | `backend/src/progress/streak.ts`                                                                             |
| 5.1b | `GET /api/dashboard`        | `backend/src/progress/dashboard.ts`, `routes/progress.ts`                                                    |
| 5.1c | `GET /api/progress`         | `backend/src/progress/progress.ts`, `routes/progress.schemas.ts`                                             |
| 5.1d | Backfill script             | `backend/src/progress/backfill.ts`, `scripts/backfill-daily-stats.ts`                                        |
| 5.1e | Backend tests               | `backend/src/routes/progress.test.ts`                                                                        |
| 5.2a | Chart primitives + ADR 0002 | `frontend/src/components/charts/`, `docs/adr/0002-charts.md`                                                 |
| 5.2b | Dashboard rebuild           | `frontend/src/features/dashboard/DashboardPage.tsx`, `StreakCard.tsx`                                        |
| 5.2c | Progress page               | `frontend/src/features/dashboard/ProgressPage.tsx`                                                           |
| 5.2d | Frontend tests              | `DashboardPage.test.tsx`, `ProgressPage.test.tsx`, `StreakCard.test.tsx`, `charts.test.tsx`, `scale.test.ts` |
| 5.3  | Full gate + docs            | this file, the test checklist, the plan's status block                                                       |

**No migration.** Phase 5 adds no tables and no columns. Every number on both pages
is derived from what Phase 4 already writes — which is the point of having written
`user_daily_stats` on every review since Phase 4 shipped: this phase had real history
to render on day one rather than starting from zero on deploy.

Shared came first again. `accuracyPercent`, `fillDaySeries` and the streak functions
are used on both sides, and the null-vs-zero distinction they encode is the one thing
the two halves absolutely must agree about.

---

## 3. Where the numbers come from

Three sources, and which one a number comes from is a decision, not an accident.

| Source             | Answers                  | Used by                                     |
| ------------------ | ------------------------ | ------------------------------------------- |
| `card_schedules`   | What is due, what is new | `totalDue`, `newCards`, `hasStudied`        |
| `user_daily_stats` | How much per day         | Streak, sparkline, day series, today's ring |
| `reviews`          | What happened, per card  | The per-set breakdown                       |

### The rollup is a cache

`user_daily_stats` is **not** a source of truth — `reviews` is. The rollup exists
because the dashboard and the streak both need "reviews on day N" for the last few
months, and computing that by scanning the review log gets slower every day the user
keeps studying. A 365-day view is one indexed range scan instead of a scan of
everything they have ever done.

They can drift: a timezone change moves which calendar day past reviews belong to, a
partial restore loses rows, seeded data never had them. `backfill-daily-stats.ts`
(§4.7) is the repair path, and it is what makes the schema comment's promise — "if it
ever drifts, it can be rebuilt from here" — true rather than aspirational.

### The per-set table comes from the log, not the rollup

Because the rollup has **no set dimension**. Adding one would mean a row per user per
day per set, which is exactly the cardinality the rollup exists to avoid. So the
day series comes from the rollup and the per-set breakdown from the log, and they are
reconciled by using the identical correctness predicate on both sides (§4.5).

---

## 4. The decisions worth knowing

### 4.1 Two endpoints, deliberately not one

`GET /api/dashboard` is on the critical path of **every app open**. `GET /api/progress`
is a page the user navigates to. Folding the second into the first would make the home
screen wait on a 90-day scan it does not render.

The dashboard is still "one request, not six" internally: `Promise.all` over five
queries, so they arrive together in one round-trip time rather than six. A dashboard
that assembles piecemeal shifts layout under the user four times before settling.

### 4.2 The streak is intact until a day passes without study

`currentStreak` anchors on **today if studied, otherwise yesterday**.

This one line is the difference between a streak that motivates and one that punishes.
At 09:00 a user who has studied every day for a month has not studied _yet today_.
Anchoring blindly on today reports 0 — for most users, for most of the day.

The copy agrees with the number rather than undercutting it. Four states:

| `current` | `studiedToday` | Reads as                                           |
| --------- | -------------- | -------------------------------------------------- |
| 0         | false          | "Start a streak today" — an invitation             |
| n         | true           | "n days in a row" — a plain statement              |
| n         | false          | "n days in a row" · "Studying today continues it." |

No countdown, no flame that dims, no "don't break it". A returning user whose 30-day
run lapsed is told their longest run _was_ 30 days; they are never shown the wreckage.

### 4.3 A new user is shown nothing rather than zeroes

The dashboard's streak, goal ring and sparkline are gated on `hasStudied`. All three
would render _truthfully_ as zero on a first visit, and three zeroes on a first visit
is three pieces of evidence that the user has failed at something they have not been
offered yet (saulado-ux §5).

`/progress` does the same, keyed on `totals.reviews === 0` rather than `days.length` —
the day series is dense by contract and therefore always non-empty, so its length says
nothing about whether there is anything to show. Getting this wrong renders four charts
of flat zero, which is the exact failure mode the gate exists to prevent.

What is _not_ hidden: their sets. Those are their work, not a statistic about it.

### 4.4 A rest day is a gap, never a zero

`accuracyPercent` returns `null` for zero reviews rather than 0. Zero reviews is not
zero percent correct — it is undefined — and the difference survives all the way to
the pixel:

- the bar chart's table says **"No reviews"**, not "0%"
- the trend line **breaks**, drawing one polyline per run of consecutive studied days
- the heatmap square is unfilled but present

A line dropping to the floor every weekend shows a cliff the user never fell off. A
line joined straight across invents a measurement that was never taken. A gap is the
only honest option.

The other half of the same rule: a day with three reviews and none correct **is** 0%,
and must not be softened into "no reviews".

### 4.5 `correct` means every blank, on both sides of the page

`grading.ts` sets `correct: !revealed && isCardCorrect(checks)` — true only when every
blank on the card is right. That maps to grade `good` or `easy`, never `hard`, which
is _some_ blanks right.

`user_daily_stats.correct_count` was incremented by that flag, so the per-set query
has to match it exactly:

```ts
const CORRECT_GRADE = { gte: GRADE_CODES.good }
```

`grade > 0` would count `hard` and make the per-set table disagree with the chart
directly above it, for the same window, on the same screen. Row E.7 of the checklist
is the manual version of this check.

### 4.6 `goalMet` is latched and cannot be rebuilt

It is a **snapshot** of whether the day's reviews met the goal _as it was that day_.
The review log does not record the goal and `user_settings` holds only the current one,
so a day's `goalMet` is unrecoverable once lost.

Consequences, both deliberate:

- Lowering the daily goal cannot retroactively award days the user did not earn;
  raising it cannot revoke days they did.
- The backfill only ever **promotes** `goalMet`, never clears it. For rows it creates
  from scratch it evaluates against the current goal and says so in its output — an
  approximation the operator knows about beats a silent guess.

### 4.7 The backfill defaults to a dry run

It deletes rollup rows it finds no reviews behind, and the safe direction for a
destructive default is off. An operator who has read the dry-run output and typed
`--apply` has consented to those deletions; one who typed the command to see what it
does has not.

```bash
pnpm --filter @saulado/backend db:backfill              # dry run, all users
pnpm --filter @saulado/backend db:backfill -- --apply   # write it
pnpm --filter @saulado/backend db:backfill -- --user <uuid>
```

Reviews are read in pages of 5,000 by cursor, so one prolific user cannot exhaust
memory. Day keys are computed in the user's **current** timezone, which is the
intended behaviour: after a move, "which day did I study on" should be answered in the
zone the user is now in — that drift is exactly what this script reconciles.

### 4.8 Charts are hand-rolled, and the reason is accessibility

Full reasoning in [ADR 0002](./adr/0002-charts.md). The short version: **the
accessibility work is the majority of the work, and no library does it for us.**

Recharts is ~110 KB gzipped and has no heatmap. `visx` is small, but the thing it
supplies here is `scaleLinear`, and the scale is `value / max * 100`. Either way the
accessible table, the colour-blind-safe ramp and the touch behaviour are ours to
write. So they are written once, in `ChartFigure`, where they cannot be forgotten in
the fourth chart.

`ChartFigure` is the whole contract: a `<figure>`, an `aria-hidden` picture, and an
`sr-only` `<table>` carrying the same data. Neither is a fallback for the other.

Three consequences worth knowing:

- **No hover tooltips carry information.** Hover does not exist on touch and is
  unavailable to keyboard users. The heatmap has a native `title` for pointer users as
  a convenience, but every number in it is also in the table.
- **Nothing animates.** `prefers-reduced-motion` is satisfied by construction rather
  than by a media query — there is no transition anywhere in `components/charts/`.
- **Heatmap intensity varies by lightness, not hue.** Five levels of one colour, so
  the ordering survives every form of colour blindness. A red-to-green ramp collapses
  to a flat field for a deuteranope, which would delete the chart's only channel of
  meaning for roughly 8% of men.

### 4.9 Bars are HTML, the trend line is SVG

Not a stylistic split. A bar chart is a row of rectangles with percentage heights,
which flexbox does responsively at any width with no `viewBox` arithmetic and with
axis labels at their natural size. A polyline through N points is genuinely geometry.

The SVG uses `preserveAspectRatio="none"` to stretch to any container, and
`vectorEffect="non-scaling-stroke"` so the stroke does not thicken as it does — the
pair is what makes a fixed `viewBox` behave responsively without a resize observer.

### 4.10 A day with one review never looks like a day with none

Two independent floors, because sub-pixel rendering silently erases small values:

- `barHeightPercent` floors any non-zero bar at 4%. One review against a 200-review
  peak is 0.5% — under a pixel at any realistic chart height.
- `levelFor` gives any day with at least one review level 1 or above. Levels are
  quartiles of the user's _busiest_ day, because "a busy day" is twenty reviews for
  one person and three hundred for another.

### 4.11 The window is bounded, and it is stated in the type

`range` is a closed enum — `7d | 30d | 90d | 365d` — not a day count. Accepting
`?days=99999` would let any caller ask for a scan of the entire review log: a cheap
request to make, an expensive one to serve, which is the shape of an accidental denial
of service. It also keeps the cache key space small enough that switching
30d → 90d → 30d renders instantly.

The streak read is windowed the same way, at 400 days. `longest` is therefore scoped
to that window: understated for a user with a longer run further back, never
overstated, which is the safe direction for a number meant to encourage.

### 4.12 Answering a card invalidates the dashboard

`useSubmitAnswer` invalidates `dashboardKeys.all` per answer, not just at session end —
the tab the user left the dashboard open in is precisely the one that should not still
be showing this morning's zero. `useCompleteSession` invalidates `progressKeys.all`,
**every** range rather than the one last viewed: a session that ends today changes
today, and today is the last day of all four windows.

---

## 5. Verifying it yourself

> **Status: none of this has been run yet.** The shell was unavailable for the whole
> of the session that finished Phase 5, so `tsc`, `vitest` and `prettier` have not
> executed once against any file in this phase. Everything below is the gate to run,
> not a report of it passing. What stands in for it so far is a read-only review —
> Prisma fields cross-checked against `schema.prisma`, shared imports against their
> definitions, a hand-trace of the chart render structures against their test
> assertions, and a line-length sweep against the already-linted files as a control.
> That found two wrong doc comments and five formatting breaks, and no code defects,
> which is weaker evidence than a green suite and should not be read as one.

### 5.1 The static gate

```bash
pnpm --filter @saulado/shared build      # both packages typecheck against dist
pnpm --filter @saulado/shared test -- --run
pnpm --filter @saulado/backend exec tsc --noEmit
pnpm --filter @saulado/backend test -- --run
pnpm --filter @saulado/frontend typecheck
pnpm --filter @saulado/frontend test -- --run
pnpm lint                                # root only; backend has no lint script
```

Build shared _before_ typechecking either consumer. Both resolve `@saulado/shared` to
`./dist`, so a new field in `src` that has not been built is invisible — and the error
points at the consumer, not the missing build.

The backend suite runs against the **dev database** and cleans up after itself by user
rather than truncating, so it is safe to run with data in it.

### 5.2 The done-when criterion, by hand

Hands-on steps with expected results are in
[`PHASE_5_TEST_CHECKLIST.md`](./PHASE_5_TEST_CHECKLIST.md). Part L is the plan's
criterion verbatim: signup → set → card → study → dashboard, on a fresh account, with
no dead ends.

### 5.3 The parts that are easy to mis-verify

**A brand-new account.** Everything in this phase looks fine once you have a fortnight
of history. Register a genuinely fresh account and check that the dashboard shows _no_
streak, _no_ ring, _no_ sparkline — not zeroed versions of them. This is Part B, and
it is the check most likely to be skipped and most likely to be broken.

**The morning streak.** Delete today's `user_daily_stats` row while keeping
yesterday's. The streak must not drop. Checking at a moment when you happen to have
already studied proves nothing.

**Rest days in the trend line.** Do not eyeball the line's shape. Find a specific day
you did not study and confirm the line _stops_. A line that dips to 0% and recovers
looks like a bad day; it is actually a claim you got everything wrong on a day you were
not there.

**The heatmap's first column.** If it is not padded, every square sits one row off and
the weekday labels are lying — while the chart still looks entirely plausible. Check
one real date against a calendar.

**Colour blindness.** devtools → Rendering → Emulate vision deficiencies →
deuteranopia. The five heatmap levels must remain distinguishable.

---

## 6. Problems hit and how they were fixed

### 6.1 `grade > 0` counted partially-correct cards

The first cut of the per-set query treated any grade above `again` as correct. That
includes `hard`, which is _some_ blanks right — so the per-set table would have
reported a higher accuracy than the chart directly above it, for the same window, with
no indication which was wrong. Fixed to `{ gte: GRADE_CODES.good }`, matching
`grading.ts`'s `isCardCorrect` exactly (§4.5).

### 6.2 `<title>` inside an HTML `<span>`

The heatmap's per-square tooltip was written as an SVG `<title>` child. `<title>` is
an SVG/`<head>` element and is not valid inside an HTML `<span>` — it would not have
rendered as a tooltip at all, and the "hover for the count" affordance would have been
silently absent. Fixed by moving it to a `title` **attribute**.

### 6.3 A heatmap test that asserted nothing

The week-alignment test reached into the DOM with
`container.querySelectorAll('.flex-col.gap-1')` — which also matched the weekday-label
column — and then asserted `length > 0`. It would have passed against almost any
implementation, including a broken one.

Fixed by exporting `toWeeks` and `levelFor` from `Heatmap.tsx` and testing them as
pure functions: leading-null padding, seven-tall columns, Sunday column boundaries,
and `levelFor(1, 500) >= 1`. Padding is arithmetic, and arithmetic should be tested as
arithmetic.

### 6.4 Fixtures whose totals disagreed with their own day series

Two `ProgressPage` fixtures derived per-day `correct` counts as `Math.floor(reviews *
0.8)` while asserting hand-written `totals`. The two did not add up. Harmless in a test
that never compares them — and precisely the disagreement E.7 exists to catch, so a
fixture that embodies it would let the real bug through. Both now pass explicit
`correct` arrays that sum to the asserted totals.

### 6.5 Two doc comments that described code that was not there

`SetProgress.cardsStudied` was documented as "cards with a schedule row, i.e. seen at
least once" while the implementation counts cards reviewed **within the window** — and
the docblock two lines above it explains why everything in that type is window-scoped.
A `ProgressPage` test comment claimed a zero-review set was reachable from the server;
`readPerSet` filters those out, making it a contract test rather than a reachability
one. Both corrected to describe what the code does.

---

## 7. Before starting Phase 6

### Carried forward

- **`longest` is window-scoped to 400 days.** A user who beats a streak older than
  that is shown their recent best. Understated, never overstated — but it is not the
  all-time figure the label implies.
- **`goalMet` cannot be rebuilt** (§4.6). Any future change to how goals are stored
  should consider recording the goal on the daily row, which would make it recoverable.
- **The per-set query fetches every card id for every set.** One query, but it grows
  linearly with the library. Fine at v1 sizes; the fix when it is not is a grouped
  join through `study_sets`.
- **No per-set filter on the progress page.** The table lists every set studied in the
  window; there is no way to chart one set alone.
- **The heatmap has no year navigation.** `365d` shows the last 365 days, not a
  calendar year, and there is no way back to an earlier one.

### What Phase 6 can rely on

- `GET /api/dashboard` and `GET /api/progress` are the only two aggregate reads, both
  auth-scoped, both cross-user tested.
- `shared/src/progress/` owns the null-vs-zero rule. Anything else rendering a
  percentage should use `accuracyPercent` rather than dividing.
- `ChartFigure` is the accessibility contract for any future chart — a new chart gets
  its table for free and cannot ship without one.
- The rollup has a tested rebuild path, so a timezone-change feature in Phase 6's
  settings work has somewhere to call when it moves a user's day boundary.

### Prerequisite check for Phase 6

```bash
pnpm --filter @saulado/backend test -- --run   # green
pnpm --filter @saulado/frontend test -- --run  # green
pnpm lint                                       # clean
```

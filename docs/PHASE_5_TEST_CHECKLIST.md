# Phase 5 — Manual test checklist

> Every row is one action and the **one correct result**. If the result differs, that
> row failed — note it and keep going, later rows still tell you something.
>
> Companion to [PHASE_5.md](./PHASE_5.md), which explains _why_ each check exists.

**Legend:** ✅ correct · ❌ a real bug · ⚠️ needs a phone (Part K) · 🔒 security

Phase 5 has an unusual property: **its hardest bugs are invisible on a mature
account.** A dashboard that insults a brand-new user, a streak that punishes them
for opening the app in the morning, a chart that reads a rest day as total failure
— every one of those looks fine once you have a fortnight of history. Parts B, C
and I are the ones that need a genuinely fresh account, and they are the ones worth
doing first.

---

## Part 0 — Get it running

| #   | Do this                  | Correct result                                                               |
| --- | ------------------------ | ---------------------------------------------------------------------------- |
| 0.1 | `pnpm install`           | Finishes, and `postinstall` builds `shared` — `shared/dist/progress/` exists |
| 0.2 | `pnpm db:up`             | Postgres starts. `docker ps` shows it on **5432**                            |
| 0.3 | `pnpm db:migrate`        | **No new migration.** Phase 5 adds no tables — it reads what Phase 4 writes  |
| 0.4 | `pnpm dev`               | Frontend **:5173**, backend **:3000**                                        |
| 0.5 | Register a fresh account | Lands on the dashboard. Use a **new** account — Parts B and C depend on it   |

> Keep this account. Part I asks you to come back to a second brand-new one, and
> registering it after you have seen the populated dashboard is the only way to
> notice what a new user is shown.

---

## Part A — The automated gate

Run from the repo root. **Do not pipe these through `tail`** — the exit code you see
becomes `tail`'s, so a failing command reports success.

| #   | Command                                            | Correct result                                                                                                            |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A.1 | `pnpm --filter @saulado/shared build`              | Exit 0. **Run this first** — both other packages typecheck against `shared/dist`, so skipping it checks the _old_ version |
| A.2 | `pnpm --filter @saulado/shared test -- --run`      | All green, 14 files                                                                                                       |
| A.3 | `pnpm --filter @saulado/backend exec tsc --noEmit` | **No output at all.** Any output is a failure                                                                             |
| A.4 | `pnpm --filter @saulado/frontend typecheck`        | No errors                                                                                                                 |
| A.5 | `pnpm --filter @saulado/backend test -- --run`     | All green. Needs Postgres up                                                                                              |
| A.6 | `pnpm --filter @saulado/frontend test -- --run`    | All green                                                                                                                 |
| A.7 | `pnpm lint`                                        | No output, exit 0. (There is **no** backend `lint` script — root only)                                                    |
| A.8 | `pnpm format:check`                                | `All matched files use Prettier code style!`                                                                              |

The one worth reading the output of is the last `describe` in
`backend/src/routes/progress.test.ts` — **"the rollup and the log agree"**. It
asserts `user_daily_stats.reviews_count` equals the number of `reviews` rows behind
it. That is the invariant the whole progress page rests on, and it is the one thing
a backfill exists to repair.

---

## Part B — What a brand-new account is shown 🔒

Do this **before creating anything**, on the account from 0.5. This is the state
Phase 5 is most likely to get wrong, and the damage is not a crash — it is a first
impression.

| #   | Do this                            | Correct result                                                                                      |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| B.1 | Look at the dashboard              | **"What a card looks like"** — a worked example with a blank in it                                  |
| B.2 | Look for a streak                  | **Nothing.** No "Streak", no "0 days", no "Start a streak today"                                    |
| B.3 | Look for a goal ring               | **Nothing.** Not an empty ring, not "0 of 20 reviews"                                               |
| B.4 | Look for a sparkline               | **Nothing.** No "Last 7 days", no row of flat bars                                                  |
| B.5 | Look for a "Your progress" heading | **Absent entirely**                                                                                 |
| B.6 | Count the large buttons            | Exactly **one**: "Create your first set"                                                            |
| B.7 | Open `/progress`                   | **"No reviews yet"** and a sentence about what the page will show. **Not** four charts of flat zero |
| B.8 | Count the charts on `/progress`    | **Zero.** No axes, no empty grid, no "0%"                                                           |

> B.2–B.5 are the load-bearing ones. Every one of those numbers would be _accurate_.
> Three zeroes on a first visit is three pieces of evidence that the user has failed
> at something nobody has asked them to do yet. If you see any of them, that is ❌.

---

## Part C — First card, first review

| #   | Do this                                                                               | Correct result                                                               |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| C.1 | From the dashboard, click **"Create your first set"**                                 | A dialog opens — no navigation away first                                    |
| C.2 | Name it **"Cell Biology"**, save                                                      | Lands on `/sets/<id>`, not back on the dashboard                             |
| C.3 | Add a card: `Mitochondria are the powerhouse of the cell`, highlight **Mitochondria** | Saves, listed as **1 blank**                                                 |
| C.4 | Go back to the dashboard                                                              | **"New cards 1"**, button **"Start learning"**                               |
| C.5 | Check for a streak now                                                                | **Still nothing.** A card exists; nothing has been _studied_                 |
| C.6 | Study the card, answer it correctly, finish the session                               | Summary screen                                                               |
| C.7 | Return to the dashboard                                                               | **"Streak — 1 day in a row"** appears, along with the ring and the sparkline |
| C.8 | Read the goal ring                                                                    | **"1 of 20 reviews"** and **"19 to go today."**                              |
| C.9 | Read the sparkline label                                                              | "Reviews in the last 7 days: 1 review over 1 of the last 7 days"             |

> C.5 → C.7 is the whole gate. `hasStudied` is what flips, and it is driven by a
> schedule row, not by a card existing. If the streak showed up at C.5, the
> discriminator is wrong.

> C.8 says **"19 to go today."** — not "19 short of your goal", not "you have missed
> 19". The framing is what remains, not what is absent.

---

## Part D — The streak, in its four states

The only one you can produce naturally is D.1. The rest need a nudge — use Prisma
Studio (`pnpm db:studio`) on `user_daily_stats`, which is a rollup and safe to
edit for a test account.

| #   | Set up                                                 | Correct result on the dashboard                                 |
| --- | ------------------------------------------------------ | --------------------------------------------------------------- |
| D.1 | Studied today (from C.6)                               | "1 day in a row" · "That is your longest run yet."              |
| D.2 | Add a row for **yesterday** with `reviews_count: 5`    | "2 days in a row"                                               |
| D.3 | Delete **today's** row, keep yesterday's               | **Still "1 day in a row"** — and "Studying today continues it." |
| D.4 | Delete every row                                       | "Start a streak today" · "A streak is any run of days…"         |
| D.5 | Add rows for 5 consecutive days ending **a month ago** | "Start a streak today" · "Your longest run so far is 5 days."   |

> **D.3 is the one that matters.** At 09:00 a user with a month-long streak has not
> studied _yet today_. Their streak is intact. If the number drops to 0, or the copy
> says anything like "don't break it", that is ❌ — the app is punishing someone for
> opening it in the morning.

> **D.5** must not mention that the run ended. "Your longest run so far is 5 days" ✅.
> Anything that names a lost streak ❌.

Search the dashboard and `/progress` for these words. None should appear:
`don't break` · `lost` · `losing` · `broken` · `failed` · `missed` · `expires` ·
`last chance`.

---

## Part E — The progress page

Study on at least three separate days first — or edit `user_daily_stats` to fake
them. Non-consecutive days are what make E.4 and E.5 meaningful.

| #   | Do this                                 | Correct result                                                                              |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| E.1 | Open `/progress`                        | Summary row, two charts, a heatmap, a per-set table                                         |
| E.2 | Read the four summary tiles             | Reviews · Accuracy · Days studied ("of 30") · Streak                                        |
| E.3 | Check the reviews-per-day chart         | Every day in the window has a slot, including the idle ones                                 |
| E.4 | Find a day you did **not** study        | A **gap** in the accuracy trend line — the line stops and restarts, it does not dip to zero |
| E.5 | Find a day with reviews but poor recall | Accuracy genuinely plots low. A real 0% is a real 0%                                        |
| E.6 | Check the per-set table                 | One row per set studied **in this window**. Sets you did not touch are absent               |
| E.7 | Add the per-set "Reviews" column up     | Equals the "Reviews" summary tile exactly                                                   |
| E.8 | Click a set name in the table           | Opens `/sets/<id>`                                                                          |

> **E.4 is the single most important row on this page.** A trend line that drops to
> 0% on a rest day is telling the user they got everything wrong on a day they did
> not study. If the line is continuous across a gap, that is ❌.

> **E.7** is the check that catches a wrong correctness predicate. The day chart
> counts a review as correct when _every_ blank was right; if the per-set table used
> a looser rule it would silently disagree with the chart directly above it.

---

## Part F — The range switcher

| #   | Do this                                     | Correct result                                                          |
| --- | ------------------------------------------- | ----------------------------------------------------------------------- |
| F.1 | Look at the four range options              | 7 days · 30 days · 90 days · A year. **30 days** selected on arrival    |
| F.2 | Click into the switcher and press **→**     | Moves to the next range and loads it — it is a radio group, not buttons |
| F.3 | Switch to **A year**                        | Loads. The heatmap becomes wide and scrolls horizontally                |
| F.4 | Switch back to **30 days**                  | **Instant** — it is cached, no spinner                                  |
| F.5 | Check "Days studied" on each range          | The "of N" denominator changes: of 7 · of 30 · of 90 · of 365           |
| F.6 | Visit `/api/progress?range=99999d` directly | **400** with `VALIDATION_ERROR`. Not a 500, not a year-long scan        |

> F.6 is 🔒. `range` is a closed enum rather than a day count precisely so a caller
> cannot ask for an arbitrarily expensive scan with a cheap request.

---

## Part G — The heatmap

| #   | Do this                               | Correct result                                                             |
| --- | ------------------------------------- | -------------------------------------------------------------------------- |
| G.1 | Find today's square                   | It is the **last** square, bottom-right of the final column                |
| G.2 | Check which row today sits on         | The row matching today's weekday (Sunday is the top row)                   |
| G.3 | Hover a studied square                | A tooltip: "Thu 6 Aug: 20 reviews"                                         |
| G.4 | Find your quietest studied day        | **Visibly filled** — a day with one review must never look like a rest day |
| G.5 | Count the squares in the first column | Exactly 7, including the blank padding ones                                |
| G.6 | Read the caption                      | "N days studied. Darker means more reviews."                               |

> G.2 fails silently and looks fine. If the first column is not padded, every square
> sits one row off and the weekday labels are lying. Check it against a real calendar.

---

## Part H — Accessibility ♿

The charts are hand-rolled (see [ADR 0002](./adr/0002-charts.md)), which means the
accessible table _is_ the chart — not a fallback for it.

| #   | Do this                                                                    | Correct result                                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| H.1 | Tab through `/progress` from the top                                       | Range switcher → chart region → set links. No focus trap, visible ring    |
| H.2 | Turn on a screen reader, land on the reviews chart                         | Reads a **table**: "Day, Reviews, Correct, Accuracy" then row by row      |
| H.3 | Listen to a rest-day row                                                   | **"No reviews"** — not "0%"                                               |
| H.4 | Listen to the bars themselves                                              | **Silence.** The picture is `aria-hidden`; you should hear the table only |
| H.5 | Enable "reduce motion" in the OS, reload                                   | No difference — nothing on this page animates in the first place          |
| H.6 | Switch to dark mode, look at the heatmap                                   | All five levels still distinguishable                                     |
| H.7 | Simulate deuteranopia (devtools → Rendering → Emulate vision deficiencies) | The heatmap **still reads**. Levels vary by lightness, not hue            |
| H.8 | Zoom to 200%                                                               | Charts reflow, the heatmap scrolls. Nothing is clipped or overlapping     |

> H.7 is why the heatmap is one colour at five opacities rather than a red-to-green
> ramp. A red/green scale collapses to a flat field for a deuteranope, which means
> the chart's only channel of meaning disappears for ~8% of men.

---

## Part I — A second brand-new account 🔒

Register a **second** fresh account now that you know what the populated dashboard
looks like. This catches cross-user leaks and re-checks Part B with fresh eyes.

| #   | Do this                                   | Correct result                                                   |
| --- | ----------------------------------------- | ---------------------------------------------------------------- |
| I.1 | Look at the dashboard                     | The Part B state again. **No streak, no ring, no sparkline**     |
| I.2 | Open `/progress`                          | "No reviews yet". Not account one's numbers, not zeros in charts |
| I.3 | Call `GET /api/dashboard` as this account | `totalDue: 0`, `hasStudied: false`, `recentSets: []`             |
| I.4 | Check `sparkline` in that response        | **Exactly 7 entries**, all zeroed, oldest first, ending today    |
| I.5 | Call `GET /api/progress` as this account  | `days` has **30 entries**, all zero. `perSet` is `[]`            |

> I.4 and I.5 look pedantic and are not. The series is dense _by contract_ — a chart
> fed a sparse array draws Monday next to Friday and lies about the shape of a week.
> An empty array here would be a different bug from a zeroed one.

---

## Part J — The backfill script

`user_daily_stats` is a rollup; `reviews` is the truth. This is the repair path.

| #   | Do this                                                                   | Correct result                                                           |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| J.1 | `pnpm --filter @saulado/backend db:backfill`                              | "Dry run — nothing will be written." then a report                       |
| J.2 | On a healthy database, read the report                                    | **0 created, 0 corrected, 0 orphaned**                                   |
| J.3 | In Prisma Studio, change one day's `reviews_count` to a wrong number      | —                                                                        |
| J.4 | Re-run the dry run                                                        | **1 row disagreeing with the log**, showing `stored → actual`            |
| J.5 | Check the database                                                        | **Still wrong.** A dry run must not write                                |
| J.6 | `pnpm --filter @saulado/backend db:backfill -- --apply`                   | "Backfilling…", then the same report                                     |
| J.7 | Check the database                                                        | Corrected                                                                |
| J.8 | Delete a day's row entirely, dry-run                                      | **1 row missing**, noted as "goalMet approximated from the current goal" |
| J.9 | Set a day's `goal_met` to true, lower your daily goal, run with `--apply` | `goal_met` is **still true**                                             |

> J.5 is the one to actually verify rather than assume. This script deletes rollup
> rows it finds no reviews behind; a destructive default that runs before you have
> read the output is the kind of thing you only discover once.

> J.9 is the documented limitation. `goalMet` is a snapshot of whether the goal was
> met _as it was that day_, and the review log does not record the goal — so the
> script can only ever promote it, never clear it. A day already earned stays earned.

---

## Part K — Mobile ⚠️

Real device, or devtools at 320px.

| #   | Do this                       | Correct result                                                   |
| --- | ----------------------------- | ---------------------------------------------------------------- |
| K.1 | Dashboard at 320px            | Single column. Nothing clipped, no horizontal scroll on the page |
| K.2 | Tap targets on the set rows   | At least 44px tall                                               |
| K.3 | `/progress` at 320px          | Charts reflow. The **heatmap** scrolls horizontally, alone       |
| K.4 | The per-set table at 320px    | Scrolls horizontally inside its own container                    |
| K.5 | Try to hover a heatmap square | Nothing happens — and that is fine, the counts are in the table  |

> K.5 is ADR 0002's reasoning made visible: hover does not exist on touch, so no
> number is allowed to live _only_ in a tooltip.

---

## Part L — The done-when criterion

The plan's bar for Phase 5, start to finish, on one fresh account, **with no dead
ends**. Do not skip to the middle.

| #   | Do this                          | Correct result                                               |
| --- | -------------------------------- | ------------------------------------------------------------ |
| L.1 | Sign up                          | Dashboard, with "What a card looks like"                     |
| L.2 | Create a set from the dashboard  | Dialog → lands on the new set                                |
| L.3 | Create a card with one highlight | Saved, 1 blank                                               |
| L.4 | Follow the dashboard's CTA       | Straight into a session                                      |
| L.5 | Answer it, finish                | Summary                                                      |
| L.6 | Land back on the dashboard       | Streak, ring and sparkline are **now present and all say 1** |
| L.7 | Click "See all progress"         | `/progress`, showing today's single review                   |
| L.8 | Retrace every screen             | Every one had a way forward. **No screen was a dead end**    |

If L.6 shows the section but L.7 shows "No reviews yet", the two endpoints disagree
about whether the user has studied — check `hasStudied` against `totals.reviews`.

---

## What "done" looks like

- Part A green.
- **Part B clean** — no zeroes shown to a user with no history.
- **D.3 intact** — a morning streak is not a broken streak.
- **E.4 broken** — the accuracy line has gaps, not zero-dips.
- **H.7 legible** — the heatmap survives colour blindness.
- **J.5 unwritten** — the dry run wrote nothing.
- Part L end to end with no dead ends.

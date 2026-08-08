# Phase 4 — Manual test checklist

> Every row is one action and the **one correct result**. If the result differs, that
> row failed — note it and keep going, later rows still tell you something.
>
> Companion to [PHASE_4.md](./PHASE_4.md), which explains _why_ each check exists.

**Legend:** ✅ correct · ❌ a real bug · ⚠️ needs a phone (Part J) · 🔒 security

---

## Part 0 — Get it running

| #   | Do this                     | Correct result                                                                    |
| --- | --------------------------- | --------------------------------------------------------------------------------- |
| 0.1 | `pnpm install`              | Finishes, and `postinstall` builds `shared` — `shared/dist/study/` exists         |
| 0.2 | `pnpm db:up`                | Postgres starts. `docker ps` shows it on **5432**                                 |
| 0.3 | `pnpm db:migrate`           | Applies `20260808022910_study_scheduling`. **No prompt to reset the database**    |
| 0.4 | `pnpm db:studio`, look once | Three new tables: `card_schedules`, `reviews`, `user_daily_stats`. All empty      |
| 0.5 | `pnpm dev`                  | Frontend **:5173**, backend **:3000**                                             |
| 0.6 | Register a fresh account    | Lands on the dashboard. Use a **new** account — Part A's counts assume no history |

> On Windows, `prisma generate` fails while `pnpm dev` is running: the dev server holds
> the query-engine DLL. Stop the server first.

---

## Part A — The automated gate

Run from the repo root. **Do not pipe these through `tail`** — the exit code you see
becomes `tail`'s, so a failing command reports success.

| #   | Command                                            | Correct result                                                                                                           |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A.1 | `pnpm --filter @saulado/shared build`              | Exit 0. **Run this first** — the frontend typechecks against `shared/dist`, so skipping it checks the _previous_ version |
| A.2 | `pnpm --filter @saulado/shared test -- --run`      | **240 passed**, 13 files                                                                                                 |
| A.3 | `pnpm --filter @saulado/backend exec tsc --noEmit` | **No output at all.** Any output is a failure                                                                            |
| A.4 | `pnpm --filter @saulado/frontend typecheck`        | No errors                                                                                                                |
| A.5 | `pnpm --filter @saulado/backend test -- --run`     | **226 passed**, 14 files. Needs Postgres up                                                                              |
| A.6 | `pnpm --filter @saulado/frontend test -- --run`    | **186 passed**, 11 files                                                                                                 |
| A.7 | `pnpm lint`                                        | No output, exit 0. (There is **no** backend `lint` script — root only)                                                   |
| A.8 | `pnpm format:check`                                | `All matched files use Prettier code style!`                                                                             |

The one worth reading the output of is **A.5** — `simulation.test.ts` inside it runs a
synthetic learner for 90 days. A scheduler can be right for one review and drift over
a month; that test is the only thing that catches the drift.

---

## Part B — Nothing to study yet (a brand-new account)

Do this **before** creating any cards. It is the state that is easiest to break and
hardest to get back to.

| #   | Do this                       | Correct result                                                                                 |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| B.1 | Look at the dashboard         | **"What a card looks like"** — a worked example with a blank in it                             |
| B.2 | Look for a number             | **No count anywhere.** Not "0 due", not "Due today". A zero here reads as broken, not as empty |
| B.3 | Read the blank in the example | Fixed width, ~8 characters, regardless of the answer behind it                                 |
| B.4 | Find the call to action       | **"Create your first set"**, linking to the library                                            |
| B.5 | Go to `/study` directly       | **"Nothing due right now"** with a way back — not a spinner, not a crash                       |
| B.6 | Open `/sets`                  | **No Study button** on anything (there is nothing to study)                                    |

---

## Part C — Build something to study

| #   | Do this                                                                             | Correct result                                    |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| C.1 | Create a set **"Computer Architecture"**                                            | Lands on the set page                             |
| C.2 | Add card 1: `The CPU is the brain of the computer`, highlight **CPU** and **brain** | Saves, listed as **2 blanks**                     |
| C.3 | Add card 2: `RAM stores temporary data`, highlight **RAM**                          | Saves, **1 blank**                                |
| C.4 | Add card 3: same paragraph, **highlight nothing**                                   | Saves — highlighting can come later. **0 blanks** |
| C.5 | Go to the dashboard                                                                 | **"New cards 2"**, button **"Start learning"**    |

> C.5 is the check people skip. The count is **2**, not 3 — card 3 has no blanks, and
> a card with no blanks can never be answered correctly, so counting it would promise
> a session that cannot be finished. If you see **3**, that is a bug.

---

## Part D — The study screen (the core of the phase)

Click **Start learning**.

| #   | Do this                          | Correct result                                                                                  |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| D.1 | Look at the card                 | The paragraph with input boxes where the highlights were. The removed words are **not** visible |
| D.2 | Count the blanks on the CPU card | **2**, and both are the **same width** — sized to `brain` (5), not one 3-wide and one 5-wide    |
| D.3 | Look at the progress indicator   | Shows position in the queue, e.g. **0 of 2**                                                    |
| D.4 | Look below the card              | **"Enter to check · Shift+Enter to reveal"**                                                    |
| D.5 | Click into the first blank       | Focus ring is clearly visible                                                                   |
| D.6 | Press **Tab**                    | Moves to the next blank, in reading order                                                       |

### D.7 — Zero layout shift (the check this phase exists for)

Do not eyeball this mid-sentence — the shift is one or two characters and the eye
forgives it.

1. Pick a blank with text **after it on the same line**.
2. Note exactly where the next word starts — put a fingernail or a cursor on screen there.
3. Type the correct answer and press **Enter**.

| Correct result                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The blank becomes the answer, styled as correct, and **nothing after it moves.** Not by a pixel. The line does not reflow, and no word wraps to the next line that did not before |

If the text jumps, the graded span and the input disagree about padding — see
PHASE_4.md §4.3.

### D.8 — Answering

| #     | Do this                                                    | Correct result                                                                         |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D.8.1 | Type `CPU` and `brain`, press **Enter**                    | Both marked correct. Feedback says when the card returns, in plain language            |
| D.8.2 | Type `  cpu  ` (wrong case, extra spaces) on a fresh card  | **Correct.** Case and surrounding whitespace are not the thing being tested            |
| D.8.3 | Type `CPU` correctly but `heart` for the second blank      | Card graded **hard** — partial credit is a real state, not a failure                   |
| D.8.4 | Get one wrong, read the feedback                           | Shows **what you typed** beside the right answer. Not just the right answer            |
| D.8.5 | Type a near-miss, e.g. `braim`                             | Accepted, with **"Counted as correct despite the spelling"** naming the canonical form |
| D.8.6 | Press **Enter** on the feedback panel                      | Advances. The Continue button is autofocused, so hands stay on the keyboard            |
| D.8.7 | Press **Shift+Enter** on a fresh card instead of answering | Reveals the answers                                                                    |
| D.8.8 | After revealing, check the schedule text                   | Booked **again** — revealing is not a shortcut to a good grade                         |
| D.8.9 | Type the right answer, then press **Shift+Enter**          | Still **again**. Having it typed in does not count as recall                           |

### D.9 — A failed card comes back

| #     | Do this                                           | Correct result                                                                               |
| ----- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D.9.1 | Start a session, deliberately fail the first card | Feedback says it will come back. Progress **does not advance**                               |
| D.9.2 | Read the progress after that failure              | Still **0 of 2** — the denominator did not grow either. One card seen twice is not two cards |
| D.9.3 | Keep going                                        | The failed card reappears later in the same session                                          |
| D.9.4 | Fail it a second time                             | It does **not** come back again. An unbounded retry loop is a session you cannot end         |
| D.9.5 | Finish the queue                                  | The summary appears                                                                          |

---

## Part E — The summary

| #   | Do this                              | Correct result                                                                           |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| E.1 | Finish a session                     | **"Session complete"**, with cards seen, correct, and **Accuracy** as a percentage       |
| E.2 | Check accuracy against your run      | Matches what you actually did. Count it by hand once                                     |
| E.3 | Look for the failed card             | Under **"Worth another look"**, with the note that they are already rescheduled          |
| E.4 | Click a card in that list            | Opens **that card's editor** — the cards worth another look are the ones worth rewriting |
| E.5 | Finish a session with nothing failed | **No "Worth another look" section at all.** Not an empty one                             |
| E.6 | Click **Study again**                | Starts a new session, or says nothing is due — never a blank screen                      |

---

## Part F — The four dashboard states

These are one number apart and read completely differently. Get to each one.

| #   | State                      | How to get there                                                  | Correct result                                                      |
| --- | -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| F.1 | Never scheduled anything   | Fresh account, no cards (Part B)                                  | **"What a card looks like"**, no count                              |
| F.2 | Cards built, never studied | Add cards, do not study                                           | **New cards <n>**, button **"Start learning"**. **Not** "Caught up" |
| F.3 | Caught up for today        | Study every card until the queue empties, return to the dashboard | **"Caught up for today"** and **no "0" anywhere on the page**       |
| F.4 | Reviews waiting            | See F.5 below                                                     | The count leads, with **"Study now"** → `/study`                    |

> **F.2 vs F.3 is the trap.** The endpoint returns no rows in either case, so a naive
> implementation shows the same panel for both — telling a user who has never studied
> that "every review is done". If F.2 says "Caught up", that is the bug PHASE_4.md §6.1
> describes.

### F.5 — Making reviews actually due

A card answered correctly is scheduled a day out, so you cannot see F.4 by waiting.
Move the due date back in the database instead:

```sql
-- In `pnpm db:studio`, or psql:
UPDATE card_schedules SET due_at = CURRENT_DATE - 1;
```

| #     | Do this                        | Correct result                                                        |
| ----- | ------------------------------ | --------------------------------------------------------------------- |
| F.5.1 | Run that, reload the dashboard | The due count appears and leads the page. **"Study now"**             |
| F.5.2 | Open `/sets`                   | The set carries a **Study** badge with the number waiting             |
| F.5.3 | Click that badge               | Goes to **`/study?set=<id>`** — a query parameter, not a path segment |
| F.5.4 | Study it, return               | Back to **"Caught up for today"** (F.3)                               |

---

## Part G — Archiving is observable

| #   | Do this                                      | Correct result                                                                                                                          |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| G.1 | With cards due, archive the set from `/sets` | Disappears from the active list                                                                                                         |
| G.2 | Look at the dashboard                        | The due count **drops by that set's share**. Archiving reduced the figure it was used to reduce                                         |
| G.3 | Go to `/study` (all sets)                    | The archived set's cards are **not** in the queue                                                                                       |
| G.4 | Show **Archived**, open the set, click Study | It **does** run — asking for it by id is an explicit override, and mirrors the library, where an archived set is hidden but still opens |
| G.5 | Restore it                                   | The count returns to what it was                                                                                                        |

---

## Part H — Interruption and retries

| #   | Do this                                                        | Correct result                                                                                                                         |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| H.1 | Mid-session, reload the page                                   | The same session resumes. Answered cards are **gone from the queue**, the failed one is still there                                    |
| H.2 | Check what resumed                                             | Your **typed answers are not** restored — only the position. Only the id is stored client-side                                         |
| H.3 | Mid-session, open `/study` in a second tab                     | The **same** session, not a second one                                                                                                 |
| H.4 | Finish the session, then reload `/study`                       | Does not resurrect the finished session                                                                                                |
| H.5 | Answer a card, then click Continue twice fast                  | Advances **once**                                                                                                                      |
| H.6 | Stop the backend, submit an answer, restart it, retry          | The retry succeeds and the progress count moves by **one**, not two                                                                    |
| H.7 | Answer the **last** card, then reload before clicking Continue | ⚠️ The regression check. You get "This session is finished" or "Nothing due right now" — **never a blank page or an endless skeleton** |
| H.8 | Reload `/study` again after H.7                                | Same result, every time. If the first reload recovers and the second hangs, the dead session is still winning the lookup               |

**H.7 is the one that shipped broken.** Answering the last card and reloading left
the session open with every card answered, and `POST /study/sessions` handed that
back as a 200 with an empty queue. The screen waits on "is there a card", which is
also what loading looks like, so it showed the skeleton forever — on that visit and
every later one. Both halves are fixed; this is how you confirm it stays fixed.

### H.0 — The dev-only one, and do it first

Run this in `pnpm dev`, not against a production build. It only reproduces under
`StrictMode`, which Vite's dev build has and the production build does not.

| #     | Do this                                                                 | Correct result                                                                               |
| ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| H.0.a | `localStorage.removeItem('saulado-study-session')`, then open `/study`  | ⚠️ A **card**, within a second. An endless skeleton here is the §6.6 regression              |
| H.0.b | Check the Network tab for that load                                     | Exactly **one** `POST /api/study/sessions`. Two means the mount guard is gone                |
| H.0.c | Clear the pointer again with everything already reviewed, open `/study` | "Nothing due right now" — the 400 must reach the screen, not sit invisible behind a skeleton |

Clearing the pointer is what makes this a real test: with one stored, the page
resumes through a _query_ rather than the mutation, and queries never had the bug.
The document response is a 200 or 304 either way — Vite serves the same shell for
every SPA path, so nothing in the Network tab tells you whether React rendered.
Judge it by what is on screen.

### H.9 — Idempotency, the rigorous way

1. Devtools → Network, submit an answer, find the `answers` request.
2. **Copy as fetch**, paste into the console, run it again unchanged.

| Correct result                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The second response is **identical** to the first, and `progress.answered` has **not** moved. The replay returns the original verdict rather than booking a second review |

Then change `idempotencyKey` to any new string and run it again: **that** one is
rejected or books a fresh review — which is what proves the first check meant something.

---

## Part I — 🔒 The answer key must not reach the browser

The whole reason grading is server-side. **Two of these are the highest-value checks
in this document**, because a leak looks identical to a working app.

| #   | Do this                                                       | Correct result                                                                                                           |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| I.1 | Devtools → Network → start a session → open the response JSON | It carries `segments` with `{ kind: 'blank', ordinal, answerLength }`. **No `answerText`, no `answers`, no `paragraph`** |
| I.2 | **Ctrl+F that response body for `CPU` and `brain`**           | **Zero matches.** "I cannot see it on screen" is not this test                                                           |
| I.3 | Elements panel, inspect a blank input before submitting       | No `value`, no `data-answer`, no `title` carrying the answer                                                             |
| I.4 | Check `answerLength` on the CPU card                          | Same on both blanks — it is the card's uniform width, so it does not leak the individual answer's length either          |
| I.5 | Submit a wrong answer, re-check the response                  | **Now** the canonical answer appears. Only after grading                                                                 |

### I.6 — Grading cannot be dictated by the client

1. Devtools → Network → submit a wrong answer → **Copy as fetch**.
2. Add `"grade": "easy"` to the JSON body, change `idempotencyKey`, run it.

| Correct result                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The response grade is **`again`**, not `easy`. The field is ignored. If `easy` comes back, a client could mark its whole deck easy and push it a year out — and the user would only find out when the cards stopped arriving |

### I.7 — Isolation between accounts 🔒

Sign in as user B, then use A's session id:

```bash
curl -i http://localhost:3000/api/study/sessions/<A_SESSION_ID> \
  -H "Authorization: Bearer <B_TOKEN>"
# → HTTP/1.1 404 Not Found, and no body describing the session
```

| Correct result                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- |
| **404, not 403.** A 403 confirms the id exists, which is itself the leak. Repeat for `POST …/answers` and `POST …/complete` |

| #     | Do this                                      | Correct result            |
| ----- | -------------------------------------------- | ------------------------- |
| I.7.1 | `GET /api/study/due` as B                    | Sees **none** of A's sets |
| I.7.2 | Start a session as B naming A's `studySetId` | **404**                   |
| I.7.3 | Any study endpoint with no token             | **401**                   |

---

## Part J — Keyboard, screen reader, and phone

| #   | Do this                                      | Correct result                                                                |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| J.1 | Complete a whole session **without a mouse** | Possible. Tab between blanks, Enter to check, Enter to continue               |
| J.2 | Tab through the study screen                 | Focus is visible at every stop and never lands somewhere invisible            |
| J.3 | Inspect a blank input                        | Has an `aria-label` reading **"Blank 1 of 2"** — a bare box announces nothing |
| J.4 | Inspect the progress bar                     | A native `<progress>` with a label, announced as a percentage                 |
| J.5 | Turn on a screen reader, submit an answer    | The correct/incorrect verdict is **announced**, not only coloured             |
| J.6 | Zoom to 200%                                 | The card stays readable and the blanks stay on their lines                    |

### ⚠️ J.7 — On a phone (the part a desktop cannot tell you)

```bash
# 1. Your LAN address
ipconfig | findstr IPv4
# 2. Add http://<that-ip>:5173 to CORS_ORIGIN in backend/.env (comma-separated)
# 3. Restart the backend, then:
pnpm --filter @saulado/frontend dev -- --host
```

| #     | Do this                         | Correct result                                                          |
| ----- | ------------------------------- | ----------------------------------------------------------------------- |
| J.7.1 | Tap a blank                     | Keyboard opens, and **the card is not scrolled out of view**            |
| J.7.2 | Type an answer                  | No zoom-on-focus (input font ≥ 16px)                                    |
| J.7.3 | Submit                          | Still zero layout shift (D.7) with the keyboard up                      |
| J.7.4 | Check the Continue button       | Reachable without dismissing the keyboard, and a comfortable tap target |
| J.7.5 | Rotate to landscape mid-session | Nothing is lost and the session does not restart                        |

---

## Part K — Limits and edge cases

| #   | Do this                                               | Correct result                                                            |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| K.1 | Study a set whose only card has no blanks             | **"Nothing due right now"** — not a card you cannot answer                |
| K.2 | Submit a blank left empty                             | Graded incorrect, not rejected as a validation error                      |
| K.3 | Submit with every blank empty                         | **again**, and the card re-queues once                                    |
| K.4 | Delete a card mid-session, then reach it in the queue | A clear error or a skip — never a crash                                   |
| K.5 | Paste 200 characters into one blank                   | Accepted and graded wrong. No overflow past the card                      |
| K.6 | An answer with an accent, e.g. `café`                 | Matches `café`. Decide once whether `cafe` should match, and note it      |
| K.7 | Click **End session** early                           | Summary for what was answered — not a discard of the work                 |
| K.8 | Stop the backend, then load `/study`                  | An error with **"Try again"**, not an infinite spinner                    |
| K.9 | With a session open, leave it 12+ hours, reload       | Does not silently resume a stale session (recovery has a 12-hour max age) |

---

## Part L — The scheduler, in the database

The UI cannot show you these. Open `pnpm db:studio` after a session.

| #   | Look at                                                 | Correct result                                                                            |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| L.1 | `card_schedules`                                        | One row per card you answered. `due_at` is a **date**, not a timestamp                    |
| L.2 | A card you got right, first time                        | `interval_days` **1**, `repetitions` **1**, `due_at` tomorrow                             |
| L.3 | Answer it right again the next day (F.5 to make it due) | `interval_days` **6**. That is SM-2's second step, not a bug                              |
| L.4 | A card you failed                                       | `interval_days` back to **1**, `lapses` **+1**, `ease_factor` **lower**                   |
| L.5 | `ease_factor` on any row                                | Inside **1.3 – 2.5**. Outside that range means the clamp is not applied                   |
| L.6 | `reviews`                                               | One row per graded presentation — a card you saw twice has **two** rows                   |
| L.7 | `reviews` after an idempotent replay (H.9)              | Still **one** row for that presentation                                                   |
| L.8 | `user_daily_stats`                                      | One row for today, and `reviews_done` matches the `reviews` count for today               |
| L.9 | Fail one card eight times (F.5 between each)            | At `lapses` = 8 it is a **leech** and appears in the summary rather than cycling silently |

> L.8 is worth a moment: a review writes all three tables in **one transaction**, so
> the rollup cannot disagree with the log. If those two numbers differ, something is
> writing outside the transaction.

**Intervals past the third review carry ±5% fuzz** (plan §2.6), so the fourth step may
read 15 where the textbook says 16. That is deliberate — it stops a large import from
coming back as one enormous pile on a single day. Fuzz applies only at 3 days and
above, so L.2's **1** and L.3's **6** are exact and a deviation there _is_ a bug.

---

## Part M — Score sheet

Copy this and fill it in.

```
Date:                              Browser:
Ran on phone?  iOS ☐   Android ☐   Neither ☐

Part 0  Setup .................... ☐ pass  ☐ fail: __________________
Part A  Automated gate ........... ☐ 652 tests  ☐ other: ____________
Part B  Nothing-to-study state .... ☐ pass  ☐ fail: __________________
Part C  Cards built .............. ☐ pass  ☐ fail: __________________
        C.5 count is 2, not 3 .... ☐ 2     ☐ 3 — no-blank card is in the queue
Part D  Study screen ............. ☐ pass  ☐ fail: __________________
        D.7 zero layout shift .... ☐ nothing moved  ☐ SHIFTED — report
        D.9 re-queue once ........ ☐ pass  ☐ fail: __________________
Part E  Summary .................. ☐ pass  ☐ fail: __________________
Part F  Four dashboard states ..... ☐ all four  ☐ F.2 showed "Caught up" — bug
Part G  Archiving observable ...... ☐ pass  ☐ fail: __________________
Part H  Interruption + retries .... ☐ pass  ☐ fail: __________________
        H.0 fresh /study renders .. ☐ card shown  ☐ ENDLESS SKELETON — report
        H.9 idempotent replay .... ☐ identical  ☐ DOUBLE-COUNTED — report
Part I  Answer key stays server .. ☐ no matches ☐ LEAKED — stop and report 🔒
        I.6 client grade ignored .. ☐ again  ☐ easy — SECURITY, stop 🔒
        I.7 isolation ............ ☐ 404   ☐ 403 — SECURITY, stop 🔒
Part J  Keyboard + a11y .......... ☐ pass  ☐ fail: __________________
        J.7 phone ................ ☐ pass  ☐ fail  ☐ not run (stays ⚠️)
Part K  Limits ................... ☐ pass  ☐ fail: __________________
Part L  Scheduler in the DB ....... ☐ pass  ☐ fail: __________________
```

### If only four checks fit in your day

1. **I.2** — search the session response for your answer text. A leak is invisible in
   the UI, so this is the only place it shows up.
2. **I.6** — a client-supplied `grade` must be ignored. Otherwise any client can push
   its whole deck a year out.
3. **D.7** — zero layout shift on reveal. The criterion this phase was shaped around.
4. **F.2** — a user who has built cards but never studied must not be told the day is
   done. It is the one state that lies rather than merely looking wrong.

### Known-not-implemented — not bugs

Do not file these; they are recorded as deferred:

- **No undo on a submitted answer.** A mistyped answer books a real review. The
  re-queue softens it; there is no undo.
- **Blank width mode is not exposed.** `settings.ts` supports `exact`, but only
  `fixed` is reachable from the UI.
- **Leeches are surfaced, not acted on.** Nothing suspends or reschedules a leech
  beyond normal grading.
- **`totalDue` is uncapped while a session is capped**, so a large backlog shows a
  bigger number than the session will serve. Deliberate — the badge answers "how much
  is waiting".
- **No per-set study statistics or streak display.** The data is being written
  (`user_daily_stats`), nothing reads it yet.
- **No review history view.** `reviews` is append-only and unread by the UI.

# Phase 1 — Cloze Engine Implementation Guide

> Everything built to complete Phase 1, why each decision went the way it did, and how to verify it.
>
> **Completed:** 2026-08-06 · **Commits:** `4b2e381` → `52d8d66` · [Plan §Phase 1](../IMPLEMENTATION_PLAN.md)

---

## Table of contents

1. [What Phase 1 is](#1-what-phase-1-is)
2. [The five sub-phases](#2-the-five-sub-phases)
3. [Architecture — the offset model](#3-architecture--the-offset-model)
4. [The files, and what each is for](#4-the-files-and-what-each-is-for)
5. [The four invariants](#5-the-four-invariants)
6. [Design decisions worth knowing](#6-design-decisions-worth-knowing)
7. [The editor spike and ADR 0001](#7-the-editor-spike-and-adr-0001)
8. [Testing strategy](#8-testing-strategy)
9. [Problems hit and how they were fixed](#9-problems-hit-and-how-they-were-fixed)
10. [Verifying Phase 1](#10-verifying-phase-1)
11. [Using the engine](#11-using-the-engine)
12. [What's next](#12-whats-next)

---

## 1. What Phase 1 is

Phase 1 builds the **cloze engine** — the thing that turns a highlighted paragraph
into independently gradeable fill-in-the-blank questions. It is the entire product
differentiator; everything else in Saulado is a CRUD app with auth.

It is built as a **pure library** in `shared/src/`. No React, no Express, no
database, no DOM, no clock. Just functions.

**Why pure, and why first.** The plan calls this "the phase to be slow and
thorough in," and the reasoning is specific: a bug here does not crash. It
silently writes wrong offsets into the database, and the user discovers it six
weeks and two hundred cards later, when there is no clean migration back. A
paragraph with an emoji in it produces a blank one character to the left of where
it should be — plausible enough that nobody notices immediately, permanent once
it's stored.

Pure functions are the answer to that risk because they can be exhaustively
tested without a browser, a server, or a database standing up first. The test
suite runs in **1.15 seconds**.

**The bar (plan §Phase 1 Done-when), verbatim:**

> `npm test` is green, coverage on `shared/src/cloze/` is >95%, and you can paste
> the CPU/RAM example into a Node REPL and get two independently gradeable blanks.

All three are met. §10 shows how to verify each yourself.

---

## 2. The five sub-phases

Phase 1 was built in five slices rather than one pass, each ending in something
testable.

| #   | Sub-phase    | Est.     | What landed                                                                       | Commit               |
| --- | ------------ | -------- | --------------------------------------------------------------------------------- | -------------------- |
| 1.1 | Core         | 2 days   | Offset primitives, `createAnswer`, `validateAnswers`, `renderCloze`, re-anchoring | `4b2e381`            |
| 1.2 | Validation   | 1.5 days | `normalize`, bounded `levenshtein`, `checkAnswer`, `gradeCard`                    | `baff679`            |
| 1.3 | Scheduler    | 0.5 day  | SM-2 with fuzz, cap, and lapse counter                                            | `baff679`            |
| 1.4 | Editor spike | 0.5 day  | Throwaway prototype on a real phone → ADR 0001                                    | `3d0e729`, `52d8d66` |
| 1.5 | Test suite   | 0.5 day  | The ten non-negotiable cases, then the coverage gate                              | `ca197f5`            |

### Why this order

**1.1 before everything.** `createAnswer` and `validateAnswers` define the data
shape the rest of the phase operates on. Building validation (1.2) first would
have meant validating a shape that didn't exist yet.

**1.4 in Phase 1, not Phase 3.** This is the plan's most deliberate sequencing
choice. The highlight editor ships in Phase 3, ten days of work away — but the
question "does browser text selection work acceptably on a phone?" could
invalidate the entire approach. The risk register rates it **High** severity.
Discovering it in Phase 3 means throwing away days of editor work; discovering it
in Phase 1 costs half a day of throwaway prototype.

**1.5 last, and it found a real gap.** The coverage number had never actually
been measured — it was assumed. When measured, it was **90.64%** against a >95%
requirement. See §9.

---

## 3. Architecture — the offset model

Plan §2.1 calls this "the most important decision in the project." Everything in
Phase 1 follows from it.

> **Store the paragraph as immutable plain text. Store answers as character
> ranges into it. Never store the rendered blanked text.**

```
Persisted                          Derived at render time
─────────────────────────          ──────────────────────────────
paragraph: "The CPU is the         renderCloze(paragraph, answers)
            brain of the             ↓
            computer."             [ {text: "The "},
                                     {blank, ordinal: 0},
answers: [                           {text: " is the brain..."} ]
  { startOffset: 4,                  ↓
    endOffset: 7,                  "The _____ is the brain of the computer."
    answerText: "CPU" }
]
```

### Why not store the blanked text

Storing `"The _____ is the brain of the computer."` seems simpler, and it is —
right up until the user wants to edit a highlight. Then:

- The original paragraph is **unrecoverable**. You cannot get "CPU" back out of `_____`.
- Removing a highlight is destructive rather than reversible.
- The blank width is baked in, so you can't change the rendering later.
- Reading the card back for search or export gives you underscores.

The derived-at-display-time model costs one function call per render and keeps
the source text intact forever.

### The three-part contract

| Piece                       | Role                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `paragraph`                 | Immutable source of truth. NFC-normalized, LF line endings, no trailing space.             |
| `startOffset` / `endOffset` | **Code point** indices. Start inclusive, end exclusive.                                    |
| `answerText`                | Denormalized copy of the slice. Both the validation payload and a **corruption tripwire**. |

`answerText` is deliberate redundancy. It should always equal
`[...paragraph].slice(start, end).join('')` — so if it ever doesn't, you know the
paragraph was edited without reconciling its answers, and you can say so loudly
instead of rendering a blank in the wrong place.

---

## 4. The files, and what each is for

All under `shared/src/`. **2,669 lines**, roughly 45% implementation and 55% tests.

### `cloze/codepoints.ts` — 97 lines

**The single most load-bearing file in the phase**, and the smallest.

JavaScript strings are UTF-16. `String.length` counts _code units_, not
characters. Anything outside the Basic Multilingual Plane — emoji, rarer CJK,
mathematical symbols — takes two code units as a surrogate pair:

```ts
"🧠 brain".length        // 8  — the emoji counts twice
[..."🧠 brain"].length   // 7  — what a human would count
"🧠 brain".slice(0, 1)   // "\uD83E" — half an emoji, not a character
```

Every offset in Saulado is a **code point** index, and this module is the only
place the conversion happens.

| Function                         | Purpose                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `toCodePoints(s)`                | `Array.from(s)` — code-point-aware, unlike `s.split('')`                     |
| `codePointLength(s)`             | The denominator for every offset in the engine                               |
| `sliceCodePoints(s, start, end)` | Slice by code point. Clamps out-of-range, like `String.slice`                |
| `codeUnitToCodePoint(s, i)`      | **The Selection API boundary.** DOM reports code units; we store code points |
| `codePointToCodeUnit(s, i)`      | The inverse, for handing offsets back to the DOM                             |

`codeUnitToCodePoint` is where a bug would be invisible and permanent. The spike
(§7) tested exactly this: naive UTF-16 slicing at the same index yields the
**wrong** text, which is what proves the conversion isn't ceremonial.

> **Scope note:** code points are still not _grapheme clusters_. `👨‍👩‍👧` is one
> visual glyph but five code points. Grapheme segmentation needs `Intl.Segmenter`
> and is deliberately out of scope — the browser's selection API won't hand us a
> selection that splits a grapheme.

`sliceCodePoints` does **not** support negative indices, on purpose. Offsets here
are always absolute, and silently reinterpreting `-1` as "from the end" would
turn an arithmetic bug into wrong-but-plausible data.

### `cloze/types.ts` — 137 lines

The vocabulary. Notable choices:

**`AnswerRange` vs `CardAnswer`.** `AnswerRange` deliberately excludes `id` and
`ordinal` — those are assigned at persistence, and the engine must work on
unsaved drafts coming out of the editor. Every function is generic over
`AnswerRange`, so it accepts both a draft and a fully persisted answer.

**`Segment` is a union, not a string.** `renderCloze` returns a flat list so the
UI can attach input elements, focus handlers, and per-blank state to each blank.
A string with underscores in it would have to be re-parsed to do any of that —
which is exactly how offset bugs get reintroduced at the view layer.

**Six issue codes**, each mapping to a specific failure the UI needs to phrase
differently: `OUT_OF_BOUNDS`, `EMPTY_RANGE`, `WHITESPACE_ONLY`, `OVERLAP`,
`TEXT_MISMATCH`, `ORDINAL_MISMATCH`.

**`ClozeIssue[]` returned, not thrown.** A card with three problems reports three
problems, so the UI shows them all at once instead of one per save attempt. The
single-range helpers (`createAnswer`) _do_ throw, because a failure there is
programmer error rather than user error.

### `cloze/answers.ts` — 295 lines

The construction and validation layer.

| Function                                                          | Purpose                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `normalizeParagraph(s)`                                           | NFC, CRLF→LF, strip trailing whitespace. Run once, before storage. |
| `createAnswer(p, s, e)`                                           | Validates a range and returns an answer. **Throws** on bad input.  |
| `validateAnswers(p, as)`                                          | Enforces all four invariants. **Returns** a list of issues.        |
| `assignOrdinals(as)`                                              | Sorts by position, renumbers from 0                                |
| `snapToWordBoundaries`                                            | Expands a mid-word selection to the whole word                     |
| `refreshAnswerText`                                               | Re-derives `answerText` when the denormalized copy drifted         |
| `rangesOverlap`, `answerAtOffset`, `answerLength`, `isCardAnswer` | Small helpers                                                      |

`normalizeParagraph` preserves **leading** whitespace (indentation is meaningful)
but strips trailing. It runs before storage so every offset in the database
indexes into the same canonical form — normalizing at read time instead would
mean offsets that only work sometimes.

### `cloze/render.ts` — 108 lines

Derives the display form. Three functions:

- **`renderCloze(paragraph, answers)`** → `Segment[]` for the interactive view
- **`reconstructParagraph(segments, answers)`** → proves the round-trip property, and powers "reveal all"
- **`renderClozeText(paragraph, answers, opts)`** → plain string with underscores, for previews and screen-reader summaries

**Blanks are a fixed 5 underscores by default**, regardless of answer length
(plan §2.7). `_____` versus `______________` is a free hint that measurably
degrades recall. `answerLength` is still exposed on the segment so the UI can
_reserve_ the width the revealed answer will occupy — otherwise the paragraph
reflows on reveal and the reader loses their place. Reserving space and sizing
the blank to the answer are different things.

`renderCloze` sorts defensively even though callers should pass validated input.
Rendering is on the hot path for every card view; a render that scrambles text
because of upstream disorder is a far worse failure than a redundant sort.

### `cloze/reanchor.ts` — 145 lines

**The nastiest edge case in the app.** Offsets are indices into an exact string.
The moment the user inserts a word at the top of the paragraph, every offset
below it is wrong.

Strategy: search for each answer's `answerText` in the new paragraph, **nearest to
its old position first**. Insertions and deletions elsewhere shift text without
changing it, so the old offset is a strong hint about where the answer moved to.

```
old: "The CPU is fast."           answer at [4,7) = "CPU"
new: "Note: The CPU is fast."     → found at [10,13), offsets rewritten
```

`findNearestOccurrence` expands _outward_ from the preferred position rather than
scanning left to right, so an answer near the end of a long paragraph isn't
re-anchored to an unrelated identical word near the beginning. Ties break toward
the earlier position.

Two rules that matter:

**Unmatched answers are `orphaned`, never dropped.** The user is shown "this
highlight no longer matches — re-highlight or delete." Silently discarding a
highlight loses work the user did deliberately, and they'd have no way to know.

**Deliberately not a diff algorithm.** A proper Myers diff would handle answers
whose own text was edited — but that case is genuinely ambiguous. Was
"mitochondria" → "mitochondrion" an edit to the answer, or a different word that
happens to be similar? Guessing wrong writes bad data. Exact-match relocation is
predictable, and everything else escalates to the user.

`needsReanchoring` is a cheap pre-check that lets the editor skip the whole
process for the common case of appending to the end of a paragraph.

### `cloze/levenshtein.ts` — 62 lines

Edit distance for typo tolerance, but **bounded**.

The textbook implementation builds a full `(m+1) × (n+1)` matrix — O(m·n) in both
time and memory. Answer checking runs on every interaction in a study session,
and the only question ever asked is _"is the distance at most k?"_ So this
variant:

- keeps **two rows** instead of a matrix
- bails out the moment the whole row exceeds the threshold
- short-circuits on a length gap alone (`|len(a) − len(b)| > k` → done)
- compares **code points**, so an emoji is one edit, not two

Returns the true distance when it's ≤ `maxDistance`, and `maxDistance + 1`
otherwise. Callers must compare with `<=` and never treat the return as an exact
distance without checking the bound.

### `cloze/validate.ts` — 142 lines

The answer-checking ladder (plan §2.5). Order is load-bearing:

```
1. exact        → normalized input === normalized answer
2. alternative  → matches an entry in altAnswers
3. typo         → within edit distance, if tolerance is on
4. wrong        → none of the above
```

An input that exactly matches an alternative must report as `alternative`, not as
a `typo` against the primary answer — otherwise the UI "corrects" the user's
perfectly valid spelling.

**`normalize`** is applied to _both_ sides, always: NFC → trim → lowercase →
smart quotes to straight → collapse whitespace. Comparing a normalized input
against a raw stored answer is a bug that only appears for users whose keyboards
produce different bytes than the author's did. Unlike `normalizeParagraph`, this
is lossy and never persisted — it exists only to decide equality.

**`typoThreshold(len)` = `min(2, floor(len / 6))`.** The scaling matters more than
the cap. With a flat threshold of 2, "CPU" would accept "cat" and "RAM" would
accept "run" — the answer becomes unlearnable. Short answers get **zero**
tolerance and must be typed exactly. This is why "GPU" grades as wrong against
"CPU", which is correct behaviour, not a bug.

**`gradeCard`**: all correct → `good`, some → `hard`, none → `again`. `easy` is
deliberately not derivable from correctness — it means "I knew this instantly,"
which only the user can report. It stays in the `Grade` union for a self-rating
control and is never inferred.

A card with **no blanks** grades `again`, not `good`. An empty card is broken
data; rewarding it would push it out to a long interval where the user would
never see the problem.

### `scheduler/sm2.ts` — 191 lines

SM-2 as specified in `CLAUDE.md`, plus the three production additions from §2.6.

| Addition          | Why                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **±5% fuzz**      | Without it, a 200-card import reviewed on one day comes back as a 200-card day _forever_. Fuzz breaks the batch apart within a few reviews. |
| **365-day cap**   | Beyond a year, SM-2's confidence isn't earned                                                                                               |
| **Lapse counter** | 8 failures flags a **leech** — almost always a badly written card, not a hard fact                                                          |

Ease clamps to **[1.3, 2.5]**. Interval ladder: 1 day → 6 days → `ease × interval`.
`hard` uses a fixed 1.2 multiplier so a partially-correct card moves forward but
far more slowly; `easy` adds a 1.3 bonus.

Fuzz is skipped below 3 days — rounding makes it a no-op there anyway, and
shifting a 1-day interval is user-visible for no benefit. A lapse also skips
fuzz: "tomorrow" should mean tomorrow.

**`now` and `random` are injectable.** A scheduler that reads the clock and the
RNG directly is not testable, and an untestable scheduler is one whose off-by-one
you discover from a user's review queue six weeks later.

**`addDays` uses `setDate`, not millisecond arithmetic.** `setDate` is
calendar-aware: adding 1 day across a DST boundary yields the same wall-clock
time the next day. Adding `n * 86400000` ms drifts by an hour twice a year, which
over a 365-day interval quietly shifts a card's due date to the previous day.

---

## 5. The four invariants

`validateAnswers` enforces these. They're the contract every other function
assumes.

| #   | Invariant                         | Issue code                      | Why                                              |
| --- | --------------------------------- | ------------------------------- | ------------------------------------------------ |
| 1   | `0 ≤ start < end ≤ length`        | `OUT_OF_BOUNDS` / `EMPTY_RANGE` | A range outside the paragraph slices to garbage  |
| 2   | No two answers overlap            | `OVERLAP`                       | Overlapping blanks can't be graded independently |
| 3   | Stored order matches offset order | `ORDINAL_MISMATCH`              | Otherwise blank 1 renders before blank 0         |
| 4   | Not pure whitespace               | `WHITESPACE_ONLY`               | A blank you fill with a space is not a question  |

Plus the tripwire: `answerText` must equal the slice it points at, or
`TEXT_MISMATCH`.

Two details worth knowing:

**Adjacent ranges are legal.** The overlap check uses strict `>`, so
`prev.end === cur.start` passes. Two consecutive words highlighted separately is
a real use case.

**Overlap is checked on a sorted copy**, so the result is independent of the
caller's ordering. An unsorted input gets reported as an _ordering_ issue, not
misdiagnosed as an overlap.

> These same rules will be enforced by DB check constraints in Phase 3. This is
> the fast, user-facing half of a two-layer guard — not the only one. The server
> also recomputes `answerText` from offsets rather than trusting the client.

---

## 6. Design decisions worth knowing

### Why the engine lives in `shared/`, not `backend/`

The same validation must run in three places: the editor (immediate feedback),
the API (never trust the client), and the study renderer. One implementation in
`shared/` means those three can't drift. A type changed here breaks both sides at
compile time — that's the whole argument for the monorepo, cashed in.

### Why `createAnswer` throws but `validateAnswers` returns

Different callers, different failure meanings.

`createAnswer` is called by the editor with a range the user just selected. A bad
range there is a programmer error — the editor shouldn't have produced it — so
throwing surfaces it loudly in development.

`validateAnswers` is called on a whole card, often loaded from the database. Bad
data there is expected: a stale row, a hand-edited import, an older client. The
UI needs to render every problem at once, so it gets a list.

### Why offsets and not a document tree

This is ADR 0001's core argument (§7). Saulado does not edit rich text — it edits
_plain text plus a set of ranges_. A document model indexes positions by node, so
every save would need to flatten tree positions back to flat code-point offsets
and every load would need the inverse. That's a **second offset system** living
beside the one already tested, which is precisely the risk the plan rates
highest.

### Why `answerText` is denormalized

It's redundant by definition — you can always recompute it from the offsets. It's
stored anyway because that redundancy _is_ the corruption detector. If the two
ever disagree, something went wrong, and you find out at validation time rather
than when a user sees a blank in the middle of a word.

---

## 7. The editor spike and ADR 0001

### What was being decided

Three options for the highlight input surface:

| Option | Approach                            | Bundle  | Model fit                                |
| ------ | ----------------------------------- | ------- | ---------------------------------------- |
| **A**  | `<textarea>` + native Selection API | 0 KB    | Exact — the API already speaks offsets   |
| **B**  | ProseMirror / Slate                 | ~100 KB | Poor — introduces a second offset system |
| **C**  | Tap-to-select whole words           | 0 KB    | Exact, and stricter                      |

**Option B was rejected without needing the test.** It costs over half the 180 KB
JS budget for one input, and its document tree means maintaining two position
systems for a feature whose entire value is having exactly one. Inline
highlighting is worth real money — but not that much money, and not that risk.

**A vs C was a touch-ergonomics question** that reasoning couldn't settle. It
needed a thumb on a real phone.

### How the spike was run

A throwaway prototype at `frontend/src/spike/TextHighlighter.tsx`, reachable at
`/#spike`. It deliberately imported the **real `@saulado/shared` engine** rather
than reimplementing offsets, so the spike tested the actual integration boundary
rather than a mock of it.

Mechanically verified first, in Node:

| Check                                                        | Result   |
| ------------------------------------------------------------ | -------- |
| Emoji selection (2 code units) maps to 1 code point          | pass     |
| CJK selection after a surrogate pair resolves correctly      | pass     |
| Naive UTF-16 slicing at the same index yields the wrong text | **pass** |
| Two blanks render as equal-width `_____`                     | pass     |
| Editing before a blank carries the blank along               | pass     |
| Deleting a blanked word orphans it rather than dropping it   | pass     |

The third row is the load-bearing one — it's what proves `codeUnitToCodePoint`
does real work at this boundary.

Then on a real phone, over the LAN:

```bash
pnpm --filter @saulado/frontend dev:lan
# → http://192.168.x.x:5173/#spike
```

> `pnpm dev` binds to localhost and is **unreachable from a phone**. The `dev:lan`
> script exists for exactly this.

All 8 on-device checks passed on Android. **Test 3 — dragging selection handles to
adjust a selection — was the actual decision gate**: the risk register flagged it
as the interaction most likely to fail on touch, and it was the sole reason
Option C was held in reserve. It worked.

### Outcome

ADR 0001 is **Accepted**: Option A, native Selection API, no editor dependency.
The spike was deleted (recoverable from `3d0e729`), and the bundle dropped from
58.26 KB to **54.65 KB** gzip.

The ADR also caught a stale instruction: `CLAUDE.md` still listed
"Slate.js or ProseMirror" as the editor — the exact option being rejected. Left
alone, Phase 3 would have been built against it.

**Carried forward:** the test was single-device. An iOS Safari pass before Phase 3
ships is cheap insurance, since WebKit's selection handles behave differently from
Blink's. Recorded in the ADR §5 Follow-up. Not a Phase 1 blocker.

---

## 8. Testing strategy

**172 tests in `shared/`**, 1.15 s.

| File                  | Tests | Covers                                        |
| --------------------- | ----- | --------------------------------------------- |
| `answers.test.ts`     | 45    | Construction, the four invariants, edge cases |
| `sm2.test.ts`         | 33    | Ladder, ease clamping, fuzz, cap, leech       |
| `validate.test.ts`    | 25    | The matching ladder, normalization, grading   |
| `render.test.ts`      | 20    | Segments, round-trip, blank width             |
| `reanchor.test.ts`    | 17    | Relocation, orphaning, claim conflicts        |
| `done-when.test.ts`   | 11    | The plan's acceptance criterion, end to end   |
| `codepoints.test.ts`  | 10    | Surrogate pairs, conversion both directions   |
| `levenshtein.test.ts` | 9     | Distance, early exit, bound semantics         |
| `health.test.ts`      | 2     | Phase 0 carry-over                            |

### The ten non-negotiable cases

The plan named these explicitly. All are covered:

- Answer at index 0; answer at the very end of the paragraph
- Two adjacent answers with no gap between them
- Multi-word answer spanning punctuation (`"HyperText Markup Language"`)
- Accented characters, emoji, CJK — offsets code-point correct
- Empty / whitespace-only selection → rejected
- Overlapping ranges → rejected
- Answer text containing the blank placeholder characters themselves
- Windows `\r\n` line endings in pasted content
- `renderCloze` round-trip: render then reconstruct yields the original
- Every worked example from the objectives doc, verbatim

### `done-when.test.ts` — the acceptance criterion as code

The plan's third criterion was _"paste the CPU/RAM example into a Node REPL and
get two independently gradeable blanks."_ That's a manual check, and a criterion
verified by hand once is a criterion nobody re-runs.

It's now a test file. It's the only one that reaches across modules on purpose,
taking the CPU/RAM paragraph through the full path:

```
normalizeParagraph → createAnswer → assignOrdinals → validateAnswers
  → renderCloze → checkAnswers → gradeCard → calculateNextReview
```

and asserting independent grading in all four combinations:

| Input            | Grade   | Meaning              |
| ---------------- | ------- | -------------------- |
| `['CPU', 'RAM']` | `good`  | Both blanks correct  |
| `['CPU', 'ROM']` | `hard`  | One right, one wrong |
| `['GPU', 'RAM']` | `hard`  | The other one right  |
| `['GPU', 'ROM']` | `again` | Both wrong           |

That `['CPU', 'ROM']` and `['GPU', 'RAM']` grade differently from each other's
inputs but identically in outcome is the proof that the blanks grade
**independently** — which is the whole point of the criterion.

### The coverage gate

```ts
// shared/vitest.config.ts
coverage: {
  provider: 'v8',
  include: ['src/cloze/**/*.ts', 'src/scheduler/**/*.ts'],
  exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
  thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
}
```

**Enforced, not eyeballed.** A future change that adds an untested branch fails
the build instead of quietly drifting. Current state:

```
File             | % Stmts | % Branch | % Funcs | % Lines
-----------------|---------|----------|---------|--------
All files        |     100 |    98.22 |     100 |     100
 cloze           |     100 |    97.95 |     100 |     100
  answers.ts     |     100 |    96.42 |     100 |     100
  codepoints.ts  |     100 |      100 |     100 |     100
  levenshtein.ts |     100 |      100 |     100 |     100
  reanchor.ts    |     100 |    94.44 |     100 |     100
  render.ts      |     100 |      100 |     100 |     100
  validate.ts    |     100 |      100 |     100 |     100
 scheduler       |     100 |      100 |     100 |     100
```

The four uncovered branches (`answers.ts:170,187`, `reanchor.ts:98,101`) are all
the same shape:

```ts
const previous = sorted[i - 1]
const current = sorted[i]
if (!previous || !current) continue // ← unreachable at runtime
```

They exist only to satisfy `noUncheckedIndexedAccess`, which types `arr[0]` as
`T | undefined`. Inside a `for (let i = 1; i < arr.length; i++)` loop both are
guaranteed present. Documented rather than chased — writing a test for an
unreachable branch would mean faking the array's own length.

---

## 9. Problems hit and how they were fixed

### 1. Coverage was assumed, not measured — and it was short

Phase 1.5 was marked complete and reported as done based on tests passing.
Coverage had never actually been run. When it was, `shared/src/cloze/` came in at
**90.64%** against the plan's >95% requirement.

The gap was in paths the editor can't produce but bad data can:

- Malformed offsets from a stale DB row or hand-edited import (non-integer, NaN, negative, past the end)
- An answer whose `answerText` was emptied — an empty needle would otherwise trivially "match" at offset 0
- An overlapping answer that would rewind the render cursor
- The second-repetition interval ladder by grade (`sm2.ts:139`)

Fixed by adding tests for each, then **enforcing the threshold in config** so it
can't silently drift again.

### 2. `isCardCorrect([])` returned `true`

```ts
// before
return results.every((r) => r.correct) // vacuously true on []
```

`Array.every` on an empty array is `true` by definition. A card with zero blanks —
broken data — would have reported a clean pass, and the scheduler would have
pushed it out to a longer interval where the user would never see the problem.

```ts
// after
return results.length > 0 && results.every((r) => r.correct)
```

`gradeCard` had already handled this correctly (empty → `again`); `isCardCorrect`
hadn't. Found by writing the test that asserts the empty case.

### 3. `TS2353` on an object literal passed to a type guard

```
Object literal may only specify known properties,
and 'id' does not exist in type 'AnswerRange'
```

TypeScript applies excess-property checking to object literals passed directly to
a parameter. `isCardAnswer(answer: AnswerRange)` accepts the wider type at
runtime, but the literal was rejected at compile time. Fixed by binding to a
typed const for the valid case and casting for the deliberately-partial ones:

```ts
const persisted: CardAnswer = { ...draft, id: 'a1', ordinal: 0 }
expect(isCardAnswer(persisted)).toBe(true)
expect(isCardAnswer({ ...draft, id: 'a1' } as AnswerRange)).toBe(false)
```

### 4. The ADR pointed at a command that can't work from a phone

The mobile-testing instructions said `pnpm dev`, which binds to localhost and is
unreachable from another device on the network. Corrected to
`pnpm --filter @saulado/frontend dev:lan` before the walkthrough was handed over.
Small, but it was the difference between the spike being testable and not.

### 5. PowerShell here-string terminator

```powershell
git commit -m @'
...
'@ 2>&1 | Select-Object -Last 12    # ← parse error
```

The closing `'@` must be at column 0 **on its own line** with nothing after it.
Git then read the message fragments as pathspecs:
`error: pathspec 'or' did not match any file(s) known to git`.

Fixed by writing the message to a file and using `git commit -F <file>` — which
is the more robust pattern for multi-line messages on Windows regardless.

---

## 10. Verifying Phase 1

Three criteria, three commands.

### 1. Tests green

```bash
pnpm -w run verify
```

Expect **179 tests** — 172 shared, 3 frontend, 4 backend.

> Backend tests log `Can't reach database server at localhost:5432`. That's
> expected, not a failure: those tests assert the health contract holds _without_
> a local database. Look at the pass count, not the log noise.

### 2. Coverage above 95%

```bash
pnpm --filter @saulado/shared test:coverage
```

The threshold is enforced in config, so a passing exit code _is_ the proof. An
HTML report lands in `shared/coverage/index.html` if you want to see which
branches are uncovered.

### 3. CPU/RAM → two independently gradeable blanks

```bash
pnpm --filter @saulado/shared test done-when
```

Or check it by hand:

```bash
pnpm --filter @saulado/shared build
node
```

```js
const {
  normalizeParagraph,
  createAnswer,
  assignOrdinals,
  renderClozeText,
  checkAnswers,
  gradeCard,
} = await import('./shared/dist/index.js')

const p = normalizeParagraph(
  'The CPU is the brain of the computer, and RAM provides temporary storage.',
)
const answers = assignOrdinals([createAnswer(p, 4, 7), createAnswer(p, 42, 45)])

renderClozeText(p, answers)
// 'The _____ is the brain of the computer, and _____ provides temporary storage.'

gradeCard(checkAnswers(['CPU', 'RAM'], answers)) // 'good'
gradeCard(checkAnswers(['CPU', 'ROM'], answers)) // 'hard'  ← independent
gradeCard(checkAnswers(['GPU', 'ROM'], answers)) // 'again'
```

---

## 11. Using the engine

Everything is exported from `@saulado/shared`. The typical create-then-study
round trip:

```ts
import {
  normalizeParagraph,
  createAnswer,
  assignOrdinals,
  validateAnswers,
  renderCloze,
  checkAnswers,
  gradeCard,
  calculateNextReview,
} from '@saulado/shared'

// ── Creating a card ────────────────────────────────────────────
const paragraph = normalizeParagraph(userInput) // once, before storage

// From a <textarea> selection — note the code-unit → code-point conversion
const start = codeUnitToCodePoint(paragraph, textarea.selectionStart)
const end = codeUnitToCodePoint(paragraph, textarea.selectionEnd)

const answers = assignOrdinals([createAnswer(paragraph, start, end)])

const issues = validateAnswers(paragraph, answers)
if (issues.length > 0) return showErrors(issues) // never persist with issues

// ── Studying ───────────────────────────────────────────────────
const segments = renderCloze(paragraph, answers) // → UI
const results = checkAnswers(userInputs, answers)
const grade = gradeCard(results)
const next = calculateNextReview(grade, cardState)
// → next.dueDate, next.interval, next.easeFactor, next.isLeech

// ── After a paragraph edit ─────────────────────────────────────
if (needsReanchoring(oldParagraph, newParagraph, answers)) {
  const { matched, orphaned } = reanchorAnswers(oldParagraph, newParagraph, answers)
  if (orphaned.length > 0) askUserToReHighlight(orphaned) // never drop silently
}
```

Three rules for callers:

1. **`normalizeParagraph` once, before storage.** Never at read time — offsets index into the normalized form.
2. **Convert at the DOM boundary.** The Selection API reports code units; everything below stores code points.
3. **Never persist with issues.** `validateAnswers` returning non-empty means the card is corrupt.

---

## 12. What's next

**Phase 2 — Auth & App Shell.** Six days, split evenly between backend and
frontend. The real database schema arrives (`users`, `user_settings`,
`refresh_tokens`, `password_resets`), along with register/login/refresh/logout,
rate limiting, and then the frontend shell: React Router with a `<ProtectedRoute>`,
a Zustand auth store, TanStack Query with a 401 → silent-refresh interceptor, and
the auth pages.

**Done when:** you can register, close the tab, reopen it, and still be logged in
— and a wrong password is rate-limited.

Two things Phase 2 will need decided early:

- **The refresh cookie across two origins.** `SameSite=Strict` works locally
  (`localhost:5173` → `localhost:3000` is same-site) but silently fails on
  staging, because `*.vercel.app` and `*.onrender.com` are different sites. Proxy,
  custom domain, or `SameSite=None` + CSRF token.
- **Whether forgot-password sends real email in Phase 2**, or ships against a
  logging adapter with delivery wired later.

Phase 2 is also the first phase whose integration tests need a **real Postgres** —
CI currently runs without a database, so a service container gets added.

The cloze engine itself is untouched from here until Phase 3 builds the highlight
editor against it. That's the payoff for building it standalone: `createAnswer`,
`validateAnswers`, and `renderCloze` don't change when the UI arrives.

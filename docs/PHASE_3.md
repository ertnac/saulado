# Phase 3 — Sets, Cards & the Highlight Editor

> What was built, why it is shaped this way, and how to prove it works.
>
> **Plan:** [§Phase 3](../IMPLEMENTATION_PLAN.md) · **Depends on:** ADR 0001 (editor),
> Phase 1's cloze engine, Phase 2's auth

---

## Table of contents

1. [What Phase 3 is](#1-what-phase-3-is)
2. [The nine sub-phases](#2-the-nine-sub-phases)
3. [The offset model](#3-the-offset-model)
4. [The decisions worth knowing](#4-the-decisions-worth-knowing)
5. [Verifying it yourself](#5-verifying-it-yourself)
6. [Problems hit and how they were fixed](#6-problems-hit-and-how-they-were-fixed)
7. [Before starting Phase 4](#7-before-starting-phase-4)

---

## 1. What Phase 3 is

Phase 1 built the cloze engine as pure functions. Phase 2 added identity. Phase 3 is
where they meet a user: **write a paragraph, highlight words, get a card.**

**The bar:** _paste "The CPU is the brain of the computer and RAM stores temporary
data", highlight both terms, save, and see the card render with two blanks — on your
phone._

The hard part is not the CRUD. It is that a cloze card is a paragraph plus a set of
**offsets into that paragraph**, and offsets are fragile in a way that fails silently.
A blank that drifts by one character still renders, still saves, and still looks
right in a list. You find out weeks later, mid-review, when the answer is `rain`
instead of `brain`.

Most of what follows is defence against that.

---

## 2. The nine sub-phases

| #    | Sub-phase                  | Where it lives                                                                |
| ---- | -------------------------- | ----------------------------------------------------------------------------- |
| 3.0a | Shared contracts           | `shared/src/cards/`, `shared/src/cloze/answers.ts`                            |
| 3.0b | Schema + migration         | `backend/prisma/schema.prisma`, `migrations/…_sets_cards_answers/`            |
| 3.0c | Sets & cards API           | `backend/src/routes/sets.ts`, `cards.ts`, `cards.shared.ts`                   |
| 3.0d | Backend integration tests  | `backend/src/routes/sets.test.ts`, `cards.test.ts`                            |
| 3.1a | Selection → offset mapping | `frontend/src/lib/selection.ts`                                               |
| 3.1b | Highlight editor           | `frontend/src/features/cards/HighlightEditor.tsx` + surface, popover, preview |
| 3.1c | Services + query hooks     | `frontend/src/services/cards.ts`, `features/cards/queries.ts`                 |
| 3.1d | Sets & cards UI            | `SetsPage.tsx`, `SetDetailPage.tsx`, `CardEditorPage.tsx`                     |
| 3.1e | Verify + document          | this file, plan status block                                                  |

Shared came first on purpose. Both sides validate answer ranges, and the point of
`shared/` is that they cannot disagree about what "valid" means.

---

## 3. The offset model

One rule, stated once:

> **The client sends offsets. The server derives the text.**

A `POST /api/sets/:id/cards` body carries `answers: [{ startOffset, endOffset }]` and
no `answerText`. The server slices it out of the paragraph itself. `cards.test.ts`
asserts that a client-supplied `answerText` is _ignored_, not rejected — rejecting it
would make the field look supported.

This is what makes `answerText` usable as a **corruption tripwire**. Because nothing
ever types that string, a stored `answerText` that does not match the slice its
offsets point at is proof the offsets are wrong. If the client sent the text, the two
could disagree forever and nobody would know which was right.

**Offsets are code points, not UTF-16 units.** `'A 🧠 thinks'` is 11 UTF-16 units and
10 code points; indexing by the former slices the emoji in half. `codePointLength`
and the `Array.from` splits in `shared/` exist for this, and `useCardDraft.test.ts`
guards it directly.

### Where offsets can move

Three places, each with its own defence:

| Risk                                              | Defence                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| The user edits the paragraph                      | Re-anchoring on commit; anything that cannot be re-found becomes an **orphan** shown to the user, never dropped silently |
| The DOM splits text nodes at highlight boundaries | A `TreeWalker` in document order, so nesting depth is irrelevant                                                         |
| Decorative DOM inside the paragraph               | `data-cloze-decoration`, skipped by the walker (see §6.1)                                                                |

Compose mode never touches `paragraph`. The textarea writes `draftText`; `paragraph`
changes only on **commit** (mode switch or blur), which is also where normalization
and re-anchoring happen. Without that split, every keystroke would invalidate every
offset on the card.

---

## 4. The decisions worth knowing

### 4.1 A 404 for another user's set, never a 403

`403` confirms the row exists. Over a few thousand requests that turns id enumeration
into a map of who owns what. Every query filters on `userId` in the `where` clause
rather than fetching and then comparing — six tests across `sets.test.ts` and
`cards.test.ts` cover this, including `GET /api/tags`, which would otherwise leak
another user's vocabulary.

The hazard to watch for when extending these routes: `where: { id, userId: undefined }`
is not a failed lookup, it is **an unscoped one**. Prisma drops undefined keys. A
`userId` that is optional anywhere upstream of a query is a data leak waiting for the
right request shape, which is why the route handlers take it as a required argument.

### 4.2 Two modes, not one surface

ADR 0001 chose a `<textarea>` over Slate/ProseMirror. A `<textarea>` cannot render
styled spans, so composing and highlighting cannot be the same element. Rather than
fight that, the mode switch is made load-bearing: it is the commit boundary where the
paragraph normalizes and answers re-anchor.

The alternative — a `contenteditable` that is always both — is what ADR 0001 rejected,
and it would have put offset bookkeeping in the path of every keystroke instead of at
one well-defined point.

### 4.3 Orphans are shown, not dropped

Delete a highlighted word and its blank cannot survive. The tempting behaviour is to
drop it. But a highlight is something the user did deliberately, and a silent
disappearance is indistinguishable from a bug.

So re-anchoring splits its output: answers that were re-found, and `orphaned` ones
that were not. `OrphanedNotice` says which words were lost. `dismissOrphans` clears it
once acknowledged — and undoing the edit clears it too, because the re-anchor simply
finds them again.

### 4.4 Blanks are a fixed width

Five underscores, always (plan §2.7). Proportional width leaks the answer: a short
blank rules out `photosynthesis` before the user has thought about it.

`ClozePreview` renders the underscore run `aria-hidden` with an `sr-only`
" blank N " beside it — a screen reader announcing five underscores tells you nothing,
and announcing them _proportionally_ would leak the same thing to a different sense.
It is built on shared `renderCloze` so the editor's preview and Phase 4's study view
cannot drift apart.

### 4.5 The tag filter narrows

Two chips means "cards with **both** tags" — the API matches with `hasEvery`. That is
the opposite of most filter bars, where each addition widens the result, so the UI
says it out loud: _"all of: computing, biology"_. `SetDetailPage.test.tsx` asserts
both the request shape and that sentence.

### 4.6 Selection is driven by `selectionchange`, not `mouseup`

On touch, adjusting a selection by dragging the handles fires no `mouseup` at all. A
`mouseup` listener therefore works perfectly in a desktop browser and silently does
nothing on a phone — which is precisely the combination that ships.

`selectionchange` fires in both, and the touch path pairs it with a pinned
**"Blank out selection"** action bar rather than acting on every change, because on
touch the selection is still being adjusted while the events arrive.

---

## 5. Verifying it yourself

> **A step-by-step checklist with the expected result for every action lives in
> [PHASE_3_TEST_CHECKLIST.md](./PHASE_3_TEST_CHECKLIST.md).** This section is the
> short version and the reasoning behind it.

### 5.1 The static gate

```bash
pnpm --filter @saulado/shared build   # must precede the frontend typecheck — see §6.4
pnpm --filter @saulado/shared test -- --run
pnpm --filter @saulado/frontend exec tsc --noEmit
pnpm --filter @saulado/backend exec tsc --noEmit
pnpm --filter @saulado/frontend test -- --run
pnpm --filter @saulado/backend test
pnpm lint
pnpm format:check
```

As of 2026-08-08: **491 tests** — 205 shared, 143 frontend, 143 backend.

### 5.2 The done-when criterion, by hand

1. `pnpm dev`, log in, **New set** → "Hardware".
2. **Add your first card.** Paste _"The CPU is the brain of the computer and RAM
   stores temporary data"_.
3. Switch to **Highlight**. Select `CPU`, then `RAM`. Two badged highlights, numbered
   1 and 2 by position.
4. The Preview pane reads `The _____¹ is the brain of the computer and _____² stores
temporary data` — both blanks the same width.
5. Save. The row in the set shows the **original** paragraph, not the blanked form.
6. Reopen it. Same two blanks, same positions.

### 5.3 The parts that are easy to mis-verify

**Blanks must be equal width.** If one looks wider, the fixed-width path was bypassed
somewhere; that is a correctness bug, not a styling one.

**Highlight `brain`, save, reopen, and check the blank still covers `brain`** — not
`rain` and not `brain `. This is the §6.1 bug, and a one-character drift is invisible
unless you look for it.

**Edit the paragraph after highlighting.** Type a sentence _above_ your highlights and
commit: every blank should still cover the same words. Then delete a highlighted word:
you should get an orphan notice naming it, not a vanished blank.

**Archive, then Restore.** Both buttons are the same control reading `archivedAt`. A
hardcoded `archived: true` makes Restore a no-op that looks like a dead button —
`SetsPage.test.tsx` pins both directions.

### 5.4 Proving isolation at the API level

```bash
# As user A, note a set id. Then as user B:
curl -i -b b.txt http://localhost:3000/api/sets/<A_SET_ID>
# → 404, not 403, and no body describing the set
```

---

## 6. Problems hit and how they were fixed

### 6.1 The badge counted as paragraph text — stored blanks were off by one

**The worst bug of the phase, and the one that would have shipped.**

`HighlightSurface` renders a small ordinal badge inside each `<mark>` so blanks are
numbered on screen. The badge is a `<sup>` containing `1`, `2`, … — and to a
`TreeWalker` walking text nodes, `"1"` is one character of paragraph text.

So with one existing blank on the card, every offset computed _after_ it was shifted
by the badge's digit count. Highlight `brain` and you stored `rain ` — one character
right, same length, still a valid range. It renders. It saves. Nothing errors.

The fix is three parts, all in `frontend/src/lib/selection.ts`:

- `PARAGRAPH_DECORATION_ATTR` (`data-cloze-decoration`) marks non-text DOM, applied by
  `HighlightSurface` to the badge. An explicit attribute rather than reusing
  `aria-hidden`: the two coincide today, but `aria-hidden` is an accessibility
  decision and someone setting it elsewhere should not silently move stored offsets.
- `paragraphTextWalker` rejects those subtrees — `FILTER_REJECT`, not `FILTER_SKIP`, so
  descendants are excluded too.
- A `compareDocumentPosition(current) & DOCUMENT_POSITION_FOLLOWING` branch handles a
  drag _released over the badge_: the walker passes it without visiting, so its
  position resolves to where the walked text ends, which is the end of the highlight
  it annotates. Without this, releasing on the badge reported the selection as outside
  the paragraph.

`buildParagraph` in `selection.test.ts` now renders the production DOM shape, badge
included, so all 24 tests in that file guard against a regression rather than one.

**The general lesson:** any decoration inside a text-offset surface is a silent
corruption risk. Mark it at the point it is added.

### 6.2 A prefix that did not match

`cardKeys.list(setId)` ends in an empty tag array, so invalidating it matched only the
_unfiltered_ list. Save a card while a tag filter was active and the visible list did
not update.

`cardKeys.listsForSet(setId)` is three elements and stops before the tags, so it
catches every filtered variant. Query-key prefix matching is only as good as where the
key stops being a prefix.

### 6.3 A mutation hook that could not serve a list

`useUpdateSet` originally bound the set id at hook creation: `useUpdateSet(id)`. That
is unusable from a list, because a hook cannot be called inside `.map()`.

So the id moved into the mutation variables — `mutate({ id, body })`. `useUpdateCard(id)`
and `useDeleteCard(setId)` keep their bound arguments, correctly: they act on one card,
or on one owning set. The shape follows the call site, not a house style.

### 6.4 The frontend typechecks against `shared/dist`

`shared`'s `exports` points at `./dist`, so the frontend consumes built output. Change
a shared signature, skip the rebuild, and `tsc --noEmit` cheerfully typechecks against
the previous version. **`pnpm --filter @saulado/shared build` is a prerequisite of the
frontend typecheck**, not an optional first step.

### 6.5 `getNextPageParam` must return `undefined`, not `null`

The API returns `nextCursor: null` at the end of a list. TanStack Query treats `null`
as a _valid page param_, so returning it straight through leaves `hasNextPage` true
forever and "Load more" refetches the last page. `?? undefined` at the boundary.

### 6.6 Two smaller ones

- **Tailwind cannot see interpolated class names.** `` `border-${color}-500` `` produces
  no CSS, because the scanner reads source text. Hence the explicit
  `Record<SetColor, string>` tables in `features/cards/colors.ts`.
- **Identical fixtures collide in `getByText`.** Two sets both defaulting to
  `cardCount: 2` made `getByText('2 cards')` throw. The fix is distinct fixture values,
  not `getAllByText` — the latter keeps the test passing while removing what it proved.

---

## 7. Before starting Phase 4

### Carried forward

**Real-device testing is owed, twice.** The touch paths are built but have only run in
jsdom and a desktop browser. Phase 1.4's mobile test was Android-only, and this phase
adds an untested iOS Safari path. WebKit's selection handles behave differently from
Blink's; both debts want the same session on real hardware.

**Deferred deliberately** (also recorded in the plan): due counts and due state, bulk
select → delete/move, and a standalone card detail view. The first needs Phase 4's
scheduler and the second needs an endpoint that does not exist; the third is covered
by the editor's Write/Highlight tabs and Preview pane.

### What Phase 4 can rely on

- `renderCloze` / `renderClozeText` in `shared/` — the study view must render blanks
  through these, not reimplement them. Fixed width is a correctness property (§4.4).
- Answers arrive ordered by position with `ordinal` assigned positionally, so blank 0
  is always the leftmost.
- `altAnswers` is populated and travels with each answer; the grader should honour it.
- Every card query is already `userId`-scoped, and `card.studySetId` is trustworthy —
  a card cannot be moved into a set the user does not own (`cards.test.ts`).

### Prerequisite check for Phase 4

The scheduler needs a `card_schedules` table that does not exist yet. Nothing in
Phase 3 stubbed it — the set list shows no due count precisely because rendering a
hardcoded zero would look like data.

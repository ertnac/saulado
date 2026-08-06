# ADR 0001 — Highlight editor: custom `<textarea>` vs a rich-text framework

- **Status:** Proposed — pending mobile verification (see §5)
- **Date:** 2026-08-06
- **Phase:** 1.4
- **Deciders:** Saulado Dev

## 1. Context

Card creation is the app's core interaction: the user writes or pastes a
paragraph, selects the words that should become blanks, and saves. Everything
downstream — the offset model, validation, the study renderer — is already built
and tested (Phase 1.1–1.3, 134 tests). What is undecided is the input surface.

The constraint that decides this is **§2.1 of the implementation plan**: the
paragraph is stored as immutable plain text and answers are stored as
**code-point character ranges** into it. The rendered `_____` form is derived and
never persisted.

That constraint is unusually specific about what the editor must produce, and it
rules out the thing rich-text editors are actually good at. We do not want a
document tree, marks, or HTML. We want two integers per blank.

## 2. Options

### Option A — `<textarea>` + native Selection API (custom)

Read `selectionStart` / `selectionEnd`, convert UTF-16 code units to code points
at the boundary, hand them to `createAnswer`.

- **Bundle cost:** 0 KB.
- **Model fit:** exact. The selection API already speaks offsets.
- **Loses:** inline visual highlighting inside the editable region. A `<textarea>`
  cannot render styled spans, so highlights show in a separate preview rather
  than in place.

### Option B — ProseMirror / Slate

A document model with marks, and a `<mark>`-style decoration for each highlight.

- **Bundle cost:** ~100 KB min+gzip for ProseMirror core + view + state, against a
  180 KB total budget (§4.2). That is over half the budget for one input.
- **Model fit:** poor, and poor in a way that costs correctness. A document tree
  indexes positions by node, so every save requires flattening tree positions
  back to flat code-point offsets, and every load requires the inverse. That
  conversion is a second offset system living beside the one already tested —
  the exact class of bug the plan calls out as unrecoverable six weeks later
  (§4.1: "Offset corruption from Unicode or paragraph edits", impact High).
- **Gains:** true inline highlighting, and a mature answer to selection quirks.

### Option C — tap-to-select whole words

Tokenize the paragraph, render each word as a tap target, blank on tap. Named in
the plan's risk table as the mobile fallback.

- **Bundle cost:** 0 KB.
- **Model fit:** exact, and stricter — token boundaries are always valid ranges.
- **Loses:** multi-word answers need tap-then-extend, and arbitrary sub-word
  selections become impossible.
- **Note:** the plan observes this is "arguably better UX on touch anyway", and
  that is not just consolation. Tapping a word is one gesture; dragging two
  selection handles to land exactly on a word boundary is several, on a surface
  where your finger covers the target.

## 3. Decision

**Option A, with Option C held as a live fallback rather than a hypothetical
one.** Option B is rejected outright.

Option B's rejection does not depend on the mobile test. It is rejected because
it introduces a second position system for a feature whose entire value is
having exactly one, and it spends over half the JS budget to do so. Inline
highlighting is worth real money, but not that much money and not that risk.

The choice between A and C is a touch-ergonomics question that cannot be
answered by reasoning, only by a thumb on a real phone. §5 records that test.
The pivot from A to C is cheap and stays cheap: both feed the same
`createAnswer(paragraph, start, end)` call, so it replaces the selection
mechanism and touches nothing below it.

## 4. What the spike verified (automated)

The prototype lives at `frontend/src/spike/TextHighlighter.tsx`, reachable at
`/#spike`. It deliberately uses the real `@saulado/shared` engine rather than
reimplementing offsets, so the spike tests the actual integration boundary.

Verified mechanically against `shared/dist`:

| Check                                                            | Result                     |
| ---------------------------------------------------------------- | -------------------------- |
| Emoji selection (2 code units) maps to 1 code point              | pass                       |
| CJK selection after a surrogate pair resolves correctly          | pass                       |
| Naive UTF-16 slicing at the same index yields the **wrong** text | pass                       |
| Two blanks render as equal-width `_____`                         | pass                       |
| Editing before a blank carries the blank along                   | pass                       |
| Deleting a blanked word orphans it rather than dropping it       | pass                       |
| Frontend production build                                        | 58 KB gzip (budget 180 KB) |

The third row is the load-bearing one: it confirms `codeUnitToCodePoint` is
doing real work at this boundary and is not ceremonial. Without it, any
paragraph containing an emoji before a blank silently produces a
shifted answer.

## 5. Mobile verification — PENDING

**This section is the actual decision gate and it is not yet filled in.** It
requires a physical phone; it cannot be simulated, and desktop Chrome's device
emulation does not reproduce native selection-handle behaviour.

Run `pnpm dev`, open `http://<your-lan-ip>:5173/#spike` on a phone, and record:

| #   | Test                                                      | Result |
| --- | --------------------------------------------------------- | ------ |
| 1   | Select a single word by tap-and-drag                      |        |
| 2   | Select multiple words across a line break                 |        |
| 3   | Drag selection handles to adjust without losing selection |        |
| 4   | Yellow confirm bar appears on finger-lift                 |        |
| 5   | Buttons comfortable one-handed                            |        |
| 6   | Blank the emoji and CJK sample; bracketed offsets correct |        |
| 7   | Edit text before a blank; blank follows its word          |        |
| 8   | Delete a blanked word; reported orphaned, not vanished    |        |

**Device / browser tested:**

**Notes:**

### How to read the result

- **Tests 1–5 pass** → confirm Option A. Change Status to Accepted, note that
  inline highlighting is a known, accepted limitation, and delete
  `frontend/src/spike/` plus the `#spike` branch in `main.tsx`.
- **Test 3 fails, or 1–2 are fiddly enough to be annoying** → switch to Option C
  before Phase 3 starts. Handle-dragging is the interaction most likely to fail
  on touch, and it is the one Option C removes entirely.
- **Tests 6–8 fail** → stop. That is not an editor problem, it is a bug in
  `shared/src/cloze/`, and §4 says it should be impossible. Fix the engine first.

## 6. Consequences

- Phase 3 builds the highlight editor directly against the Selection API with no
  editor dependency, keeping the JS budget clear for the study path.
- Highlights are shown in a live preview beside the input rather than inline.
  If in-place highlighting later proves necessary, the upgrade path is a
  `contenteditable` overlay positioned from offsets — not adopting a framework.
- Whichever of A or C wins, `createAnswer` / `validateAnswers` / `renderCloze`
  are untouched. That is the payoff for having built the engine in Phase 1
  rather than alongside the UI in Phase 3.

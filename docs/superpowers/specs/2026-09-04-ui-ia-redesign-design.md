# UI Information Architecture — One Job Per Screen

> The third pass over the frontend, and the first that changes what a screen
> _says_ rather than what it looks like: each screen ordered around the one thing
> it exists to do, and the controls that got hand-rolled along the way folded back
> into primitives.
>
> **Builds on:** `docs/UI_REDESIGN_PLAN.md` (U0–U9) and
> `docs/superpowers/specs/2026-09-04-clay-ui-redesign-design.md` (C0–C10), both
> complete. Those two established the token system, the pill controls, the icon
> rail, the clay tier scale and the shared motion vocabulary. This phase does not
> revisit any of them, and adds no new visual language.
>
> **Scope:** layout, order and interaction. Unlike C0–C10 this phase **does**
> change behaviour, so it **does** change tests — §8 is the contract for how.

---

## Table of contents

1. [Where the app actually is](#1-where-the-app-actually-is)
2. [What this phase changes](#2-what-this-phase-changes)
3. [The three rules](#3-the-three-rules)
4. [The dashboard](#4-the-dashboard)
5. [Filter surfaces](#5-filter-surfaces)
6. [One way to add content](#6-one-way-to-add-content)
7. [Touch targets and the contrast debt](#7-touch-targets-and-the-contrast-debt)
8. [The testing contract](#8-the-testing-contract)
9. [Constraints this redesign may not break](#9-constraints-this-redesign-may-not-break)
10. [Phases](#10-phases)
11. [Verifying it](#11-verifying-it)
12. [Deliberately not doing](#12-deliberately-not-doing)

---

## 1. Where the app actually is

The visual language is settled and good. What has not kept up is the arrangement:
two redesigns improved how surfaces look without ever revisiting what order they
appear in, or how many of them appear at once.

Two findings frame this phase. Both are contradictions between what the codebase
says it does and what it does.

**The dashboard contradicts its own stated purpose.** `AppShell.tsx` cites the
principle in a comment — _"The dashboard's one job is to point at 'Start
studying'"_ — and `DashboardPage` then renders, in this order: a 120px greeting
block, five quick-action buttons, and only then the study call to action. On a
360px viewport the primary action of the primary screen begins below the fold.
The same screen states four numbers twice: due and new cards appear in the hero
figure _and_ as metric chips, the streak appears in a chip _and_ in `StreakCard`,
the daily goal appears in a chip _and_ in `GoalRing`.

**The sets toolbar reinvents four primitives that already exist.** Three stacked
rows before any content: an `aria-pressed` button pair doing what
`SegmentedControl` does, a hand-rolled search field doing what `Input` does, a
raw `<select>` doing what `Select` does, and colour chips at 26px. The search
field is `text-xs`, which makes iOS Safari zoom the page on focus — the exact
failure `input.tsx` documents `text-base` to prevent.

Behind those two, a measured drift audit. Every count below was verified against
the tree at `0c9ab97`:

| Drift                                                              | Sites | Files | Rule it breaks                                              |
| ------------------------------------------------------------------ | ----- | ----- | ----------------------------------------------------------- |
| Hand-rolled card surfaces (`rounded-xl border border-border bg-…`) | 22    | 14    | Bypasses `Card`, so the C2 clay tier never reached them     |
| Raw Tailwind palette colours (`emerald-500`, `red-600`, …)         | 33    | 7     | `UI_REDESIGN_PLAN.md` §3 — dark mode is not guaranteed      |
| Raw Tailwind shadows (`shadow-sm`, `shadow-2xl`, …)                | 22    | 7     | §4 elevation tokens (`--shadow-soft`, `--shadow-lift`)      |
| Uppercase tracking labels                                          | 18    | 9     | §4: "no more uppercase tracking-wide"                       |
| Interactive controls under 44px                                    | 14    | 7     | §5.3: 44×44px minimum touch target                          |
| Raw `<textarea>`                                                   | 4     | 4     | No `Textarea` primitive exists, so each reinvents the field |
| Raw `<select>` outside `select.tsx`                                | 2     | 2     | `Select` exists                                             |

The uppercase-label count is worth reading twice. `card.tsx` explains in a
comment why sentence case is used — small all-caps is measurably harder to read
for dyslexic readers — and eighteen labels do it anyway, including the least
important line on the dashboard.

## 2. What this phase changes

**The order is the feature.** Nothing here needs a new component to look better;
it needs fewer things, in a defensible sequence. The dashboard change is
overwhelmingly deletion — a component removed, a heading level removed, a block
compressed to one line.

**A primitive is built only where something is already duplicated.** One is:
the independently-toggleable filter chip, implemented three separate times at
three different sizes, none of which clears the touch floor. Two components come
out of this phase and no more.

**Content-adding gets one door.** Five buttons on the dashboard and a further
pair on the sets page all open something that creates cards. They become one
entry point that both screens share.

**Compliance is fixed where this phase is already editing, and nowhere else.**
The drift table in §1 is a hundred-odd sites. Sweeping all of them is a different
piece of work with a different risk profile; leaving a file half-migrated because
the sweep was out of scope is worse than either. So the rule is: files touched by
D0–D4 come fully into line, and §12 names what is left.

## 3. The three rules

Every change in this phase is justified by one of these, and reviewable against
it.

1. **One job per screen, and the DOM order proves it.** The primary action
   precedes secondary ones in source order, not merely in visual weight. This is
   testable without a browser, which is why it is stated this way.
2. **Every interactive control clears 44×44px.** Already required by
   `UI_REDESIGN_PLAN.md` §5.3, already honoured by `Button`, `IconButton` and
   `Input`, and broken by fourteen hand-rolled controls.
3. **If a primitive exists, it is not hand-rolled.** If something is hand-rolled
   three times, it becomes a primitive.

## 4. The dashboard

### The heading collapse

Today the screen has an `<h1>` reading "Welcome, Ana" and an `<h2>` reading
"Ready to review". Two headings, and the one with the higher rank carries no
information — a screen-reader user navigating by heading hears the greeting
first and the state second.

The `<h1>` becomes the state. `heading()` already computes exactly the right
string ("Ready to review" / "Today" / "Ready when you are" / "Nothing to study
yet"), so this is a move rather than new logic, and the `<h2>` disappears
entirely.

The greeting becomes one muted line above it, in sentence case rather than
`uppercase tracking-wider`. The 64px avatar block goes: the app header already
carries an avatar that links to settings, and when no profile image is set this
block rendered the same emoji that the greeting text beside it already showed.

The `<section aria-labelledby="study-heading">` wrapper around the hero becomes a
plain container. With the `<h1>` immediately above it stating the same thing,
labelling the section as well would announce the state twice.

### The order

| #   | Region                                                  | Was                                        |
| --- | ------------------------------------------------------- | ------------------------------------------ |
| 1   | Greeting line (one line)                                | 120px block with avatar, emoji and tagline |
| 2   | `<h1>` — the state                                      | `<h2>` under a content-free `<h1>`         |
| 3   | Hero CTA + Quick learn                                  | third, under five secondary buttons        |
| 4   | Recent sets, with **Add content** in its section header | fourth; header held a "New set" button     |
| 5   | Progress (`TodaySection`)                               | third, above the sets                      |

Note where **Add content** is not: the page header. Rule 1 in §3 requires the
primary action to precede secondary ones in source order, and a header action
would sit above the study CTA — breaking the rule this phase exists to enforce,
on the very screen it was written for. `RecentSets` already has a "New set"
button in its section header, which is also where adding a set contextually
belongs: beside the list of sets, under the CTA rather than over it. The dashboard
therefore does not adopt `PageHeader`.

### The deletion

`MetricChip` and the four-chip grid inside `TodaySection` are **removed
entirely**. Every one of the four numbers is stated elsewhere on the same screen:

| Chip           | Also shown by                     |
| -------------- | --------------------------------- |
| Due Cards      | the hero figure in `DuePanel`     |
| New Cards      | the hero figure in `ReadyToLearn` |
| Current Streak | `StreakCard`                      |
| Daily Goal     | `GoalRing`                        |

The chips also served as navigation, to `/study`, `/sets` and `/progress`. That
is covered: the hero CTA already links to `/study`, the recent-sets section
already links to `/sets`, `TodaySection` already has a "See all progress" link,
and the icon rail reaches all three from every screen. Four duplicated figures is
too high a price for a fourth route to somewhere already reachable three ways.

`TodaySection` renders only when `data.hasStudied === true`, so on a new account
none of this was visible anyway — the deletion cannot affect first-run.

## 5. Filter surfaces

### `FilterChip`

The gap in the current set of primitives is precise. `Badge` is not interactive.
`segmentClass` is for a mutually-exclusive group where exactly one option is
chosen. Neither covers an independently-toggleable filter, which is why it was
written three times:

| Call site                    | Current size   |
| ---------------------------- | -------------- |
| `SetsPage` — colour filter   | `h-6.5` (26px) |
| `SearchPage` — tag filter    | `min-h-[36px]` |
| `SetDetailPage` — tag filter | `min-h-[36px]` |

The last two are the same class string in both files, which is the usual sign
that a component was needed and skipped.

```ts
interface FilterChipProps {
  pressed: boolean
  onToggle: () => void
  children: ReactNode
  /** Trailing count. Tabular, so a row of chips does not jitter as counts change. */
  count?: number
  /** Leading ornament — the colour dot on the set-colour filter. Decorative. */
  leading?: ReactNode
}
```

`aria-pressed` rather than a checkbox: these are toggle buttons that re-run a
query, not form fields that get submitted, and `aria-pressed` is what announces
"pressed"/"not pressed" for that. `min-h-11` for rule 2.

### `FilterBar`

44px chips make a filter row taller, and the sets page already spends three rows
and four controls before any content appears on a phone. `FilterBar` is what
makes the floor affordable rather than merely compliant.

```ts
interface FilterBarProps {
  /** Visible at every width. Typically the search field. */
  primary?: ReactNode
  /** Collapsed behind the Filters button below `sm`. */
  children: ReactNode
  /** How many filters are currently narrowing the result. Drives the badge. */
  activeCount: number
}
```

Below `sm` the secondary filters sit behind a **Filters** button carrying
`activeCount` as a badge, wired with `aria-expanded` and `aria-controls`. From
`sm` up they are always shown and the button is not rendered.

**Implementation note, because the obvious version is wrong.** The collapse must
be pure CSS at the breakpoint, not a JavaScript media query — a JS breakpoint
renders the wrong branch on first paint and reintroduces the layout shift §9.6
forbids. Use a class, not the `hidden` attribute:

```tsx
<div className={cn(open ? 'flex' : 'hidden', 'sm:flex')} id={panelId}>
```

`sm:flex` then wins over `hidden` at wide widths, and because the collapsed state
is `display: none` rather than opacity, the accessibility tree matches what is on
screen at both widths. The `hidden` _attribute_ cannot be overridden this way,
which is why it is not used here. The disclosure button is `sm:hidden`, so at
wide widths a screen-reader user is never offered a control that does nothing.

### What the three screens stop hand-rolling

| File            | Replaced by                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SetsPage`      | `SegmentedControl` for Active/Archived; `Input` for search; `Select` for sort; `FilterChip` for colours; `FilterBar` for the row |
| `SearchPage`    | `FilterChip` for tags; `FilterBar` for the row                                                                                   |
| `SetDetailPage` | `FilterChip` for tags; `FilterBar` for the row                                                                                   |

`Input` also fixes the iOS zoom-on-focus bug, since it carries `text-base`.

## 6. One way to add content

Five dashboard buttons (`QuickActions`) plus the sets page's own header pair all
lead to something that creates cards. That is six entry points to one intent,
worded differently in two places.

**Quick Learn is not one of them.** It starts a study session, so it moves out of
the group entirely and sits beside the hero CTA — next to the other thing that
starts studying. Which hero variants get it is not uniform, because not all of
them have anything to study:

| Hero variant           | Quick learn                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `DuePanel`             | beside the CTA                                                  |
| `ReadyToLearn`         | beside the CTA                                                  |
| `CaughtUp`             | on its own — reviews are done, but a set can still be revisited |
| `NothingReady`         | omitted — the set has no highlighted blanks to ask about        |
| `GettingStarted`       | omitted — there are no sets yet                                 |
| `DashboardUnavailable` | omitted — it is an error state                                  |

The remaining four — New set, Import deck, Import from image, Starter decks —
go behind a single **Add content** button. On the dashboard it lives in the
recent-sets section header (§4); on the sets page it goes in `PageHeader`'s
existing `actions` slot, where adding a set _is_ the screen's primary action and
so leads legitimately. Both render the same component, so the two cannot drift
apart again.

**It is a `Dialog`, not a dropdown menu.** No menu primitive exists, and an
accessible one is roughly 120 lines of roving focus, Escape handling,
click-outside and `aria-haspopup` — all of which `dialog.tsx` already has, with
tests. `Dialog` is also already a bottom sheet below `sm` (`items-end`), which is
a better touch target than a dropdown anchored to a header button. Each option is
a full-width row with its icon, name and a line of explanation, which is room the
five cramped buttons never had.

## 7. Touch targets and the contrast debt

### The 44px sweep

| File                | Control                              | Current          |
| ------------------- | ------------------------------------ | ---------------- |
| `SetsPage`          | colour filter chips (×2 class sites) | `h-6.5` (26px)   |
| `SearchPage`        | tag chips                            | `min-h-[36px]`   |
| `SetDetailPage`     | tag chips                            | `min-h-[36px]`   |
| `StudyModeSwitcher` | mode buttons                         | `h-8` (32px)     |
| `QuickLearnDialog`  | five buttons                         | `h-8` (32px)     |
| `OcrToolbar`        | two buttons, one square control      | `h-8`, `h-7 w-7` |
| `SetDialog`         | colour swatch buttons                | `h-7 w-7` (28px) |

`MultipleChoiceMode`'s `h-7 w-7` letter badge is excluded pending a check that it
is decorative — it appears to be a label inside a larger option button, in which
case the option is the target and the badge is not one. Verify before touching.

The chips are handled by `FilterChip`; the rest is a per-site sweep. The cost is
honest and worth stating: some rows get taller. `FilterBar` keeps that off a
phone screen until the user asks for it, and does not eliminate it.

### The accent contrast failure

`contrast.test.ts` records a pre-existing shortfall found during C0: light-theme
`--accent` measures **3.2:1** against `--accent-foreground` at the base and
**3.8:1** at the deep end, against a 4.5:1 floor. It affects every accent button
and badge in the light theme.

The fix is to darken light-theme `--accent-foreground` the way the dark theme
already does — measured at 5.1:1 against the base. It was deferred out of C0
because it recolours text on the landing page, which the clay spec froze as its
reference. That freeze does not apply to this phase, so it lands here: one token
value, and the `floor: { light: 3.2 }` exemption deleted from `contrast.test.ts`
so the assertion holds at 4.5 in both themes.

## 8. The testing contract

C0–C10 ran under a hard rule: **zero assertions edited**, on the grounds that a
purely presentational change needs no test edits, which made the suite the proof
that the phase stayed presentational.

**That rule cannot survive this phase and is replaced, not quietly dropped.**
Elements move between regions, four duplicated figures are deleted, and six entry
points become one. Tests will change. The replacement is narrower than "tests may
change":

1. A test may be edited **only** when the element it queries genuinely moved or
   was deliberately removed by this spec. The edit changes the **query**; it may
   not change what the assertion means. Loosening `getByRole` to `queryByText` to
   make a failure go away is a violation.
2. Deleting a test requires the behaviour to be deliberately gone **and named in
   this document**. Anything else failing is a regression to fix in the
   component.
3. Every deleted duplicate keeps one assertion on the surviving instance. The
   four removed chips mean the due count, new count, streak and daily goal each
   keep exactly one test that still reads them from the screen.
4. Each phase's commit message lists every test file it edited and why, in one
   line each. A phase that edits tests without that list is not finished.

Two guards are added, both of which would have caught the bugs this phase fixes:

- **DOM order.** The study CTA precedes secondary actions in the dashboard's
  source order. The ordering _was_ the defect, so it gets an assertion rather
  than a comment. `getAllByRole('link' | 'button')` and compare indices.
- **Touch-target floor.** A source-scanning test over `features/` and
  `components/ui/`, in the same style as `contrast.test.ts`, failing on the
  sub-44px height utilities with an explicit allowlist for non-interactive uses
  (icons, avatars, badges, swatch previews).

  The second guard is a heuristic with a known ceiling and must be marked as one:
  a regex cannot tell an interactive element from a decorative one, so the
  allowlist is load-bearing. It is still worth having — it is exactly the
  regression that happened fourteen times — but it is a tripwire, not a proof,
  and the `ponytail:` comment on it should say so.

## 9. Constraints this redesign may not break

1. **4.5:1 on body text, 3:1 on UI boundaries, both themes.** §7 improves this;
   nothing here may regress it.
2. **Accessible names and roles are preserved across every move.** Relocating a
   control must not change how it is announced. The combobox ARIA in
   `CommandPalette` and the radiogroup semantics in `SegmentedControl` are
   byte-identical.
3. **44×44px minimum, and nothing shrinks to pay for the taller rows.**
4. **Visible focus ring on everything focusable**, including the new
   `FilterChip` and the `FilterBar` disclosure button.
5. **No layout shift on load**, which is why the `FilterBar` collapse is a CSS
   breakpoint and not a JavaScript one.
6. **320px still works.** The taller filter rows are the risk; check the sets
   page with every filter expanded.
7. **Heading order stays sequential.** The dashboard drops from `h1`+`h2` to a
   single `h1`; the sections below it must not now skip a level.
8. **Reduced motion still renders everything, still nothing moving.** The
   `FilterBar` disclosure must not depend on an animation to reveal its content.
9. **No route, query, contract or persistence change.** This phase moves and
   deletes presentation and rearranges which component opens which dialog. If a
   change needs a new endpoint or a schema field, it is out of scope.

## 10. Phases

Bottom-up. Each leaves the app shippable.

| #      | Phase                           | Files                                                           | Done when                                                                                                                                    |
| ------ | ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **D0** | Accessibility floors            | `index.css`, `lib/contrast.test.ts`, the 6 files from §7        | Light accent clears 4.5:1 with the exemption deleted; all fourteen controls clear 44px; the floor guard test exists and passes               |
| **D1** | Filter primitives               | `components/ui/filter-chip.tsx`, `components/ui/filter-bar.tsx` | Both exist with focus rings, 44px targets and the CSS-breakpoint collapse; unit-tested in isolation                                          |
| **D2** | Migrate the filter screens      | `SetsPage`, `SearchPage`, `SetDetailPage`                       | Three hand-rolled chip implementations gone; sets search is `Input`, sort is `Select`, Active/Archived is `SegmentedControl`                 |
| **D3** | One Add entry                   | `AddContentDialog`, `DashboardPage`, `SetsPage`                 | Four content-adding paths behind one dialog used by both screens; Quick Learn beside the hero CTA; `QuickActions` deleted                    |
| **D4** | Dashboard restructure           | `DashboardPage`                                                 | Heading collapsed to one `h1` carrying the state; greeting one line; `MetricChip` and its grid deleted; order per §4; DOM-order guard passes |
| **D5** | Token sweep, touched files only | the files D0–D4 touched                                         | No raw palette colour, raw shadow, uppercase tracking label or hand-rolled card surface remains **in those files**                           |
| **D6** | Gate                            | —                                                               | prettier, `tsc -b`, eslint clean; whole suite green; every test edit justified per §8.4                                                      |

## 11. Verifying it

From `frontend/`, cheapest first:

```bash
npx prettier --write src
npx tsc -b --force --pretty
npx eslint src
npx vitest run
```

Then by eye, because none of the above can see an arrangement:

- **The dashboard at 360px.** The state heading and the study CTA are both above
  the fold. That single sentence is the whole point of the phase.
- **The sets page at 320px**, filters collapsed and expanded. No horizontal
  scroll, nothing under 44px, the Filters badge counts correctly.
- **Tab through the dashboard and the sets page.** Every stop shows a ring,
  including each `FilterChip` and the disclosure button. Tab order still follows
  reading order after the re-ordering.
- **A screen reader on the dashboard.** One `h1`, and it states what to do rather
  than saying hello.
- **Dark mode on the accent buttons and badges**, since §7 changes a foreground
  token that every one of them uses.
- **OS reduced motion on.** Everything renders, nothing moves, the disclosure
  still opens.

## 12. Deliberately not doing

- **No new dependency**, and no component library.
- **No menu primitive.** §6 — `Dialog` already has the hard parts.
- **No task-first navigation rewrite.** A persistent Study action in the shell and
  a dashboard reduced to a single card were considered and rejected for this
  phase: they rewrite `AppShell` and five dialog entry points, and the good idea
  inside them (one door for adding content) is delivered by §6 without the churn.
- **No full compliance sweep.** D5 is scoped to files this phase already edits.
  Deferred, and worth its own change: `LandingPage`'s 19 raw palette colours,
  `AuthLayout`'s 3, the `OcrReviewEditor` / `CardHighlightEditor` surfaces, and
  the 22 hand-rolled card surfaces outside any touched file.
- **No `Textarea` primitive.** It is a genuine gap — four raw `<textarea>`
  elements, no primitive — but all four live in files this phase never opens
  (`LandingPage`, `HighlightEditor`, `OcrReviewEditor`,
  `UniversalImportDialog`). Building a primitive with no caller in scope, or
  reaching into four untouched files to give it one, both break the D5 boundary.
  It belongs with the deferred sweep above.
- **No new visual language.** No new colour, radius, shadow or easing. If this
  phase needs a token that does not exist, that is a signal the change is not
  really about arrangement.
- **No analytics or instrumentation.** The two findings in §1 are contradictions
  with the codebase's own written rules, provable by reading it. Measuring them
  first would be ceremony.
- **No landing or auth restyle.** Still the reference, with the single exception
  of the `--accent-foreground` token in §7, which is a contrast fix and touches
  them only through the token.

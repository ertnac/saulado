# Clay UI Redesign — Tiered Claymorphism and Choreographed Motion

> The second pass over the frontend's visual language: soft-clay depth carried
> into the interior screens, and a motion system that the whole app shares
> instead of retyping.
>
> **Builds on:** `docs/UI_REDESIGN_PLAN.md` (U0–U9), which is complete. That
> phase established the pale-green token system, pill controls, the icon rail and
> the borderless soft-shadow card. This phase does not revisit any of it.
>
> **Scope:** presentation only. No route, contract, query or behaviour change.

---

## Table of contents

1. [Where the app actually is](#1-where-the-app-actually-is)
2. [What this phase changes](#2-what-this-phase-changes)
3. [The clay tier scale](#3-the-clay-tier-scale)
4. [The dark-mode clay button defect](#4-the-dark-mode-clay-button-defect)
5. [The motion system](#5-the-motion-system)
6. [Reduced motion, and the lever that protects the test suite](#6-reduced-motion-and-the-lever-that-protects-the-test-suite)
7. [Primitive changes](#7-primitive-changes)
8. [Per-screen choreography](#8-per-screen-choreography)
9. [Constraints this redesign may not break](#9-constraints-this-redesign-may-not-break)
10. [Phases](#10-phases)
11. [Verifying it](#11-verifying-it)
12. [Deliberately not doing](#12-deliberately-not-doing)

---

## 1. Where the app actually is

The U0–U9 redesign landed. The app wears pale-green surfaces, deep-green
actions, a clay accent, pill controls and a left icon rail. That is not what this
phase is about.

What happened afterwards is that a claymorphic layer was added on top — and
added in only one corner of the app. `src/index.css` already defines
`.clay-card`, `.clay-card-interactive`, `.clay-btn-primary`, `.clay-btn-accent`
and `.clay-pill`, and exactly four files use them: `LandingPage`, `AuthLayout`,
`LoginPage`, `RegisterPage`. Every other screen — thirty-four files across
dashboard, sets, set detail, study, search, progress, account, settings, admin
and every dialog — is still on the flat `<Card>` with `shadow-soft`.

So a visitor gets a soft, tactile, animated landing page, signs in through two
more of them, and lands on a dashboard that looks like a different product. That
discontinuity is the problem this phase exists to close.

Three secondary facts shape the work:

- **`framer-motion` v13 is already a dependency** and is used in five files.
  Nothing new needs installing; GSAP would be a second animation runtime for
  capabilities we already have.
- **The motion values are copy-pasted.** The easing array `[0.16, 1, 0.3, 1]`
  appears roughly fifteen times inside `LandingPage.tsx` alone, alongside
  hand-written durations. There is no shared motion module.
- **The test suite does not assert on class names.** There is no `toHaveClass`
  or `classList` assertion anywhere in `src/**/*.test.tsx`. A genuinely
  presentational change needs no test edits, which makes the suite the proof
  that this phase stayed presentational.

## 2. What this phase changes

Four decisions frame everything below.

**Clay is tiered, not universal.** Clickable and primary surfaces get clay
depth. Dense data — chart marks, table rows, figure grids — stays flat with a
soft shadow. A puffy row per table line destroys the scannability that a study
app's set list and progress table depend on, and the style database's own
guidance is explicit that overshoot and heavy depth on informational UI "reads
as sloppy".

**Motion is choreographed rather than incidental.** Scroll-reveal on long pages,
`layoutId` transitions where a control moves between states, `AnimatePresence`
on list reflow, count-up on the figures a screen exists to show. Bounded by §6
and §9, not by taste.

**Clay lives in the primitives.** The alternative — hand-writing
`clay-card p-6 sm:p-8` into thirty-four files, which is how the landing page was
built — pays for the same look thirty-four times, guarantees drift, and leaves
the next new screen starting flat. Pushing the tier into `ui/card.tsx`,
`ui/button.tsx` and the rest means most screens change by zero or one line, and
the design becomes what a new screen inherits by default.

**Landing and auth are the reference, and are not restyled.** Their visuals stay
byte-identical. They are edited only to swap inline motion literals for the
shared tokens, which removes the duplication without changing a pixel.

## 3. The clay tier scale

Six tiers, four of which already exist. The names stay; two are added.

| Tier        | Class                           | Status  | Applies to                                         |
| ----------- | ------------------------------- | ------- | -------------------------------------------------- |
| flat        | none — `bg-surface shadow-soft` | exists  | chart panels, table rows, dense figure grids       |
| card        | `.clay-card`                    | exists  | stat cards, set cards, section panels              |
| interactive | `.clay-card-interactive`        | exists  | cards that are themselves a link or button         |
| raised      | `.clay-raised`                  | **new** | dialogs, the command palette, popovers             |
| inset       | `.clay-inset`                   | **new** | text inputs, textareas, wells, the segmented track |
| pill        | `.clay-pill`                    | exists  | chips, badges, secondary controls                  |

`.clay-inset` carries more weight than its size suggests. Clay reads as a
material because some things are pushed out and others are pressed in; a design
where every surface bulges outward is merely rounded. Inputs are where the
pressed-in direction belongs.

```css
.clay-inset {
  background-color: hsl(var(--surface-muted));
  /* 12px, not a pill: a fully rounded textarea puts its first and last
     characters inside the curve. Same exception §4 of the U-phase plan made. */
  border-radius: 0.75rem;
  border: 1px solid hsl(var(--border) / 0.5);
  box-shadow:
    inset 2px 2px 5px hsl(var(--foreground) / 0.07),
    inset -1px -1px 3px rgba(255, 255, 255, 0.6);
}

.dark .clay-inset {
  box-shadow:
    inset 2px 2px 5px rgba(0, 0, 0, 0.45),
    inset -1px -1px 3px rgba(255, 255, 255, 0.06);
}
```

`.clay-raised` is `.clay-card` with the outer shadow scaled to `--shadow-lift`
proportions, for the same reason `lift` exists in the U-phase system: something
floating over the page needs to read as further from it than a panel sitting on
it.

### Radius ownership

`.clay-card` hardcodes `border-radius: 1.5rem` while `Card` applies
`rounded-lg` (`1rem` via `--radius`). Both currently land on the same element in
the four clay files and Tailwind's output order decides the winner. The clay tier
owns its radius, so `Card` stops emitting `rounded-lg` whenever elevation is not
`flat`. Without this the nested-well relationship breaks — a well inside a card
is supposed to be visibly tighter than its parent, not concentric with it.

## 4. The dark-mode clay button defect

This is a live bug on the landing and login pages, not a redesign choice.

`index.css:247` and `:275` define the clay buttons with a hardcoded second
gradient stop:

```css
.clay-btn-primary {
  background: linear-gradient(135deg, hsl(var(--primary)), hsl(158 48% 20%));
}
.clay-btn-accent {
  background: linear-gradient(135deg, hsl(var(--accent)), hsl(14 82% 50%));
}
```

`.clay-card` and `.clay-pill` both have `.dark` overrides. These two do not. In
dark mode `--primary` inverts to a light green (`152 46% 62%`) and
`--primary-foreground` to near-black (`166 40% 9%`), so the button gradients
from light green into `158 48% 20%` — nearly black — while keeping dark text.
Contrast fails across the lower half of every primary button on both pages.

The fix follows the file's own convention: no colour is a literal, every colour
is a token.

```css
:root {
  --primary-deep: 158 48% 20%;
  --accent-deep: 14 82% 50%;
  --danger-deep: 358 62% 36%;
}
.dark {
  --primary-deep: 152 42% 50%;
  --accent-deep: 14 72% 56%;
  --danger-deep: 358 64% 58%;
}
```

In dark mode the "deep" end is _lighter_, not darker, because it still has to
carry dark foreground text. This is the same inversion `--accent-strong` already
documents at `index.css:91`.

`--danger-deep` is added at the same time so `Button`'s `danger` variant can have
a clay recipe (`.clay-btn-danger`) rather than borrowing one, keeping the
separation between `--danger` and `--warning` that the highlight editor depends
on.

## 5. The motion system

A new `src/lib/motion.ts` holds every timing value the app is allowed to use.

```ts
/** The curve the landing page established. Enter and exit, everything non-springy. */
export const EASE = [0.16, 1, 0.3, 1] as const

/**
 * Overshoot. Controls only — a button, a chip, a toggle.
 * Never a data mark: a bar that overshoots its value misreports the data
 * for the duration of the animation.
 */
export const EASE_SQUISH = [0.34, 1.56, 0.64, 1] as const

export const DUR = { fast: 0.15, base: 0.22, slow: 0.32, page: 0.45 } as const

export const SPRING = { type: 'spring', stiffness: 350, damping: 25, mass: 0.6 } as const

/** Exit runs faster than enter: a leaving element must not delay the next screen. */
export const EXIT_FACTOR = 0.6

export const fadeRise = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
}

/**
 * Total reveal time is clamped rather than per-item delay being fixed: a
 * twelve-item grid at a flat 0.06s each takes 0.72s to finish, which reads as
 * the page struggling to load.
 */
export const staggerParent = (count: number) => ({
  hidden: {},
  shown: { transition: { staggerChildren: Math.min(0.04, 0.4 / Math.max(count, 1)) } },
})
```

Three wrappers in `src/components/motion/` consume it, and are the only place
components touch `whileInView` or variants directly:

- **`Reveal`** — fade-and-rise on `whileInView`, `once: true`,
  `margin: '-10%'`. For sections below the fold.
- **`Stagger`** — parent/child variants over a list or grid, delay clamped by
  `staggerParent`.
- **`CountUp`** — animates a figure to its value. The animating digits are
  `aria-hidden`, with the final value in an adjacent `sr-only` span, so a screen
  reader hears `1,204` rather than `7 … 340 … 1,204`. Keeps `tabular-nums` so
  the box does not resize as digits change.

## 6. Reduced motion, and the lever that protects the test suite

Today's reduced-motion handling is incomplete. The `@media
(prefers-reduced-motion: reduce)` block at `index.css:321` flattens CSS
transitions and animations, which is all it can reach. `framer-motion` animates
in JavaScript and is unaffected by it: `AppShell`'s page transition and
`Button`'s `whileTap` both still move for a user who has asked for stillness.
Only `FlashcardMode` handles it, via a local `useReducedMotion()` call.

One line fixes all of it, in `main.tsx` rather than `AppShell` — landing and auth
render outside the shell and animate too:

```tsx
<MotionConfig reducedMotion="user">
```

That makes `framer-motion` drop transform and layout animation while keeping
opacity, following the OS setting, everywhere. `FlashcardMode`'s local check
becomes redundant and is removed. The CSS block stays for non-`framer`
transitions.

### The test lever

`src/test/setup.ts:20` stubs `matchMedia` to return `matches: false` for every
query. Changing it to match the reduced-motion query only:

```ts
matches: query.includes('prefers-reduced-motion'),
```

makes every animation resolve instantly under jsdom, because `MotionConfig` is
reading that query. This matters more than it looks. jsdom does not advance
`requestAnimationFrame` the way a browser does, so without this a `CountUp` stat
card sits at `0` and `getByText('12')` fails — a purely visual feature breaking a
behavioural test. `prefers-color-scheme: dark` still returns false, so `useTheme`
and the existing dark-mode assertion behave exactly as they do now.

`setup.ts` also gains an `IntersectionObserver` stub reporting immediate
intersection, so `whileInView` content is present for existing queries. jsdom
ships no `IntersectionObserver` at all; without the stub, `Reveal` throws from
inside an effect and React unmounts the tree — the same failure mode the file's
existing `scrollIntoView` and `matchMedia` stubs were added for.

**`src/test/setup.ts` is the only test-directory file this phase may change.** No
assertion in any `*.test.tsx` may be edited. A broken assertion means the
component changed behaviour; fix the component.

## 7. Primitive changes

### Cascade: what the variant strings must give up

The clay classes live in `@layer components`, and Tailwind utilities sit in a
later layer, so a utility always wins over a clay declaration for the same
property. This is not a footnote — it decides whether the tier applies at all:

- `Card`'s `tones.default` is `'bg-surface shadow-soft'`. The `shadow-soft`
  utility would override `.clay-card`'s entire `box-shadow` stack, silently
  producing a flat card with a clay radius. Every tone must drop its
  `shadow-*` utility whenever elevation is not `flat`.
- `Button`'s `variants.default` is `'bg-primary … shadow-soft hover:brightness-110'`.
  Both the background and the shadow must go when `.clay-btn-primary` applies —
  the gradient _is_ the background.
- The inverse is useful for `outline` and `soft`: `.clay-pill` sets
  `background-color: hsl(var(--surface))`, and a variant keeping its own
  `bg-surface/70` or `bg-surface-muted` utility overrides it by cascade. So those
  two variants take `.clay-pill` for its shadow and radius while keeping their
  own fill, with no extra work.

Anywhere the two systems would set the same property, the clay class owns it and
the utility is removed.

### `ui/card.tsx`

One new prop:

```ts
elevation?: 'flat' | 'clay' | 'raised'   // default 'clay'
```

Defaulting to `clay` is what makes most screens need no edit at all — they
already consume `<Card>`. Dense-data cards opt down explicitly with
`elevation="flat"`.

`tone="dashed"` forces `flat` regardless of the prop. A dashed outline marks a
slot where something is _missing_; a puffy empty state reads as filled, which is
the opposite of the message. `interactive` maps to `.clay-card-interactive`,
unchanged in meaning.

### `ui/button.tsx`

The clay recipe is applied inside `buttonClass()`, not inside the `Button`
component. Several screens render `<Link className={buttonClass(...)}>` — a
navigating action must be an `<a>` — and applying clay only in the component
would leave every one of those flat.

| variant           | recipe                              |
| ----------------- | ----------------------------------- |
| `default`         | `.clay-btn-primary`                 |
| `accent`          | `.clay-btn-accent`                  |
| `danger`          | `.clay-btn-danger` (new, see §4)    |
| `outline`, `soft` | `.clay-pill`                        |
| `ghost`           | unchanged — chrome should not bulge |

`whileTap` moves from `{ scale: 0.96 }` on a 0.1s tween to `SPRING`. Sizes and
the 44px floor are untouched.

### `ui/segmented.tsx`

The track becomes `.clay-inset`, so the unselected options read as recessed. The
selected thumb becomes `.clay-pill` carrying `layoutId="segment-thumb"`, so it
slides between options on `SPRING` instead of popping. The roving-tabindex
keyboard handling and `role="radio"` semantics are untouched.

### `ui/dialog.tsx`

Panel gets `.clay-raised` and enters at `scale: 0.96 → 1` on `SPRING`, backdrop
fades.

**No exit animation.** Wrapping the panel in `AnimatePresence` keeps it mounted
after close, and several tests assert the dialog is gone immediately after the
closing click. Enter-only costs nothing visually and keeps those assertions
valid. The focus trap, restore-focus and Escape handling are untouched.

### The rest

| File                 | Change                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `ui/input.tsx`       | `.clay-inset`; keeps `text-base` (mobile Safari zoom rule)          |
| `ui/badge.tsx`       | count and chip tones onto `.clay-pill`; state tones keep their text |
| `ui/icon-button.tsx` | `.clay-pill` plus the shared squish                                 |
| `ui/skeleton.tsx`    | shimmer kept; radius matched to clay so nothing shifts on load      |

## 8. Per-screen choreography

Clay tier is inherited from the primitives; only motion is listed.

| Screen                                | Motion                                                                                                                                                        | Constraint                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DashboardPage`                       | `CountUp` on the due and new figures; `Stagger` on the set list (`:411`)                                                                                      | The `tone="dashed"` empty states (`:310`, `:332`, `:350`) stay flat and static — animating one reads as content arriving            |
| `SetsPage`                            | grid `Stagger` (`:475`); `AnimatePresence` on filter and sort reflow; hover lift                                                                              | The loading skeleton (`:399`) must keep clay's radius or the list jumps when data lands                                             |
| `SetDetailPage`                       | card list `Stagger`; `AnimatePresence` on add and delete                                                                                                      |                                                                                                                                     |
| `StudySessionPage`                    | `FeedbackPanel` slides and fades on `SPRING`; `BlankSlot` (already `motion.span` at `:65`) gains a fill pop                                                   | The native `<progress>` at `:417` stays native and unanimated — `value` is not transitionable and the element is announced natively |
| `FlashcardMode`                       | existing flip, moved onto the shared tokens                                                                                                                   | local `useReducedMotion()` removed, now redundant                                                                                   |
| `SearchPage`, `CommandPalette`        | results `Stagger` as they land; palette enters as `.clay-raised`                                                                                              | combobox ARIA byte-identical                                                                                                        |
| `ProgressPage`, `components/charts/*` | `TrendChart` and `Sparkline` draw on via `pathLength`; `BarChart` bars grow from the baseline; `GoalRing` sweeps `stroke-dashoffset`; `Heatmap` cells stagger | all `once`, all `EASE`, never `EASE_SQUISH`; the accessible data tables from ADR 0002 are untouched                                 |
| `SettingsPage`, `AccountPage`         | grouped clay cards, `Reveal` per section                                                                                                                      | the delete zone stays `tone="danger"` and flat                                                                                      |
| `AdminDashboardPage`                  | `CountUp` on stat tiles                                                                                                                                       | table rows flat                                                                                                                     |
| All dialogs                           | inherit `Dialog`'s enter spring                                                                                                                               | zero per-file edits                                                                                                                 |

### The cross-route morph, isolated on purpose

Morphing a set card into `SetDetailPage` with `layoutId` requires
`AnimatePresence mode="wait"` in `AppShell`, which delays the incoming route's
mount. Tests that navigate and then assert on detail content could turn
timing-dependent. Within-route `layoutId` — the nav disc, the segmented thumb,
filter pills, list reflow — carries none of that risk.

So within-route lands first, and the cross-route morph is a separate final phase
with its own verification. It is the one piece of this design that can be cut
without touching anything else.

## 9. Constraints this redesign may not break

Each is already asserted somewhere, or is a `CLAUDE.md` requirement. The
redesign is wrong if it trades any of them for looks.

1. **4.5:1 on body text, 3:1 on UI boundaries, in both themes.** Clay lightens
   the top-left of every surface with an inset highlight, so text near a card's
   top edge is where this breaks first. The style database rates claymorphism's
   dark-mode support "partial" for exactly this reason.
2. **Never colour alone.** Correct/incorrect, due/overdue and archived states
   keep their icon or text.
3. **44×44px minimum touch targets.** Clay's inset shadow visually eats a couple
   of pixels; do not compensate by shrinking the box.
4. **Visible focus ring on everything focusable.** The ring is an `outline` with
   an offset against `--background`, so it survives `.clay-inset` — but the
   recessed segmented track is the case to verify by hand.
5. **Accessible names unchanged.** `CountUp` is the trap: animating digits are
   `aria-hidden`, the final value lives in an `sr-only` span.
6. **No layout shift on load.** Skeletons match clay's radius and the height of
   what replaces them.
7. **320px still works.** The rail collapses to a bottom bar; it does not
   disappear.
8. **Animate `opacity` and `transform` only.** Never `width`, `height` or
   `box-shadow` in JavaScript. Clay's hover shadow swap is the one exception and
   stays a CSS `:hover` rule, where the compositor can handle it.
9. **One motion idea per screen region.** Scroll-reveal a section or stagger its
   children — not both on the same element.

## 10. Phases

Bottom-up. Each phase leaves the app shippable; none depends on a later one to
look right.

| #       | Phase                            | Files                                                                                   | Done when                                                                                                                                                  |
| ------- | -------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C0**  | Clay tiers, dark button fix      | `src/index.css`                                                                         | `.clay-raised` and `.clay-inset` exist; deep tokens defined per theme; landing and auth clay buttons pass contrast in dark mode, with zero component edits |
| **C1**  | Motion foundation                | `lib/motion.ts`, `components/motion/*`, `main.tsx`, `test/setup.ts`                     | `MotionConfig` live app-wide; jsdom resolves animation instantly; suite green with no assertion edited                                                     |
| **C2**  | Primitives                       | `ui/card`, `button`, `dialog`, `input`, `badge`, `segmented`, `icon-button`, `skeleton` | Clay inherited across the app before a single screen is touched                                                                                            |
| **C3**  | Shell                            | `components/layout/AppShell.tsx`                                                        | Nav disc slides between destinations; inline motion literals replaced by tokens                                                                            |
| **C4**  | Landing and auth token swap      | `LandingPage`, `AuthLayout`, `LoginPage`, `RegisterPage`                                | Visually identical; the repeated ease array is gone                                                                                                        |
| **C5**  | Dashboard, sets, set detail      | `features/dashboard/*`, `features/cards/SetsPage`, `SetDetailPage`                      | Count-up and stagger in place; dashed empty states still flat and static                                                                                   |
| **C6**  | Study flow                       | `features/study/*`                                                                      | Feedback spring, blank fill pop, flip on shared tokens; native `<progress>` untouched                                                                      |
| **C7**  | Charts and progress              | `components/charts/*`, `features/dashboard/ProgressPage.tsx`                            | Marks draw on with no overshoot; accessible tables unchanged                                                                                               |
| **C8**  | Search, settings, account, admin | `features/search/*`, `features/account/*`, `features/admin/*`                           | Palette raised; settings as grouped clay cards; delete zone still flat danger                                                                              |
| **C9**  | Optional: cross-route morph      | `AppShell`, `SetsPage`, `SetDetailPage`                                                 | Set card morphs into its detail page; cuttable without affecting C0–C8                                                                                     |
| **C10** | Gate                             | —                                                                                       | prettier, `tsc -b`, eslint clean; **whole suite green, zero assertions edited**                                                                            |

## 11. Verifying it

From `frontend/`, in this order — the first three are cheap and catch most of it:

```bash
npx prettier --write src
npx tsc -b --force --pretty
npx eslint src
npx vitest run
```

The pass condition for C10 is a green suite with no `*.test.tsx` modified. The
only permitted test-directory diff is `src/test/setup.ts`, per §6.

Then by eye, because none of the above can see a colour or a movement:

- **Dark mode on every screen.** Clay's inset highlight and the deep-gradient
  buttons are what break first. Check text sitting near a card's top edge.
- **320px.** Rail became a bottom bar, nothing fell under 44px, no horizontal
  scroll.
- **Tab through dashboard, a set, a study card.** Every stop shows a visible
  ring — including on the recessed segmented track and the inset inputs.
- **Turn on the OS reduced-motion setting and repeat.** Every screen must render
  fully with nothing moving, and no figure stuck at zero.
- **Answer one blank wrong.** Feedback still legible with colour ignored
  entirely.

## 12. Deliberately not doing

- **No GSAP.** `framer-motion` v13 is already installed and covers every pattern
  in §8. A second animation runtime for the same capability is pure cost.
- **No new dependency of any kind**, and no component library — Radix or shadcn
  would arrive with its own token contract and rewrite files this phase only
  re-skins.
- **No webfont change.** Inter stays.
- **No feature invention.** No control that does not already exist.
- **No landing or auth restyle.** They are the reference; §2.
- **No test rewrites.** §6, §11.
- **No backend or shared changes.** Nothing crosses `frontend/`.

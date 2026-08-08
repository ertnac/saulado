# UI Redesign — Soft Surfaces, Pale Green

> The visual language the app is moving to, why each choice was made, and the
> order the work happens in.
>
> **Reference:** the Dribbble "flowtask" dashboard shot supplied with the brief.
> **Theme:** pale green, with a warm complementary palette.
> **Scope:** presentation only. No route, contract, query or behaviour changes.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [What we take from the reference — and what we don't](#2-what-we-take-from-the-reference--and-what-we-dont)
3. [The palette](#3-the-palette)
4. [The rest of the language](#4-the-rest-of-the-language)
5. [Constraints this redesign may not break](#5-constraints-this-redesign-may-not-break)
6. [The sub-phases](#6-the-sub-phases)
7. [Verifying it](#7-verifying-it)
8. [Deliberately not doing](#8-deliberately-not-doing)

---

## 1. What this is

Saulado currently wears the default shadcn-ish shell it was scaffolded with:
white background, slate-blue near-black text, 0.6rem corners, hairline borders,
a top nav bar. It is clean and it is anonymous — nothing about it says _study
app_, and nothing about it says _this one_.

This phase gives it a face. The target is the soft, rounded, gradient-washed
style of the reference shot, retuned from that shot's coral-on-lavender to a
**pale green** base with warm complements.

**It is a re-skin, not a rewrite.** Every page keeps its current structure,
copy, routes, ARIA and data flow. The 303 frontend tests are the proof: not one
of them asserts on a class name (the only style assertion in the suite is
`documentElement` carrying `dark`), so if the redesign is genuinely
presentational the suite stays green without edits. **A test that needs
changing is a signal that something behavioural moved** — stop and check rather
than editing the test.

---

## 2. What we take from the reference — and what we don't

**Taken:**

| Trait                  | What it means here                                                     |
| ---------------------- | ---------------------------------------------------------------------- |
| Ambient gradient wash  | The page background is a soft two-point radial wash, not flat white    |
| Big radii              | Cards at 16px, controls fully pill-shaped                              |
| Borderless surfaces    | Panels separate by tint and soft shadow, not by 1px hairlines          |
| Left icon rail         | Persistent circular-icon nav, active item as a filled accent disc      |
| Pill everything        | Buttons, chips, badges, filters, the search field                      |
| Segmented controls     | Board/List/Timeline becomes our range and filter switchers             |
| Count badges           | A small tinted pill carrying a number next to a section title          |
| Quiet table headers    | Column labels small, muted, no rules; rows separated by space          |
| One dark, dominant CTA | The single filled action per screen, everything else outlined or ghost |

**Not taken:**

- **Its colours.** Coral/lavender go; see §3.
- **Its density.** The shot is a task table. Our densest screen is a study card
  that needs to be read, so line length and leading stay generous.
- **Its low-contrast text.** Several labels in the shot sit near 3:1. Ours are
  bound by §5 and cannot.
- **Its avatar stack, timers and assignee columns.** No feature invention: this
  phase adds no controls that do not already exist.

---

## 3. The palette

Pale green is the _ambience_ — surfaces, washes, tints. It is not the button
colour: a pale fill cannot carry white text, and a green dark enough to carry it
is not pale. So the system is **pale green surfaces, deep green actions, clay
accent**, which is the pairing sage has always had in print.

### Light

| Token                  | HSL           | Role                                          |
| ---------------------- | ------------- | --------------------------------------------- |
| `--background`         | `150 30% 97%` | Page base under the wash                      |
| `--surface`            | `0 0% 100%`   | Cards, panels, popovers                       |
| `--surface-muted`      | `150 28% 95%` | Nested wells, table zebra, disabled fills     |
| `--foreground`         | `162 30% 12%` | Body ink — deep forest, never pure black      |
| `--muted-foreground`   | `160 12% 38%` | Secondary text, column labels                 |
| `--primary`            | `158 42% 24%` | Filled CTA, active nav disc                   |
| `--primary-foreground` | `150 40% 97%` | Text on primary                               |
| `--accent`             | `14 72% 58%`  | Clay. Chips, counts, the "one hot thing"      |
| `--accent-foreground`  | `20 60% 99%`  | Text on accent fills                          |
| `--accent-strong`      | `14 62% 42%`  | Accent as _text_ — the AA-safe variant        |
| `--sand`               | `40 62% 90%`  | Second complement: warm neutral chips         |
| `--info`               | `196 42% 40%` | Neutral informational cues                    |
| `--border`             | `152 20% 88%` | Hairlines where one is still needed           |
| `--ring`               | `158 42% 34%` | Focus ring                                    |
| `--success`            | `142 58% 30%` | Correct answers                               |
| `--warning`            | `32 85% 36%`  | Rejected selections, invalid input            |
| `--danger`             | `358 60% 44%` | Destructive only (delete account, delete set) |

### Dark

Not the light theme dimmed — the relationship inverts. Pale green stops being
the surface and becomes the _bright_ element, over a deep forest-charcoal.

| Token                  | HSL           | Note                                   |
| ---------------------- | ------------- | -------------------------------------- |
| `--background`         | `166 24% 7%`  | Near-black with a green cast, not blue |
| `--surface`            | `166 20% 11%` | Cards lift by lightness, not by border |
| `--surface-muted`      | `166 16% 15%` |                                        |
| `--foreground`         | `150 18% 94%` |                                        |
| `--muted-foreground`   | `150 10% 68%` | Lightened to hold 4.5:1 on `--surface` |
| `--primary`            | `152 46% 62%` | The pale green, now doing the shouting |
| `--primary-foreground` | `166 40% 9%`  | Dark text on a light button            |
| `--accent`             | `14 78% 64%`  |                                        |
| `--accent-foreground`  | `18 50% 10%`  |                                        |
| `--accent-strong`      | `14 78% 70%`  | Text-safe direction is _lighter_ here  |
| `--sand`               | `40 25% 22%`  |                                        |
| `--danger`             | `358 70% 68%` |                                        |

`--highlight` keeps its Phase-1 semantics unchanged in both themes: a light
yellow swatch with dark text, because "marked with a pen" is a cue the colour
itself is carrying and a tinted-green highlight would read as a correct answer.

### The wash

Two radial gradients over `--background`, pale green from the top-left and sand
from the top-right, both fading out by 60%. Fixed to the viewport so it does not
slide under a scrolling page, and expressed as a token so dark mode can swap it
for a much fainter pair rather than glowing.

---

## 4. The rest of the language

### Radius

`--radius: 1rem`. Cards 16px, nested wells 12px, chips and buttons fully
pill-shaped (`rounded-full`). The one exception is multi-line text inputs, which
stay at 12px — a pill-shaped textarea puts its first and last characters inside
the curve.

### Elevation

Soft, tinted, and never grey. Grey shadows on a green wash read as dirt.

```
--shadow-soft:  0 1px 2px   hsl(162 30% 12% / 0.04),
                0 10px 30px -12px hsl(162 30% 12% / 0.12)
--shadow-lift:  0 2px 4px   hsl(162 30% 12% / 0.05),
                0 20px 45px -18px hsl(162 30% 12% / 0.20)
```

`lift` is for things that float above the page — dialogs, the palette, popovers.
Everything else uses `soft` or nothing. In dark mode both drop to roughly a
third of their opacity, because a shadow on a near-black background is invisible
and only serves to muddy the edge.

### Typography

The system stack stays — no webfont, no new dependency, no FOUT on a study
screen. What changes is the scale and the weight discipline:

- Page title: `text-2xl font-semibold tracking-tight`
- Section title: `text-sm font-medium` — **no more uppercase tracking-wide**.
  The reference's section labels are sentence case, and small uppercase text is
  measurably harder to read for dyslexic users.
- Body: `text-base leading-relaxed` on anything paragraph-shaped
- Numbers: `tabular-nums` everywhere a figure can change in place

### Motion

`transition-colors` and `transition-transform` at 150ms on interactive
surfaces; nothing animates on load, nothing moves more than 2px. The existing
`prefers-reduced-motion` block in `index.css` already flattens all of it and
stays.

### New primitives

| Component          | File                               | Why it exists                                    |
| ------------------ | ---------------------------------- | ------------------------------------------------ |
| `Card`             | `components/ui/card.tsx`           | The rounded surface, repeated on every screen    |
| `Badge`            | `components/ui/badge.tsx`          | Count pills and tag chips, tone-variant driven   |
| `SegmentedControl` | `components/ui/segmented.tsx`      | Range/filter switching, radiogroup semantics     |
| `IconButton`       | `components/ui/icon-button.tsx`    | Circular icon-only control with a required label |
| `icons.tsx`        | `components/ui/icons.tsx`          | Inline SVG line icons, replacing the text glyphs |
| `PageHeader`       | `components/layout/PageHeader.tsx` | Title + description + actions, currently retyped |

The icons matter more than they look. Today the shell renders `⌕`, `☀`, `☾` and
`⚙` as literal characters: they inherit the text font, so they render
differently on every platform, they cannot be stroked to match, and on Windows
several fall back to a glyph from an unrelated font. Inline SVG at
`stroke-width: 1.5` fixes all three and adds no bytes over the wire.

---

## 5. Constraints this redesign may not break

These are not preferences. Each one is already asserted somewhere, or is a
`CLAUDE.md` requirement, and the redesign is wrong if it trades any of them for
looks.

1. **4.5:1 on all body text, 3:1 on UI boundaries, in both themes.** The
   reference violates this repeatedly; we do not get to copy that part.
2. **Never colour alone.** Correct/incorrect, due/overdue and archived states
   keep their icon or text. A green-tinted design makes this _easier_ to get
   wrong, not harder — "it's green, so it's right" is precisely the trap.
3. **44×44px minimum touch targets.** The circular rail buttons and pill chips
   are the risk: a 32px disc looks better and fails this.
4. **Visible focus ring on everything focusable**, now `--ring` with a 2px
   offset against the surface it sits on — a ring the same colour as the pale
   surface behind it is not a ring.
5. **Accessible names unchanged.** Every test queries by role and name. Turning
   a labelled button into an icon without `aria-label` breaks both the suite and
   a screen reader, in that order of discovery and reverse order of importance.
6. **No layout shift on load.** Skeletons keep matching the height of what
   replaces them.
7. **320px still works.** The rail collapses to a bottom bar below `sm`; it does
   not simply disappear.

---

## 6. The sub-phases

Bottom-up: tokens, then primitives, then the shell, then screens. Each step
leaves the app in a working, shippable state — no phase depends on a later one
to look right.

| #      | Sub-phase               | Files                                                                                                                | Done when                                                                      |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **U0** | Tokens & Tailwind theme | `src/index.css`, `tailwind.config.ts`                                                                                | Both themes render in the new palette with zero component edits                |
| **U1** | Primitives              | `components/ui/*` — button, input, card, badge, segmented, icon-button, icons, skeleton, dialog, toaster, form-field | Every primitive is pill/soft-surface and tone-driven                           |
| **U2** | App shell               | `components/layout/AppShell.tsx`, new `PageHeader.tsx`                                                               | Icon rail on desktop, bottom bar at 320px, skip link and palette intact        |
| **U3** | Dashboard               | `features/dashboard/DashboardPage.tsx`, `StreakCard.tsx`                                                             | One dominant CTA preserved; never-studied state still shows nothing secondary  |
| **U4** | Sets, detail, editor    | `features/cards/*`                                                                                                   | Set cards, tag chips, the highlight surface and the cloze preview all restyled |
| **U5** | Study flow              | `features/study/*`                                                                                                   | Blanks, feedback and the summary restyled; feedback still icon + text          |
| **U6** | Progress & charts       | `features/dashboard/ProgressPage.tsx`, `components/charts/*`                                                         | Charts on the new ramp, lightness-based, accessible tables untouched           |
| **U7** | Search & palette        | `features/search/*`                                                                                                  | Filters as pills, palette as a floating panel, combobox ARIA byte-identical    |
| **U8** | Settings, account, auth | `features/account/*`, `features/auth/*`                                                                              | Settings as grouped cards; delete zone on `--danger`; auth pages on the wash   |
| **U9** | Gate                    | —                                                                                                                    | Prettier, `tsc`, eslint clean; **303/303 tests still green, none edited**      |

---

## 7. Verifying it

Run from `frontend/`, in this order — the first two are cheap and catch most of
it:

```bash
npx prettier --write src
npx tsc -b --force --pretty
npx eslint src
npx vitest run
```

**The pass condition for U9 is 303 passing tests with no test file modified.**
If a test breaks, the redesign changed behaviour; fix the component, not the
assertion.

Then by eye, because none of the above can see a colour:

- Toggle dark mode on every screen. The wash, the shadows and
  `--muted-foreground` are the three that break first.
- Narrow to 320px. Check the rail became a bottom bar and no control fell under
  44px.
- Tab through the dashboard, a set and a study card. Every stop must show a
  visible ring against whatever surface it lands on.
- Answer one blank wrong. The feedback must still be legible with colour
  ignored entirely.

---

## 8. Deliberately not doing

- **No component library.** Radix/shadcn would arrive with its own token
  contract and rewrite files this phase is only meant to re-skin.
- **No webfont.** Discussed under §4; revisit only if the system stack is
  genuinely the thing holding the design back.
- **No new features.** No avatar stack, no notification centre, no drag
  ordering, however much the reference implies them.
- **No test rewrites.** See §7.
- **No backend or shared changes.** Nothing in this phase crosses `frontend/`.

# ADR 0002 — Progress charts: hand-rolled primitives vs a charting library

- **Status:** Accepted
- **Date:** 2026-08-08
- **Phase:** 5.2
- **Deciders:** Saulado Dev

## 1. Context

Phase 5.2 adds four visualisations: a reviews-per-day bar chart, an accuracy
trend line, a per-set table, and a contribution heatmap. The plan names
"Recharts or `visx`" as the expected route, and also sets three constraints that
turn out to do most of the deciding:

> Respect `prefers-reduced-motion`, meet contrast in both themes, and never
> encode meaning in colour alone.

Those are not styling preferences. They are the reason this decision is not
simply "install the popular one".

The fourth constraint is the JS budget: **180 KB gzip**, of which the production
build currently spends 58 KB (ADR 0001 §4).

## 2. What the charts actually are

Worth stating plainly, because it is the crux:

| Chart          | Geometry required                                         |
| -------------- | --------------------------------------------------------- |
| Reviews/day    | N rectangles, heights proportional to a value             |
| Accuracy trend | A polyline through N points, with gaps where data is null |
| Heatmap        | A grid of squares, fill from a 5-step scale               |
| Per-set        | A `<table>`. Not a chart at all.                          |
| Sparkline      | 7 rectangles                                              |

There are no axes with computed tick placement, no stacked series, no brushing,
no zoom, no polar coordinates, no time-scale interpolation. The hard parts of a
charting library — scales, layout, interaction, animation — are hard because of
requirements this feature does not have.

## 3. Options

### Option A — Hand-rolled primitives (CSS grid + flexbox + one SVG)

Bar chart and heatmap as HTML elements; the trend line as a single SVG
`polyline`. Roughly 300 lines across four components.

- **Bundle cost:** 0 KB.
- **Fit:** exact. The geometry above is the whole job.
- **Accessibility:** ours to get right, and ours to get right _once_ — every
  chart is wrapped in a `<figure>` whose visual half is `aria-hidden` and whose
  other half is a real `<table>` of the same numbers.
- **Loses:** tooltips-on-hover for free, and anything a fifth chart type might
  need later.

### Option B — Recharts

- **Bundle cost:** ~450 KB min (~110 KB gzip) including its D3 dependencies —
  roughly double the app's entire current JS, for four charts.
- **Fit:** partial. **Recharts has no heatmap.** The contribution grid is
  hand-rolled either way, so the library covers three of the four and the fourth
  still needs the code Option A would have written anyway.
- **Accessibility:** Recharts renders SVG with its own DOM structure. Making it
  screen-reader-legible means either accepting its defaults or fighting them;
  the sr-only-table approach is needed regardless, at which point the library is
  supplying pixels we then have to describe ourselves.
- **`prefers-reduced-motion`:** Recharts animates by default. Suppressing it is
  `isAnimationActive={false}` per series plus a media query — doable, but it is
  a default working against the requirement rather than with it.
- **Colour-alone:** its defaults encode series identity purely by colour.

### Option C — `visx`

Modular, so the bundle cost is only what you import, and lower-level than
Recharts — closer to "helpers for SVG" than "charts".

- **Bundle cost:** ~15–30 KB gzip for the scale + shape packages actually needed.
- **Fit:** good, but the thing it supplies is `scaleLinear`, and the scale here
  is `value / max * 100`.
- **Loses:** a dependency, its peer-dependency surface, and its upgrade cadence,
  in exchange for arithmetic that fits on one line.

## 4. Decision

**Option A.**

The deciding argument is not bundle size, though 110 KB gzip against a 180 KB
budget for four charts would be reason enough on its own. It is that **the
accessibility work is the majority of the work, and no library does it for us.**

Every one of the plan's three constraints is satisfied at the point where data
becomes DOM:

- _Never encode meaning in colour alone_ — each chart ships a real table of the
  same numbers, and each heatmap cell carries its count in a `<title>`.
- _Meet contrast in both themes_ — the charts use the existing `--foreground` /
  `--muted` / `--success` tokens, which were already tuned per theme in
  `index.css`. A library brings its own palette that we would have to override
  twice.
- _Respect `prefers-reduced-motion`_ — there is nothing to suppress, because
  nothing animates. The global media query in `index.css` already covers the one
  CSS transition used on hover.

Adding a dependency and then doing all three anyway is the worst of both.

This is the same reasoning as ADR 0001, and deliberately so: reject the
framework when the model it imposes is bigger than the problem, and keep the
budget for the study path.

## 5. Consequences

- Four components in `frontend/src/components/charts/`, no new dependencies.
- `ChartFigure` is the single accessibility contract: a `<figure>`, a caption,
  an `aria-hidden` visual, and an `sr-only` `<table>`. Every chart uses it, so
  "is this chart accessible" is answered once rather than four times.
- **No hover tooltips on the bar and trend charts.** Hover is not available on
  touch and is not available to keyboard users, so a tooltip would be a
  third-class channel for data the table already carries. Values live in the
  table and in the `<title>` on each heatmap cell.
- Bars and heatmap cells are HTML, not SVG. Percentage heights inside a flex row
  are responsive with no `viewBox` arithmetic and no resize observer, and text
  in the surrounding layout renders at its natural size instead of being scaled
  by the SVG transform.
- The trend line _is_ SVG, because a polyline through N points is genuinely
  geometry. It uses `preserveAspectRatio="none"` with
  `vectorEffect="non-scaling-stroke"` so it stretches to any width without the
  stroke thickening.
- If a fifth chart type arrives that needs real scales — a distribution, a
  stacked series, anything with computed ticks — revisit this. The pivot is
  cheap: the charts take plain arrays and are used in two places.

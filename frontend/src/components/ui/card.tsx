import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The rounded surface every screen is built out of.
 *
 * Borderless by default — panels separate from the page by tint and a soft
 * shadow rather than by a 1px hairline, which is what stops a screen full of
 * cards reading as a spreadsheet. The border comes back only for `dashed`,
 * where the outline is doing semantic work: it marks a slot where something is
 * *missing* (an empty state, a not-yet-created thing) rather than a panel that
 * holds content.
 *
 * Clay depth arrives here rather than at the call sites. Hand-writing
 * `clay-card p-6` into thirty-four files pays for the same look thirty-four
 * times, guarantees drift, and leaves the next new screen starting flat.
 */

type Tone = 'default' | 'muted' | 'dashed' | 'accent' | 'danger'
type Elevation = 'flat' | 'clay' | 'raised'

interface CardProps extends HTMLAttributes<HTMLElement> {
  tone?: Tone
  /**
   * How far off the page this surface sits.
   *
   * `clay` by default, which is what makes most screens need no edit at all.
   * Dense data opts down explicitly: a puffy row per table line destroys the
   * scannability a set list and a progress table depend on, and heavy depth on
   * informational UI reads as sloppy rather than as tactile. `raised` is for
   * something floating over the page — a dialog, the palette.
   */
  elevation?: Elevation
  /** Adds hover lift. Only for cards that are themselves a link or button. */
  interactive?: boolean
  /**
   * The element to render. A card inside a `<ul>` has to be an `<li>` — a `<div>`
   * between a list and its items makes the list announce as empty.
   */
  as?: 'div' | 'li' | 'section' | 'article' | 'button'
}

/**
 * Fill only — no shadow and no radius.
 *
 * Both of those belong to the elevation, and a `shadow-*` utility here would
 * win: the clay classes live in `@layer components` and Tailwind utilities sit in
 * a later layer, so a leftover `shadow-soft` would override the whole clay
 * `box-shadow` stack and silently produce a flat card with a clay radius.
 *
 * The tint utilities are the useful half of that same cascade rule. `.clay-card`
 * sets `background-color: hsl(var(--surface))`, so `accent` and `muted` keep
 * their own fill and take only the depth.
 */
const tones: Record<Tone, { fill: string; flatShadow: boolean }> = {
  default: { fill: 'bg-surface', flatShadow: true },
  muted: { fill: 'bg-surface-muted', flatShadow: false },
  dashed: { fill: 'border border-dashed border-border bg-surface/50', flatShadow: false },
  // A tinted wash rather than a solid accent fill: a full-strength clay panel
  // would compete with the one CTA it is usually sitting next to.
  accent: { fill: 'bg-accent/10', flatShadow: true },
  danger: { fill: 'border border-danger/30 bg-danger/5', flatShadow: false },
}

/**
 * Two tones refuse depth whatever the caller asks for, because in both cases
 * depth contradicts what the tone is saying.
 *
 * A dashed outline marks a slot where something is missing; a puffy empty state
 * reads as filled. `danger` is either an alert or a delete zone — never a
 * content panel — and a raised warning reads as a thing to pick up rather than a
 * thing to be careful about.
 */
const FORCED_FLAT: Tone[] = ['dashed', 'danger']

export function Card({
  className,
  tone = 'default',
  elevation = 'clay',
  interactive = false,
  as: Component = 'div',
  ...props
}: CardProps): ReactElement {
  const { fill, flatShadow } = tones[tone]
  const level: Elevation = FORCED_FLAT.includes(tone) ? 'flat' : elevation

  return (
    <Component
      className={cn(
        fill,
        // The clay tier owns its radius (1.5rem), so `rounded-lg` is emitted only
        // when there is no clay class to conflict with. Without this the
        // nested-well relationship breaks: a well inside a card is supposed to be
        // visibly tighter than its parent, not concentric with it.
        level === 'flat' && 'rounded-lg',
        level === 'flat' && flatShadow && 'shadow-soft',
        level === 'flat' && interactive && 'transition-shadow duration-150 hover:shadow-lift',
        // `.clay-card-interactive` already applies `.clay-card`, so only one of
        // the two is ever emitted.
        level === 'clay' && (interactive ? 'clay-card-interactive' : 'clay-card'),
        level === 'raised' && 'clay-raised',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The small muted label above a figure or a list.
 *
 * Sentence case, not uppercase-with-tracking. Small all-caps text is measurably
 * harder to read for dyslexic users, and the reference itself uses sentence
 * case throughout — the uppercase habit came from the scaffold, not the design.
 */
export function CardLabel({ children }: { children: ReactNode }): ReactElement {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>
}

/** A large figure, for the one number a card exists to show. */
export function CardFigure({ children }: { children: ReactNode }): ReactElement {
  return <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{children}</p>
}

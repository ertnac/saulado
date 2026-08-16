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
 */

type Tone = 'default' | 'muted' | 'dashed' | 'accent' | 'danger'

interface CardProps extends HTMLAttributes<HTMLElement> {
  tone?: Tone
  /** Adds hover lift. Only for cards that are themselves a link or button. */
  interactive?: boolean
  /**
   * The element to render. A card inside a `<ul>` has to be an `<li>` — a `<div>`
   * between a list and its items makes the list announce as empty.
   */
  as?: 'div' | 'li' | 'section' | 'article' | 'button'
}

const tones: Record<Tone, string> = {
  default: 'bg-surface shadow-soft',
  muted: 'bg-surface-muted',
  dashed: 'border border-dashed border-border bg-surface/50',
  // A tinted wash rather than a solid accent fill: a full-strength clay panel
  // would compete with the one CTA it is usually sitting next to.
  accent: 'bg-accent/10 shadow-soft',
  danger: 'border border-danger/30 bg-danger/5',
}

export function Card({
  className,
  tone = 'default',
  interactive = false,
  as: Component = 'div',
  ...props
}: CardProps): ReactElement {
  return (
    <Component
      className={cn(
        'rounded-lg',
        tones[tone],
        interactive && 'transition-shadow duration-150 hover:shadow-lift',
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

import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The count pill and the tag chip — one component, because they are the same
 * object at different tones and keeping them apart is how two spacing scales
 * end up in the app.
 *
 * `accent` is for a live count (cards due, results found): the reference puts
 * exactly one hot pill per group and this is it. `sand` is the warm neutral for
 * tags, `muted` for inert metadata, and `success`/`warning`/`danger` for state.
 *
 * State tones deliberately carry text, never colour alone — a bare coloured dot
 * is invisible to a screen reader and ambiguous to everyone else.
 *
 * The count and chip tones take `.clay-pill` for its shadow and border while
 * keeping their own fill, which wins over the pill's `background-color` by
 * cascade. The state tones stay flat: their whole job is to be read, and a tinted
 * 12px label is already at the edge of legibility without an inner highlight
 * lightening the top of it.
 */

type Tone = 'muted' | 'accent' | 'sand' | 'success' | 'warning' | 'danger' | 'primary'

const tones: Record<Tone, string> = {
  muted: 'clay-pill bg-surface-muted text-muted-foreground',
  accent: 'clay-pill bg-accent text-accent-foreground',
  sand: 'clay-pill bg-sand text-sand-foreground',
  // Tint plus dark text rather than a solid fill: at these sizes a saturated
  // background under 4.5:1 text is the most common contrast failure there is.
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  primary: 'clay-pill bg-primary text-primary-foreground',
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  className?: string
}

export function Badge({ children, tone = 'muted', className }: BadgeProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

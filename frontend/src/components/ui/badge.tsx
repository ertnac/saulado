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
 */

type Tone = 'muted' | 'accent' | 'sand' | 'success' | 'warning' | 'danger' | 'primary'

const tones: Record<Tone, string> = {
  muted: 'bg-surface-muted text-muted-foreground',
  accent: 'bg-accent text-accent-foreground',
  sand: 'bg-sand text-sand-foreground',
  // Tint plus dark text rather than a solid fill: at these sizes a saturated
  // background under 4.5:1 text is the most common contrast failure there is.
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  primary: 'bg-primary text-primary-foreground',
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

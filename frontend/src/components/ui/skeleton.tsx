import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * Skeletons, not spinners.
 *
 * A spinner replaced by content causes a second layout shift; a skeleton shaped
 * like the thing it stands in for causes none (saulado-ux §5). Callers size
 * these to the real content deliberately.
 *
 * `prefers-reduced-motion` already disables the pulse globally in index.css.
 */
export function Skeleton({ className }: { className?: string }): ReactElement {
  return <div className={cn('animate-pulse rounded bg-muted', className)} aria-hidden="true" />
}

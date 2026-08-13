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
 *
 * Tinted rather than grey, and on the same radius step as the wells it stands
 * in for: a grey block on a green wash reads as a broken image, not as loading.
 */
export function Skeleton({ className }: { className?: string }): ReactElement {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(110deg,hsl(var(--surface-muted)),45%,hsl(var(--surface)),55%,hsl(var(--surface-muted)))] bg-[length:200%_100%]',
        className,
      )}
      aria-hidden="true"
    />
  )
}

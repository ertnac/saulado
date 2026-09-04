import { useEffect, type ReactElement } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { DUR, EASE } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * A figure that counts up to its value.
 *
 * Only for the one number a screen exists to show — cards due, cards studied, a
 * total. A count-up on incidental metadata is noise, and a screen where several
 * numbers are all racing at once has no focal point at all.
 *
 * The accessibility problem this component exists to solve: a screen reader
 * watching a live number read every intermediate value announces
 * "7 … 340 … 1,204" for a figure whose only meaningful value is the last one. So
 * the animating digits are `aria-hidden` and the final value sits in an adjacent
 * `sr-only` span, which is what is actually announced.
 */
export function CountUp({
  value,
  className,
  /**
   * Defaults to plain digits rather than a locale string. The figure it replaces
   * rendered the raw number, and a thousands separator appearing where there was
   * none is a content change dressed up as a visual one.
   */
  format = String,
  duration = DUR.page,
}: {
  value: number
  className?: string
  format?: (value: number) => string
  duration?: number
}): ReactElement {
  const reduced = useReducedMotion()
  const count = useMotionValue(0)
  const shown = useTransform(count, (current) => format(Math.round(current)))

  useEffect(() => {
    if (reduced) return
    // Re-runs when `value` changes, animating from wherever the last one landed
    // rather than restarting from zero — a refetch should not rewind the figure.
    const controls = animate(count, value, { duration, ease: EASE })
    return () => {
      controls.stop()
    }
  }, [count, value, duration, reduced])

  /**
   * One plain node when motion is off, not the hidden/`sr-only` pair.
   *
   * Two nodes carrying the same text is correct for a screen reader but makes the
   * figure match twice for anything querying by text, so the split only exists
   * while there is actually a discrepancy to hide. This is also the path jsdom
   * takes, which keeps the figure queryable by its value in tests.
   */
  if (reduced) {
    return <span className={cn('tabular-nums', className)}>{format(value)}</span>
  }

  return (
    <span className={cn('tabular-nums', className)}>
      <motion.span aria-hidden="true">{shown}</motion.span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}

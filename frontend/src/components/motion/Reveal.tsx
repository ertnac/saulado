import type { ReactElement, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { fadeRise } from '@/lib/motion'

/**
 * Fade-and-rise as a section scrolls into view.
 *
 * `once: true` — a section that re-animates every time it scrolls back past is
 * the single most irritating thing scroll-reveal can do, and it also means a
 * user scrolling up through a page they have already read watches it rebuild
 * itself.
 *
 * The `-10%` margin fires slightly before the element's edge reaches the
 * viewport, so the movement is finishing as the reader arrives rather than
 * starting once they are already looking at it.
 *
 * Reduced motion is handled globally by `MotionConfig` in `main.tsx`, which
 * drops the transform and keeps the fade — so there is no local check here.
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <motion.div
      className={className}
      variants={fadeRise}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '-10%' }}
    >
      {children}
    </motion.div>
  )
}

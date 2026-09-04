import type { ReactElement, ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'

type Tone = 'plain' | 'soft' | 'active'

/**
 * Motion's button props rather than the DOM ones, now that this renders a
 * `motion.button`: the two disagree about `onAnimationStart`, and spreading the
 * DOM shape onto a motion component is a type error rather than a subtlety.
 */
interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /**
   * The accessible name. Required rather than optional, because an icon-only
   * control with no label is announced as "button" and nothing else — and the
   * rail this component was built for is entirely icon-only.
   */
  label: string
  icon: ReactNode
  tone?: Tone
}

const tones: Record<Tone, string> = {
  // Flat, and deliberately so. This is chrome — the theme toggle, a dismiss —
  // and `.clay-pill` would give it a surface fill, turning a control that is
  // meant to sit quietly in the header into a third raised thing competing with
  // the two that are meant to be seen. Same reasoning as `Button`'s `ghost`.
  plain: 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
  soft: 'clay-pill bg-surface-muted text-foreground hover:bg-muted',
  // The filled disc marking the current item in the rail. Reads as selected by
  // shape and fill, not only by colour. `.clay-pill` replaces `shadow-soft`
  // rather than joining it: a utility shadow would override the whole clay stack.
  active: 'clay-pill bg-primary text-primary-foreground',
}

/**
 * A circular icon-only control — the rail item, the toolbar button, the dismiss.
 *
 * Fixed at 44×44 (`h-11 w-11`) whatever the icon inside it. Circular controls
 * are the easiest thing in a rounded design to shrink to a pretty 32px that
 * misses the touch-target minimum, so the size is not a prop. Clay's inset
 * shadow visually eats a couple of pixels off that; the box does not shrink to
 * compensate.
 *
 * `title` duplicates the label for a pointer tooltip. It does not affect the
 * accessible name — `aria-label` wins over `title` in the name computation, so
 * nothing is announced twice.
 */
export function IconButton({
  label,
  icon,
  tone = 'plain',
  className,
  type = 'button',
  ...props
}: IconButtonProps): ReactElement {
  return (
    <motion.button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg',
        'transition-[background-color,color,box-shadow] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        tones[tone],
        className,
      )}
      // The same press as `Button`, from the same spring. An icon control that
      // does not answer the press is the one place a user is most likely to think
      // the tap missed, since there is no label to watch.
      whileTap={{ scale: 0.94 }}
      transition={SPRING}
      {...props}
    >
      {icon}
    </motion.button>
  )
}

import type { ReactElement } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'accent' | 'outline' | 'soft' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant
  size?: Size
}

/**
 * Six variants, and the count is the point: every one of them answers a
 * question the screens actually ask.
 *
 * `default` is the single dominant CTA a screen is allowed (deep green, filled).
 * `accent` is the clay pill for the one hot control in a group — an active
 * filter, an add button. `soft` is a tinted fill for secondary actions that
 * still need to look like buttons; `outline` for ones that need to recede
 * further; `ghost` for icon-only chrome. `danger` exists so a destructive
 * action never has to borrow `--warning`, which the highlight editor already
 * spends on rejected selections.
 */
const variants: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground shadow-soft hover:brightness-110',
  accent: 'bg-accent text-accent-foreground shadow-soft hover:brightness-105',
  outline: 'border border-border bg-surface/70 hover:bg-surface',
  soft: 'bg-surface-muted text-foreground hover:bg-muted',
  ghost: 'bg-transparent hover:bg-surface-muted',
  danger: 'bg-danger text-primary-foreground shadow-soft hover:brightness-110',
}

/**
 * Sizes meet the 44px minimum touch target from the saulado-ux skill at md and
 * up. `icon` is square at the same 44px — the circular rail and toolbar buttons
 * are the easiest place in a rounded design to end up with a pretty 32px
 * control that fails the target.
 */
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-11 w-11 p-0',
}

/**
 * The button recipe, separate from the element.
 *
 * A link that navigates must be an `<a>` — rendering it as a `<button>` loses
 * middle-click, "open in new tab" and the status-bar URL preview, and screen
 * readers announce the wrong role. So the styling is a function anything can
 * apply, rather than something only `<button>` can have.
 */
export function buttonClass({
  variant = 'default',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return cn(
    // Fully pill-shaped, which is the reference's most recognisable habit and
    // the reason the rest of the radius scale can stay conservative.
    'inline-flex items-center justify-center gap-2 rounded-full font-medium',
    'transition-[background-color,box-shadow,filter,transform] duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps): ReactElement {
  return (
    <motion.button
      type={type}
      className={buttonClass({ variant, size, className })}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.1 }}
      {...props}
    />
  )
}

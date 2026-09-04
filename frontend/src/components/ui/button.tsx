import type { ReactElement } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { SPRING } from '@/lib/motion'
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
 *
 * The clay recipes replace utilities rather than joining them. Tailwind
 * utilities sit in a later layer than `@layer components`, so anywhere both
 * systems set the same property the utility wins — a leftover `bg-primary` would
 * paint over `.clay-btn-primary`'s gradient, and a leftover `shadow-soft` would
 * flatten its whole shadow stack. The gradient *is* the background, so both go.
 *
 * `outline` and `soft` are the inverse, and get it for free: `.clay-pill` sets
 * `background-color: hsl(var(--surface))`, so a variant keeping its own fill
 * overrides that and takes the pill for its shadow and border alone.
 */
const variants: Record<Variant, string> = {
  default: 'clay-btn-primary',
  accent: 'clay-btn-accent',
  outline: 'clay-pill border-border bg-surface/70 hover:bg-surface',
  soft: 'clay-pill bg-surface-muted text-foreground hover:bg-muted',
  // Unchanged: chrome should not bulge. A ghost button is a label that happens
  // to be pressable, and giving it a moulded fill makes it a third button
  // competing with the two that are meant to be seen.
  ghost: 'bg-transparent hover:bg-surface-muted',
  danger: 'clay-btn-danger',
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
 *
 * The clay recipe is applied here rather than inside `Button` for the same
 * reason: several screens render `<Link className={buttonClass(...)}>`, and
 * clay applied only in the component would leave every one of those flat.
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
      // A spring rather than a 0.1s tween: the press settles instead of
      // arriving, which is the difference between a button that feels moulded
      // and one that feels like it flickered.
      whileTap={{ scale: 0.96 }}
      transition={SPRING}
      {...props}
    />
  )
}

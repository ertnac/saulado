import type { ButtonHTMLAttributes, ReactElement } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border bg-transparent hover:bg-muted',
  ghost: 'bg-transparent hover:bg-muted',
}

/** Sizes meet the 44px minimum touch target from the saulado-ux skill at md and up. */
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
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
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
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
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />
}

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

/**
 * `h-11` is 44px — the minimum touch target from saulado-ux §7. Applies to every
 * input, not only the ones that look like buttons.
 *
 * `aria-invalid` drives the error styling rather than a separate prop, so the
 * visual state and the state announced to a screen reader cannot disagree.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base',
        'placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-[hsl(var(--warning))]',
        className,
      )}
      {...props}
    />
  )
})

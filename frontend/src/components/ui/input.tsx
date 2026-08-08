import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

/**
 * `h-11` is 44px — the minimum touch target from saulado-ux §7. Applies to every
 * input, not only the ones that look like buttons.
 *
 * `aria-invalid` drives the error styling rather than a separate prop, so the
 * visual state and the state announced to a screen reader cannot disagree.
 *
 * Pill-shaped and sitting on `--surface` rather than the page: a single-line
 * field is the same object as a button in this language, and a field that
 * matches the page background disappears against the wash. Multi-line inputs
 * are deliberately *not* pill-shaped — see the textarea note in
 * docs/UI_REDESIGN_PLAN.md §4.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-full border border-border bg-surface px-4 py-2 text-base',
        'transition-[border-color,box-shadow] duration-150',
        'placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-warning',
        className,
      )}
      {...props}
    />
  )
})

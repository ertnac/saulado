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
 * Recessed rather than raised. Clay reads as a material because some things are
 * pushed out and others are pressed in; a design where every surface bulges is
 * merely rounded, and a field is the one place the pressed-in direction obviously
 * belongs. `.clay-inset` brings the fill, border and inner shadow with it, so the
 * `bg-surface` and `border` utilities that used to do that job are gone — a
 * utility would win over the clay declaration and flatten it.
 *
 * The radius is put back to a pill, overriding `.clay-inset`'s 12px. That 12px
 * exists for multi-line fields, where a full curve would push the first and last
 * characters inside it; a single-line field is the same object as a button in
 * this language and stays shaped like one.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'clay-inset flex h-11 w-full rounded-full px-4 py-2 text-base',
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

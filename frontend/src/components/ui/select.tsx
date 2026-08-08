import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * A native `<select>`, restyled to match {@link Input}.
 *
 * Native on purpose. A custom listbox would have to reimplement type-ahead,
 * option groups, the mobile wheel picker and every platform's own keyboard
 * conventions — and would still be worse at all four. The only thing wrong with
 * the browser's select was that it looked like 2003, which is a CSS problem.
 *
 * The arrow is the platform's, not ours: `appearance-none` plus a background
 * chevron renders differently on every OS and breaks outright in forced-colours
 * mode. So the padding leaves the native control its room and we style the rest.
 *
 * `text-base` rather than `text-sm`, matching every other field in the app.
 * Mobile Safari zooms the whole page when a control smaller than 16px takes
 * focus, and a filter row that resizes the viewport when you tap it is worse
 * than one that looks slightly chunky.
 */
export function selectClass(className?: string): string {
  return cn(
    'h-11 rounded-full border border-border bg-surface px-4 text-base',
    'transition-[border-color,box-shadow] duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={selectClass(className)} {...props} />
})

/**
 * The same shell for `<input type="date">` and friends.
 *
 * Separate from `selectClass` only because the two will drift: a date field
 * eventually wants its own calendar-button spacing, and sharing one string until
 * then would make that change look riskier than it is.
 */
export function fieldChipClass(className?: string): string {
  return cn(
    'h-11 rounded-full border border-border bg-surface px-4 text-base',
    'transition-[border-color,box-shadow] duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )
}

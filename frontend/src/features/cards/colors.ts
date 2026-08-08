import type { SetColor } from '@saulado/shared'

/**
 * Set colours, resolved to Tailwind classes.
 *
 * A lookup table rather than `bg-${color}-500`: Tailwind scans source text for
 * class names at build time, so an interpolated class is never generated and the
 * swatch renders transparent. Writing them out is what puts them in the bundle.
 *
 * The shared package stores the colour *name* and deliberately does not know
 * about CSS (see `SET_COLORS`), which is why this mapping lives in the frontend.
 */

const SWATCH: Record<SetColor, string> = {
  slate: 'bg-slate-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  teal: 'bg-teal-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
}

/** A filled block of the set's colour — swatches and pickers. */
export function setColorClass(color: SetColor): string {
  return SWATCH[color]
}

/**
 * The colour as a card accent.
 *
 * A left border rather than a tinted background: at the 4.5:1 contrast the text
 * needs (WCAG AA), eight background tints are eight separate contrast problems in
 * two themes, while a border carries the same identifying information and none of
 * the risk.
 */
const ACCENT: Record<SetColor, string> = {
  slate: 'border-l-slate-500',
  red: 'border-l-red-500',
  amber: 'border-l-amber-500',
  green: 'border-l-green-500',
  teal: 'border-l-teal-500',
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
  pink: 'border-l-pink-500',
}

export function setAccentClass(color: SetColor): string {
  return ACCENT[color]
}

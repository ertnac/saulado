import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A segmented control — the reference's answer to a short, mutually exclusive
 * choice that would otherwise be a dropdown.
 *
 * Radio semantics, not a row of buttons. A row of buttons tells a screen reader
 * "there are five things you can press"; a radiogroup tells it "one of five,
 * this one is chosen, here is the group's name" — which is the actual state.
 * That brings the standard keyboard contract with it: one Tab stop for the
 * whole group, arrows to move between options.
 */

interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Announced instead of `label` when the visible label is an icon or a count. */
  srLabel?: string
}

interface SegmentedControlProps<T extends string> {
  /** Names the group. Required — an unnamed radiogroup announces as "group". */
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
}

/**
 * The look on its own, for places where the existing markup already has correct
 * semantics of its own kind (a set of toggles, a set of links) and only needs
 * to match. Swapping working semantics for these just to get the styling would
 * be a downgrade.
 */
export function segmentClass(selected: boolean, className?: string): string {
  return cn(
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium',
    'transition-[background-color,color,box-shadow] duration-150',
    selected
      ? 'bg-surface text-foreground shadow-soft'
      : 'text-muted-foreground hover:text-foreground',
    className,
  )
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null)

  function move(delta: number): void {
    const index = options.findIndex((option) => option.value === value)
    if (index === -1) return
    // Wraps, per the WAI-ARIA radiogroup pattern.
    const next = options[(index + delta + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    // Selection follows focus here, so focus has to follow selection back —
    // otherwise the next arrow press moves from a stale position.
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[options.indexOf(next)]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    }
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('inline-flex gap-1 rounded-full bg-surface-muted p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.srLabel}
            // Roving tabindex: the group is one Tab stop, and Tab lands on
            // whichever option is currently chosen.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={segmentClass(selected)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

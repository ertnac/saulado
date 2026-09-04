import { useId, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'
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
 * Geometry, shared so the standalone recipe below and the control's own buttons
 * cannot drift apart. They differ only in where the selected fill comes from.
 */
const SEGMENT_BASE =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium'

/**
 * The look on its own, for places where the existing markup already has correct
 * semantics of its own kind (a set of toggles, a set of links) and only needs
 * to match. Swapping working semantics for these just to get the styling would
 * be a downgrade.
 *
 * The selected state is a static `.clay-pill` here. The sliding thumb belongs to
 * `SegmentedControl`, which knows it owns every option in the group; a caller
 * styling one link at a time has no such group to slide within.
 */
export function segmentClass(selected: boolean, className?: string): string {
  return cn(
    SEGMENT_BASE,
    'transition-[background-color,color,box-shadow] duration-150',
    selected ? 'clay-pill text-foreground' : 'text-muted-foreground hover:text-foreground',
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
  /**
   * Per instance, not the shared literal it looks like it could be. Two
   * segmented controls on one screen — a filter beside a sort — sharing one
   * `layoutId` would make the thumb fly from one group to the other whenever
   * either changed, because framer would read them as the same element moving.
   */
  const thumbId = useId()

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
      // Recessed, so the unselected options read as sitting *in* the track and
      // the thumb as sitting on top of it — which is the whole reason the
      // selected option needs no border to be legible. The pill radius overrides
      // `.clay-inset`'s 12px, which exists for multi-line fields.
      className={cn('clay-inset inline-flex gap-1 rounded-full p-1', className)}
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
            // No selected fill in the class: the thumb below is the fill, and
            // having both would show a pill under a pill for the one frame the
            // thumb is still travelling.
            className={cn(
              SEGMENT_BASE,
              'relative transition-colors duration-150',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                aria-hidden="true"
                className="clay-pill absolute inset-0"
                transition={SPRING}
              />
            )}
            {/*
              Positioned so it paints over the thumb, which is absolutely
              positioned behind it. Without this the label sits under the pill's
              fill and disappears.
            */}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

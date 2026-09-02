import { useRef, type KeyboardEvent, type ReactElement } from 'react'
import type { AnsweringType } from '@saulado/shared'
import { CardsIcon, ListIcon, PencilIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface StudyModeSwitcherProps {
  value: AnsweringType
  onChange: (mode: AnsweringType) => void
  disabled?: boolean
  className?: string
}

interface ModeOption {
  value: AnsweringType
  label: string
  icon: (props: { className?: string }) => ReactElement
}

const MODES: ModeOption[] = [
  {
    value: 'identification',
    label: 'Type-In',
    icon: PencilIcon,
  },
  {
    value: 'multiple-choice',
    label: 'Multiple Choice',
    icon: ListIcon,
  },
  {
    value: 'flashcard',
    label: 'Flashcards',
    icon: CardsIcon,
  },
]

/**
 * Segmented control for choosing the study answering mode (Type-In, Multiple Choice, Flashcards).
 *
 * Implements WAI-ARIA radiogroup pattern with arrow key navigation and roving tabIndex.
 */
export function StudyModeSwitcher({
  value,
  onChange,
  disabled = false,
  className,
}: StudyModeSwitcherProps): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null)

  function move(delta: number): void {
    if (disabled) return
    const index = MODES.findIndex((mode) => mode.value === value)
    if (index === -1) return

    const nextIndex = (index + delta + MODES.length) % MODES.length
    const nextMode = MODES[nextIndex]
    if (!nextMode) return

    onChange(nextMode.value)
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[nextIndex]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return
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
      aria-label="Study mode"
      aria-disabled={disabled}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/50 bg-surface-muted p-1 text-xs transition-opacity duration-150',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {MODES.map((mode) => {
        const isSelected = mode.value === value
        const IconComponent = mode.icon

        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            disabled={disabled}
            aria-checked={isSelected}
            aria-label={mode.label}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => {
              if (!disabled) onChange(mode.value)
            }}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8.5 sm:px-3.5 sm:text-xs',
              isSelected
                ? 'bg-surface text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <IconComponent
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-colors',
                isSelected ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <span className="whitespace-nowrap">{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}

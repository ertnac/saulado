import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'plain' | 'soft' | 'active'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * The accessible name. Required rather than optional, because an icon-only
   * control with no label is announced as "button" and nothing else — and the
   * rail this component was built for is entirely icon-only.
   */
  label: string
  icon: ReactNode
  tone?: Tone
}

const tones: Record<Tone, string> = {
  plain: 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
  soft: 'bg-surface-muted text-foreground hover:bg-muted',
  // The filled disc marking the current item in the rail. Reads as selected by
  // shape and fill, not only by colour.
  active: 'bg-primary text-primary-foreground shadow-soft',
}

/**
 * A circular icon-only control — the rail item, the toolbar button, the dismiss.
 *
 * Fixed at 44×44 (`h-11 w-11`) whatever the icon inside it. Circular controls
 * are the easiest thing in a rounded design to shrink to a pretty 32px that
 * misses the touch-target minimum, so the size is not a prop.
 *
 * `title` duplicates the label for a pointer tooltip. It does not affect the
 * accessible name — `aria-label` wins over `title` in the name computation, so
 * nothing is announced twice.
 */
export function IconButton({
  label,
  icon,
  tone = 'plain',
  className,
  type = 'button',
  ...props
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg',
        'transition-[background-color,color,box-shadow] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}

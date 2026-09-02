import { useId, type ReactElement, type ReactNode } from 'react'
import { Input, type InputProps } from './input'
import { AlertIcon } from './icons'
import { cn } from '@/lib/utils'

interface FormFieldProps extends Omit<InputProps, 'id' | 'aria-invalid' | 'aria-describedby'> {
  label: string
  /** Field-level message from the server or from client-side policy. */
  error?: string
  /** Persistent guidance shown under the field, e.g. the password rule. */
  hint?: ReactNode
  leftIcon?: ReactNode
  rightElement?: ReactNode
}

/**
 * A labelled input with its error and hint wired for screen readers.
 *
 * Supports left icon and right action adornments (e.g. show/hide password).
 */
export function FormField({
  label,
  error,
  hint,
  leftIcon,
  rightElement,
  className,
  ...props
}: FormFieldProps): ReactElement {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="space-y-1.5 text-left">
      <label htmlFor={id} className="block text-xs sm:text-sm font-semibold text-foreground/90">
        {label}
      </label>

      <div className="relative flex items-center">
        {leftIcon && (
          <div className="pointer-events-none absolute left-3.5 text-muted-foreground">
            {leftIcon}
          </div>
        )}

        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            leftIcon ? 'pl-10' : '',
            rightElement ? 'pr-10' : '',
            'rounded-2xl border-border/80 bg-surface/90 focus:bg-surface transition-all text-sm',
            className,
          )}
          {...props}
        />

        {rightElement && <div className="absolute right-3 flex items-center">{rightElement}</div>}
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground leading-relaxed">
          {hint}
        </p>
      )}

      <div aria-live="polite">
        {error && (
          <p
            id={errorId}
            className="flex items-start gap-1.5 text-xs text-warning font-medium mt-1"
          >
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  )
}

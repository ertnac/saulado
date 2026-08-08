import { useId, type ReactElement, type ReactNode } from 'react'
import { Input, type InputProps } from './input'
import { AlertIcon } from './icons'

interface FormFieldProps extends Omit<InputProps, 'id' | 'aria-invalid' | 'aria-describedby'> {
  label: string
  /** Field-level message from the server or from client-side policy. */
  error?: string
  /** Persistent guidance shown under the field, e.g. the password rule. */
  hint?: ReactNode
}

/**
 * A labelled input with its error and hint wired for screen readers.
 *
 * Exists so the wiring cannot be forgotten. `aria-describedby` pointing at the
 * error node is what makes a screen reader read "Password. Password must be at
 * least 10 characters." instead of just "Password" — and it is exactly the bit
 * that gets skipped when each form hand-rolls its own markup.
 *
 * The error is rendered inside a live region so a *server-side* validation
 * failure is announced on arrival. Without it the message appears silently and a
 * non-sighted user is left wondering why submit did nothing.
 */
export function FormField({ label, error, hint, ...props }: FormFieldProps): ReactElement {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>

      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />

      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {/*
        `--warning`, not `--danger`. The plan reserves danger for destructive and
        irreversible actions; a field you can simply retype is neither, and
        spending the strongest colour in the palette on a typo leaves nothing
        louder for "this will delete your account".
      */}
      <div aria-live="polite">
        {error && (
          <p id={errorId} className="flex items-start gap-1.5 text-sm text-warning">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

import { useCallback, useState } from 'react'
import { ApiError } from '@/services/api'

interface FormErrors {
  /** Per-field messages, keyed by field name. */
  fields: Record<string, string>
  /** Whole-form message: bad credentials, rate limiting, an unreachable API. */
  general: string | null
}

const EMPTY: FormErrors = { fields: {}, general: null }

/**
 * Turns a thrown error into form state.
 *
 * Every auth form needs the same triage — field errors beside their inputs,
 * everything else at the top — and getting it wrong is how "email already
 * registered" ends up as an anonymous red banner with no indication which field
 * to fix.
 *
 * Rate limiting is special-cased: `retryAfter` is the only actionable part of a
 * 429, and "try again in 15 minutes" is a materially different message from
 * "try again", especially to someone who suspects they have been locked out.
 */
export function useFormErrors(): {
  errors: FormErrors
  setFromError: (error: unknown) => void
  clear: () => void
} {
  const [errors, setErrors] = useState<FormErrors>(EMPTY)

  const clear = useCallback(() => {
    setErrors(EMPTY)
  }, [])

  const setFromError = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      if (error.code === 'RATE_LIMITED') {
        const minutes = Math.ceil((error.retryAfter ?? 900) / 60)
        setErrors({
          fields: {},
          general: `Too many attempts. Please try again in about ${String(minutes)} minute${
            minutes === 1 ? '' : 's'
          }.`,
        })
        return
      }

      setErrors({
        fields: error.fields ?? {},
        // A field-level failure already says everything beside the input;
        // repeating it at the top is noise.
        general: error.isFieldError ? null : error.message,
      })
      return
    }

    // Anything not an ApiError never reached the server — almost always the
    // network. Say so, rather than showing a raw exception message.
    setErrors({
      fields: {},
      general: 'Could not reach the server. Check your connection and try again.',
    })
  }, [])

  return { errors, setFromError, clear }
}

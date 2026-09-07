import { useCallback, useState } from 'react'
import { ApiError } from '../services/api'

interface FormErrors {
  /** Per-field messages, keyed by field name. */
  fields: Record<string, string>
  /** Whole-form message: bad credentials, rate limiting, an unreachable API. */
  general: string | null
}

const EMPTY: FormErrors = { fields: {}, general: null }

/**
 * Turns a thrown error into form state. Ported unchanged from
 * `frontend/src/hooks/useFormErrors.ts` — only the import path differs.
 *
 * Every auth form needs the same triage — field errors beside their inputs,
 * everything else at the top — and getting it wrong is how "email already
 * registered" ends up as an anonymous banner with no indication which field to
 * fix.
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

    /**
     * Anything not an `ApiError` never reached the server. On the web that is
     * almost always the network; here it is also a `ConfigError` from a missing
     * or wrong `EXPO_PUBLIC_API_URL`, which looks identical to the user and has
     * the same first thing to check — whether this device can see that host at
     * all.
     */
    console.error('[useFormErrors] Non-ApiError caught:', error)
    const rawMessage = error instanceof Error ? error.message : String(error)
    const lower = rawMessage.toLowerCase()
    const isNetwork =
      lower.includes('fetch failed') ||
      lower.includes('network') ||
      lower.includes('canceled') ||
      lower.includes('aborted') ||
      lower.includes('timeout') ||
      lower.includes('connection')
    setErrors({
      fields: {},
      general: isNetwork
        ? 'Could not reach the server. Please check your network connection and try again.'
        : rawMessage,
    })
  }, [])

  return { errors, setFromError, clear }
}

import { forwardRef, type ReactElement, type ReactNode } from 'react'
import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { AlertIcon, CheckIcon } from './icons'
import { useTokenColor } from '../stores/theme'

interface FieldProps extends TextInputProps {
  label: string
  /** Field-level message from the server or from client-side policy. */
  error?: string
  /** Persistent guidance shown under the field, e.g. the password rule. */
  hint?: string
}

/**
 * A labelled input with its error and hint wired for screen readers, ported from
 * `frontend/src/components/ui/form-field.tsx`.
 *
 * The web wires this with `htmlFor` and `aria-describedby`. React Native has
 * neither, so the same information is folded into `accessibilityLabel` and
 * `accessibilityHint` on the input itself — a visible `<Text>` above a
 * `TextInput` is not announced as its label the way a `<label for>` is, so
 * without this VoiceOver reads an unnamed text field.
 *
 * The error also gets `accessibilityLiveRegion` so a *server-side* failure is
 * announced on arrival rather than appearing silently. That prop is Android-only;
 * VoiceOver picks the message up from the label instead, which is why the label
 * carries it too rather than only the live region.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, ...props },
  ref,
): ReactElement {
  const placeholder = useTokenColor('--muted-foreground')
  const warning = useTokenColor('--warning')

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>

      <TextInput
        ref={ref}
        accessibilityLabel={error ? `${label}. ${error}` : label}
        accessibilityHint={hint}
        placeholderTextColor={placeholder}
        className={`h-11 rounded-full border bg-surface px-4 text-base text-foreground ${
          error ? 'border-warning' : 'border-border'
        }`}
        {...props}
      />

      {hint !== undefined && <Text className="text-xs text-muted-foreground">{hint}</Text>}

      {/*
        `--warning`, not `--danger`. The plan reserves danger for destructive and
        irreversible actions; a field you can simply retype is neither, and
        spending the strongest colour in the palette on a typo leaves nothing
        louder for "this will delete your account".
      */}
      {error !== undefined && (
        <View accessibilityLiveRegion="polite" className="flex-row items-start gap-1.5">
          <View className="pt-0.5">
            <AlertIcon color={warning} size={14} />
          </View>
          <Text className="flex-1 text-sm text-warning">{error}</Text>
        </View>
      )}
    </View>
  )
})

/**
 * Whole-form banner, ported from `AuthLayout`'s `FormAlert`.
 *
 * `warning` is the default because that is what every failure here is: a
 * recoverable one with an obvious next step. `success` exists so the reset flow
 * can hand its confirmation to the sign-in screen — Phase 2 has no toast, and a
 * message the user must read to know their password changed is the wrong thing
 * to put in something that erases itself after four seconds anyway.
 */
export function FormAlert({
  message,
  variant = 'warning',
}: {
  message: string
  variant?: 'warning' | 'success'
}): ReactElement {
  const success = variant === 'success'
  const color = useTokenColor(success ? '--success' : '--warning')

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`mb-5 flex-row items-start gap-2 rounded-md p-3 ${
        success ? 'bg-success/10' : 'bg-warning/10'
      }`}
    >
      <View className="pt-0.5">
        {success ? <CheckIcon color={color} size={16} /> : <AlertIcon color={color} size={16} />}
      </View>
      <Text className={`flex-1 text-sm ${success ? 'text-success' : 'text-warning'}`}>
        {message}
      </Text>
    </View>
  )
}

/** Vertical rhythm between form controls — the web's `space-y-4`, which RN lacks. */
export function FormStack({ children }: { children: ReactNode }): ReactElement {
  return <View className="gap-4">{children}</View>
}

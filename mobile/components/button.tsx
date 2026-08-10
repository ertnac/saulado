import type { ReactElement, ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { useTokenColor } from '../stores/theme'

type Variant = 'default' | 'outline' | 'ghost'
type Size = 'md' | 'lg'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  /** Shows a spinner and blocks presses. Disabled without the spinner is `disabled`. */
  loading?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Ported from `frontend/src/components/ui/button.tsx`, minus the variants Phase 2
 * has no caller for — `accent`, `soft` and `danger` come across with the screens
 * that use them, and the `icon` size is `ThemeToggle`'s own 44×44 box.
 *
 * `buttonClass` does not port. It exists on the web so a navigating `<a>` can
 * look like a button without becoming one; React Native has no anchor element
 * and `<Link asChild>` wraps a `Pressable` either way, so the split has nothing
 * to buy here.
 *
 * `loading` is separate from `disabled` because they read differently: a
 * disabled button is the user's turn, a loading one is ours. Collapsing them
 * leaves a submit that looks broken for the two seconds the request takes.
 */
const VARIANTS: Record<Variant, { view: string; text: string; spinner: string }> = {
  default: { view: 'bg-primary', text: 'text-primary-foreground', spinner: '--primary-foreground' },
  outline: {
    view: 'border border-border bg-surface',
    text: 'text-foreground',
    spinner: '--foreground',
  },
  ghost: { view: 'bg-transparent', text: 'text-foreground', spinner: '--foreground' },
}

/** Both meet the 44px minimum touch target from saulado-ux §7. */
const SIZES: Record<Size, { view: string; text: string }> = {
  md: { view: 'h-11 px-5', text: 'text-sm' },
  lg: { view: 'h-12 px-6', text: 'text-base' },
}

export function Button({
  label,
  onPress,
  variant = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
}: ButtonProps): ReactElement {
  const blocked = disabled || loading
  const v = VARIANTS[variant]
  const s = SIZES[size]
  // The spinner is an `ActivityIndicator`, not a styled element, so it takes a
  // resolved colour rather than a class — same reason as the SVG icons.
  const spinnerColor = useTokenColor(v.spinner)

  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Announces the blocked state rather than only drawing it — an opacity
      // change is invisible to a screen reader.
      accessibilityState={{ disabled: blocked, busy: loading }}
      className={`flex-row items-center justify-center gap-2 rounded-full ${v.view} ${s.view} ${
        blocked ? 'opacity-50' : ''
      } ${className}`}
    >
      {/*
        The spinner sits beside the label rather than replacing it. Swapping the
        text out changes the button's width mid-press, which moves whatever is
        under the user's thumb.
      */}
      {loading && <ActivityIndicator size="small" color={spinnerColor} />}
      <Text className={`font-medium ${v.text} ${s.text}`}>{label}</Text>
    </Pressable>
  )
}

/**
 * A pressable run of text — the web's underlined `<Link>` in prose.
 *
 * `Text` rather than `Pressable`, so it can sit inline inside a sentence; a
 * `Pressable` there would break the line box. The 44px rule is relaxed
 * deliberately for inline text, which is the one place it cannot apply without
 * splitting the sentence apart.
 */
export function TextLink({
  children,
  onPress,
  className = '',
}: {
  children: ReactNode
  onPress: () => void
  className?: string
}): ReactElement {
  return (
    <Text
      onPress={onPress}
      accessibilityRole="link"
      className={`font-medium text-foreground underline ${className}`}
    >
      {children}
    </Text>
  )
}

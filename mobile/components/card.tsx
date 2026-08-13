import type { ReactElement, ReactNode } from 'react'
import { Text, View } from 'react-native'

/**
 * The rounded surface the screens are built out of.
 *
 * The web version (`frontend/src/components/ui/card.tsx`) separates panels by
 * tint and a soft shadow. React Native's `shadow*` props are unreliable across
 * the two platforms and cost a layer, so the hairline border the rest of this
 * app already uses stands in — `set-list.tsx` and `study-card.tsx` had both
 * settled on `rounded-xl border border-border bg-surface` before this file
 * existed, and this is that string with a name.
 */
type Tone = 'default' | 'muted' | 'dashed' | 'accent' | 'danger'

const TONES: Record<Tone, string> = {
  default: 'border-border bg-surface',
  muted: 'border-transparent bg-surface-muted',
  // Dashed marks a slot where something is *missing* rather than a panel that
  // holds content — an empty state, a not-yet-created thing.
  dashed: 'border-dashed border-border bg-surface',
  accent: 'border-accent/30 bg-accent/10',
  // The only place in the app that uses `--danger` as a *border*. Reserved for
  // the delete-account panel, the single irreversible action in the product.
  danger: 'border-danger/40 bg-danger/5',
}

export function Card({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}): ReactElement {
  return <View className={`rounded-2xl border p-6 ${TONES[tone]} ${className}`}>{children}</View>
}

/**
 * The small muted label above a figure or a list.
 *
 * Sentence case, not uppercase-with-tracking: small all-caps text is measurably
 * harder to read for dyslexic users.
 */
export function CardLabel({ children }: { children: ReactNode }): ReactElement {
  return <Text className="text-sm font-medium text-muted-foreground">{children}</Text>
}

/** A large figure, for the one number a card exists to show. */
export function CardFigure({ children }: { children: ReactNode }): ReactElement {
  return (
    <Text className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-foreground">
      {children}
    </Text>
  )
}

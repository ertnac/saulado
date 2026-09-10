import type { ReactElement } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { StartableMode } from '@saulado/shared'
import { Button } from './button'

interface ModePickerProps {
  selected: StartableMode
  onChange: (mode: StartableMode) => void
  onStart: () => void
  pending: boolean
  dueCount?: number
  totalCount?: number
  isOffline?: boolean
}

export function ModePicker({
  selected,
  onChange,
  onStart,
  pending,
  dueCount,
  totalCount,
  isOffline = false,
}: ModePickerProps): ReactElement {
  const isEmpty = totalCount === 0
  const hasDueCards = dueCount === undefined || dueCount > 0
  const isSpacedDisabled = !isOffline && selected === 'spaced' && !hasDueCards

  const modes: {
    id: StartableMode
    title: string
    description: string
    badge?: string
    badgeType?: 'recommended' | 'warning' | 'neutral'
    icon: string
  }[] = [
    {
      id: 'spaced',
      title: 'Spaced Repetition',
      description: isOffline
        ? 'Practice downloaded cards offline. Reviews are recorded locally and sync automatically when reconnected.'
        : hasDueCards
          ? `Reviews only the ${dueCount !== undefined ? `${dueCount} ` : ''}cards that are due, optimized for long-term retention.`
          : 'All cards reviewed for today! New reviews will unlock tomorrow.',
      badge: isOffline ? 'Offline Sync' : hasDueCards ? 'Recommended' : '0 Due Today',
      badgeType: isOffline ? 'recommended' : hasDueCards ? 'recommended' : 'warning',
      icon: '🧠',
    },
    {
      id: 'sequential',
      title: 'Sequential Drill',
      description:
        'Study every card in the set, walking through them in the order they were created.',
      badge:
        !hasDueCards && !isOffline
          ? 'Ready to Drill'
          : totalCount
            ? `${totalCount} cards`
            : undefined,
      badgeType: !hasDueCards && !isOffline ? 'recommended' : 'neutral',
      icon: '📖',
    },
    {
      id: 'shuffled',
      title: 'Shuffled Drill',
      description:
        'Study every card in the set, shuffled in a random order to challenge your recall.',
      badge: totalCount ? `${totalCount} cards` : undefined,
      badgeType: 'neutral',
      icon: '🔀',
    },
  ]

  return (
    <View className="gap-6 w-full max-w-md mx-auto">
      <View className="items-center gap-2">
        <Text className="text-2xl font-bold tracking-tight text-foreground text-center">
          Study Session Settings
        </Text>
        <Text className="text-sm text-muted-foreground text-center px-4">
          {isOffline
            ? 'Pick a learning modality to drill your cards offline. Progress will sync when reconnected.'
            : 'Pick a method to drill your cards. Only spaced repetition updates daily goals.'}
        </Text>
      </View>

      <View className="gap-4">
        {modes.map((m) => {
          const active = selected === m.id
          const isSpacedWithNoDue = m.id === 'spaced' && !hasDueCards

          return (
            <Pressable
              key={m.id}
              onPress={() => onChange(m.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-row items-start p-5 rounded-2xl border-2 ${
                active
                  ? isSpacedWithNoDue
                    ? 'border-warning bg-warning/5'
                    : 'border-primary bg-primary/5'
                  : 'border-border bg-surface'
              }`}
            >
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-surface-muted">
                <Text className="text-2xl">{m.icon}</Text>
              </View>
              <View className="ml-4 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className={`font-semibold text-base ${
                      active
                        ? isSpacedWithNoDue
                          ? 'text-warning-strong'
                          : 'text-primary'
                        : 'text-foreground'
                    }`}
                  >
                    {m.title}
                  </Text>
                  {m.badge && (
                    <View
                      className={`rounded-full px-2.5 py-0.5 ${
                        m.badgeType === 'recommended'
                          ? 'bg-accent/15'
                          : m.badgeType === 'warning'
                            ? 'bg-warning/15'
                            : 'bg-surface-muted border border-border/60'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          m.badgeType === 'recommended'
                            ? 'text-accent-strong'
                            : m.badgeType === 'warning'
                              ? 'text-warning'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {m.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="mt-1 text-sm text-muted-foreground leading-normal">
                  {m.description}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      <View className="items-center mt-2 gap-2">
        <Button
          label={
            pending
              ? 'Starting…'
              : isEmpty
                ? 'This set has no cards yet'
                : isSpacedDisabled
                  ? 'No cards due for review'
                  : 'Start session'
          }
          size="lg"
          className="w-full"
          onPress={() => {
            if (isEmpty || isSpacedDisabled) return
            console.log(
              '[ModePicker] Start session button tapped! Selected mode:',
              selected,
              'Pending:',
              pending,
            )
            onStart()
          }}
          disabled={pending || isEmpty || isSpacedDisabled}
        />
        {isEmpty ? (
          <Text className="text-xs text-center text-muted-foreground px-4">
            Add cards with fill-in-the-blank highlights to this set before starting a study session.
          </Text>
        ) : isSpacedDisabled ? (
          <Text className="text-xs text-center text-muted-foreground px-4">
            All cards in this set are reviewed for today. Choose Sequential Drill or Shuffled Drill
            above to practice anytime!
          </Text>
        ) : null}
      </View>
    </View>
  )
}

import type { ReactElement } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { StartableMode } from '@saulado/shared'
import { Button } from './button'

interface ModePickerProps {
  selected: StartableMode
  onChange: (mode: StartableMode) => void
  onStart: () => void
  pending: boolean
}

export function ModePicker({
  selected,
  onChange,
  onStart,
  pending,
}: ModePickerProps): ReactElement {
  const modes: {
    id: StartableMode
    title: string
    description: string
    badge?: string
    icon: string
  }[] = [
    {
      id: 'spaced',
      title: 'Spaced Repetition',
      description: 'Reviews only the cards that are due, optimized for long-term retention.',
      badge: 'Recommended',
      icon: '🧠',
    },
    {
      id: 'sequential',
      title: 'Sequential Drill',
      description:
        'Study every card in the set, walking through them in the order they were created.',
      icon: '📖',
    },
    {
      id: 'shuffled',
      title: 'Shuffled Drill',
      description:
        'Study every card in the set, shuffled in a random order to challenge your recall.',
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
          Pick a method to drill your cards. Only spaced repetition updates daily goals.
        </Text>
      </View>

      <View className="gap-4">
        {modes.map((mode) => {
          const active = selected === mode.id
          return (
            <Pressable
              key={mode.id}
              onPress={() => onChange(mode.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-row items-start p-5 rounded-2xl border-2 transition-all duration-150 ${
                active ? 'border-primary bg-primary/5' : 'border-border bg-surface'
              }`}
            >
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-surface-muted">
                <Text className="text-2xl">{mode.icon}</Text>
              </View>
              <View className="ml-4 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className={`font-semibold text-base ${active ? 'text-primary' : 'text-foreground'}`}
                  >
                    {mode.title}
                  </Text>
                  {mode.badge && (
                    <View className="rounded-full bg-accent/15 px-2.5 py-0.5">
                      <Text className="text-[10px] font-bold text-accent-strong uppercase tracking-wider">
                        {mode.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="mt-1 text-sm text-muted-foreground leading-normal">
                  {mode.description}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      <View className="items-center mt-2">
        <Button
          label={pending ? 'Starting…' : 'Start session'}
          size="lg"
          className="w-full"
          onPress={onStart}
          disabled={pending}
        />
      </View>
    </View>
  )
}

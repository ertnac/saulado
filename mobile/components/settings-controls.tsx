import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Pressable, Switch, Text, TextInput, View } from 'react-native'
import { useTokenColor } from '../stores/theme'

/**
 * The controls the settings screen is built from — a port of
 * `frontend/src/features/account/SettingsControls.tsx`.
 *
 * Split out for the same reason as the web's: each carries a small behavioural
 * rule that would be invisible inline — a number field that must not save on
 * every keystroke, a switch that has to announce as a switch, a timezone entry
 * that cannot be a hardcoded list.
 */

export function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <View className="gap-5 rounded-xl border border-border bg-surface p-5">
      {/* Sentence case, matching `CardLabel`. Small all-caps is harder to read. */}
      <Text className="text-base font-semibold tracking-tight text-foreground">{title}</Text>
      {children}
    </View>
  )
}

/**
 * A labelled switch.
 *
 * React Native's `Switch` already announces as a switch and already carries its
 * on/off state, so this is the platform control with a label attached rather than
 * a `Pressable` pretending to be one. The label sits in `accessibilityLabel` on
 * the switch itself: a `Text` beside a control is not associated with it the way
 * a `<label for>` is, so without it VoiceOver reads an unnamed toggle.
 */
export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (next: boolean) => void
}): ReactElement {
  const primary = useTokenColor('--primary')
  const surfaceMuted = useTokenColor('--surface-muted')

  return (
    <View className="flex-row items-start justify-between gap-4">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {hint !== undefined && <Text className="text-xs text-muted-foreground">{hint}</Text>}
      </View>

      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: primary, false: surfaceMuted }}
      />
    </View>
  )
}

/**
 * A number setting that saves on blur, not on keystroke.
 *
 * Typing `120` passes through `1` and `12`, and saving those would write two
 * values the user never chose — with an optimistic patch, they would also *see*
 * them. Clearing the field to retype leaves it empty, which is not a number.
 *
 * Out-of-range values are reported rather than silently clamped. Clamping is
 * quietly wrong: someone who typed `0` meaning "pause reviews" gets `1` and no
 * explanation. The message names the range so the next attempt is informed.
 */
export function NumberSetting({
  label,
  hint,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onCommit: (next: number) => void
}): ReactElement {
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const muted = useTokenColor('--muted-foreground')

  // Follows the server's value when it changes underneath — a rolled-back
  // optimistic patch, or another device. Only fires when `value` actually
  // changes, which typing does not do.
  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit(): void {
    const parsed = Number.parseInt(text, 10)

    // An empty or unparseable field is a slip, not a choice — restore rather
    // than accuse. Out of range is a choice, and gets an explanation.
    if (Number.isNaN(parsed)) {
      setText(String(value))
      setError(null)
      return
    }

    if (parsed < min || parsed > max) {
      setError(`Pick a number between ${String(min)} and ${String(max)}.`)
      return
    }

    setError(null)
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>

      <TextInput
        accessibilityLabel={error ? `${label}. ${error}` : label}
        accessibilityHint={hint}
        value={text}
        onChangeText={(next) => {
          setText(next)
          if (error) setError(null)
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        placeholderTextColor={muted}
        className={`h-11 rounded-full border bg-surface px-4 text-base tabular-nums text-foreground ${
          error ? 'border-warning' : 'border-border'
        }`}
      />

      {error !== null && (
        <Text accessibilityLiveRegion="polite" className="text-sm text-warning">
          {error}
        </Text>
      )}
      {hint !== undefined && <Text className="text-xs text-muted-foreground">{hint}</Text>}
    </View>
  )
}

/**
 * The timezone setting.
 *
 * Load-bearing beyond display: the study queue's "today" and every daily-stats
 * row is computed in this zone, so a wrong value means cards are due at the wrong
 * hour and a streak breaks at the wrong midnight.
 *
 * A text field, not a picker. The web offers `Intl.supportedValuesOf('timeZone')`
 * in a `<select>`; Hermes ships a trimmed ICU and does not implement that method,
 * so there is no list to render — and a hardcoded one would eventually offer a
 * name the server's `Intl` rejects, which is the one failure this control must not
 * produce. The "Use <detected>" shortcut below covers the common case in one tap,
 * which is what most users would have picked out of the list anyway.
 *
 * The detected zone is never applied automatically: a user who deliberately keeps
 * their account on the zone they study in should not have it rewritten by opening
 * the app in an airport.
 */
export function TimezoneSetting({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}): ReactElement {
  const [text, setText] = useState(value)
  const muted = useTokenColor('--muted-foreground')

  useEffect(() => {
    setText(value)
  }, [value])

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">Time zone</Text>

      <TextInput
        accessibilityLabel="Time zone"
        value={text}
        onChangeText={setText}
        onBlur={() => {
          const next = text.trim()
          if (next && next !== value) onCommit(next)
          else setText(value)
        }}
        placeholder="Area/City"
        placeholderTextColor={muted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        className="h-11 rounded-full border border-border bg-surface px-4 text-base text-foreground"
      />

      <Text className="text-xs text-muted-foreground">Decides when your study day rolls over.</Text>

      {detected !== value && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Use ${detected}`}
          onPress={() => {
            onCommit(detected)
          }}
          className="min-h-11 justify-center active:opacity-70"
        >
          <Text className="text-sm font-medium text-foreground underline">{`Use ${detected}`}</Text>
        </Pressable>
      )}
    </View>
  )
}

/**
 * A two-option choice, rendered as a pair of radios rather than a picker.
 *
 * A modal wheel to choose between two values is more interaction than the values
 * are worth, and both options are visible here without opening anything —
 * `radio` with `checked` is what makes a screen reader announce the pair as one
 * choice rather than two unrelated buttons.
 */
export function ChoiceSetting<T extends string>({
  label,
  hint,
  value,
  options,
  labels,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (next: T) => void
}): ReactElement {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>

      <View className="flex-row gap-1 rounded-full bg-surface-muted p-1">
        {options.map((option) => {
          const selected = option === value

          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={labels[option]}
              onPress={() => {
                onChange(option)
              }}
              className={`min-h-11 flex-1 items-center justify-center rounded-full px-3 ${
                selected ? 'bg-surface' : ''
              }`}
            >
              <Text
                className={`text-sm ${
                  selected ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {labels[option]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {hint !== undefined && <Text className="text-xs text-muted-foreground">{hint}</Text>}
    </View>
  )
}

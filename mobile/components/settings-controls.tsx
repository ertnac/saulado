import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Pressable, Switch, Text, TextInput, View } from 'react-native'
import { CheckIcon } from './icons'
import { useTheme, useTokenColor } from '../stores/theme'
import {
  HIGHLIGHT_COLOR_PRESETS,
  getHighlightRgba,
  useHighlightPreferencesStore,
} from '../stores/highlight-preferences'

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
          hitSlop={8}
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
              hitSlop={8}
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

/**
 * Custom Highlight Color control for documents and PDF files.
 */
export function HighlightColorSetting(): ReactElement {
  const { isDark } = useTheme()
  const highlightColor = useHighlightPreferencesStore((s) => s.highlightColor)
  const customHex = useHighlightPreferencesStore((s) => s.customHex)
  const setHighlightColor = useHighlightPreferencesStore((s) => s.setHighlightColor)
  const setCustomHex = useHighlightPreferencesStore((s) => s.setCustomHex)

  const [inputHex, setInputHex] = useState(customHex || '#3B82F6')
  const [showCustomInput, setShowCustomInput] = useState(
    highlightColor.startsWith('#') || !HIGHLIGHT_COLOR_PRESETS.some((p) => p.id === highlightColor),
  )

  const activeRgba = getHighlightRgba(highlightColor, 0.45)

  const handleApplyCustomHex = (): void => {
    let clean = inputHex.trim()
    if (!clean.startsWith('#')) clean = '#' + clean
    if (/^#[0-9A-Fa-f]{6}$/.test(clean) || /^#[0-9A-Fa-f]{3}$/.test(clean)) {
      setCustomHex(clean)
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FFFFFF' : '#111A17' }}>
          Highlight Color
        </Text>
        <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>
          Choose your default color for highlighting text inside documents and PDFs.
        </Text>
      </View>

      {/* Preset Color Swatches */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {HIGHLIGHT_COLOR_PRESETS.map((preset) => {
          const isSelected = highlightColor.toLowerCase() === preset.id.toLowerCase()
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${preset.name} highlight color`}
              onPress={() => {
                setHighlightColor(preset.id)
                setShowCustomInput(false)
              }}
              style={{
                alignItems: 'center',
                gap: 6,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: isSelected
                  ? preset.border
                  : isDark
                    ? 'rgba(255,255,255,0.08)'
                    : '#EEF2EE',
                backgroundColor: isSelected
                  ? isDark
                    ? '#1C2B25'
                    : '#E8F3EE'
                  : isDark
                    ? '#111A17'
                    : '#FFFFFF',
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: preset.hex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.15,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              >
                {isSelected && <CheckIcon color="#FFFFFF" size={16} />}
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: isSelected ? '700' : '500',
                  color: isSelected
                    ? isDark
                      ? '#FFFFFF'
                      : '#052E24'
                    : isDark
                      ? '#889591'
                      : '#4C5854',
                }}
              >
                {preset.name}
              </Text>
            </Pressable>
          )
        })}

        {/* Custom Hex Option Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Custom highlight color"
          onPress={() => {
            setShowCustomInput(!showCustomInput)
            if (!showCustomInput && inputHex) {
              handleApplyCustomHex()
            }
          }}
          style={{
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: highlightColor.startsWith('#')
              ? '#052E24'
              : isDark
                ? 'rgba(255,255,255,0.08)'
                : '#EEF2EE',
            backgroundColor: highlightColor.startsWith('#')
              ? isDark
                ? '#1C2B25'
                : '#E8F3EE'
              : isDark
                ? '#111A17'
                : '#FFFFFF',
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: highlightColor.startsWith('#') ? highlightColor : '#A855F7',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
            }}
          >
            {highlightColor.startsWith('#') ? (
              <CheckIcon color="#FFFFFF" size={16} />
            ) : (
              <Text style={{ fontSize: 12 }}>🎨</Text>
            )}
          </View>
          <Text
            style={{
              fontSize: 11,
              fontWeight: highlightColor.startsWith('#') ? '700' : '500',
              color: highlightColor.startsWith('#')
                ? isDark
                  ? '#FFFFFF'
                  : '#052E24'
                : isDark
                  ? '#889591'
                  : '#4C5854',
            }}
          >
            Custom
          </Text>
        </Pressable>
      </View>

      {/* Custom Hex Input Form */}
      {showCustomInput && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 14,
            backgroundColor: isDark ? '#1C2B25' : '#FAFBF9',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: inputHex.startsWith('#') ? inputHex : '#3B82F6',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.1)',
            }}
          />
          <TextInput
            value={inputHex}
            onChangeText={(val) => {
              setInputHex(val)
              let clean = val.trim()
              if (!clean.startsWith('#')) clean = '#' + clean
              if (/^#[0-9A-Fa-f]{6}$/.test(clean) || /^#[0-9A-Fa-f]{3}$/.test(clean)) {
                setCustomHex(clean)
              }
            }}
            placeholder="#3B82F6"
            placeholderTextColor={isDark ? '#6B9985' : '#889591'}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={7}
            style={{
              flex: 1,
              height: 38,
              fontSize: 14,
              fontWeight: '600',
              color: isDark ? '#FFFFFF' : '#111A17',
              fontFamily: 'monospace',
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply custom color"
            onPress={handleApplyCustomHex}
            style={{
              backgroundColor: '#052E24',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 14,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Apply</Text>
          </Pressable>
        </View>
      )}

      {/* Live Highlight Preview Card */}
      <View
        style={{
          marginTop: 2,
          padding: 14,
          borderRadius: 16,
          backgroundColor: isDark ? '#111A17' : '#FFFFFF',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.6,
            color: isDark ? '#A6C2B5' : '#317054',
            textTransform: 'uppercase',
          }}
        >
          Preview in Document
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 20,
            color: isDark ? '#C5D4CD' : '#111A17',
          }}
        >
          Adult humans have{' '}
          <Text
            style={{
              backgroundColor: activeRgba,
              color: isDark ? '#FFFFFF' : '#111A17',
              fontWeight: '600',
              paddingHorizontal: 2,
              borderRadius: 2,
            }}
          >
            206 bones arranged into the axial
          </Text>{' '}
          and appendicular skeletons.
        </Text>
      </View>
    </View>
  )
}

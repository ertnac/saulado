import { forwardRef, useState, type ReactElement } from 'react'
import { Platform, Text, TextInput, useWindowDimensions, View } from 'react-native'
import type { BlankResult, AnsweringType } from '@saulado/shared'

import { useTokenColor } from '../stores/theme'

export const SLOT_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' })
const SLOT_PADDING = 24
export const SLOT_HEIGHT = 38
export const SLOT_FONT_SIZE = 15

interface BlankSlotProps {
  ordinal: number
  blankCount: number
  answerLength: number
  charWidth: number
  value: string
  result: BlankResult | null
  disabled: boolean
  isLastBlank: boolean
  answeringType: AnsweringType
  onFocus: () => void
  onChange: (value: string) => void
  onSubmit: () => void
}

export const BlankSlot = forwardRef<TextInput, BlankSlotProps>(function BlankSlot(
  {
    ordinal,
    blankCount,
    answerLength,
    charWidth,
    value,
    result,
    disabled,
    isLastBlank,
    answeringType,
    onFocus,
    onChange,
    onSubmit,
  },
  ref,
): ReactElement {
  const { width: screenWidth } = useWindowDimensions()
  const [isFocused, setIsFocused] = useState(false)
  const border = useTokenColor('--border')
  const primary = useTokenColor('--primary')
  const surface = useTokenColor('--surface')
  const surfaceMuted = useTokenColor('--surface-muted')
  const foreground = useTokenColor('--foreground')
  const muted = useTokenColor('--muted-foreground')

  const width = Math.min(answerLength * charWidth + SLOT_PADDING, screenWidth - 80)
  const position = `Blank ${String(ordinal + 1)} of ${String(blankCount)}`

  if (result) {
    const showCanonical = result.matchType !== 'exact'

    return (
      <View
        accessibilityLabel={`${position}: ${result.canonical}, ${
          result.correct
            ? result.matchType === 'typo'
              ? `correct — spelled ${result.canonical}`
              : 'correct'
            : `incorrect — the answer was ${result.canonical}`
        }`}
        style={{ width, height: SLOT_HEIGHT }}
        className={`mx-1 justify-center overflow-hidden rounded-lg border px-2.5 ${
          result.correct ? 'border-success/80 bg-success/15' : 'border-danger/80 bg-danger/15'
        }`}
      >
        <Text
          numberOfLines={1}
          style={{ fontFamily: SLOT_FONT, fontSize: SLOT_FONT_SIZE }}
          className={`font-semibold ${result.correct ? 'text-success' : 'text-danger'}`}
        >
          {showCanonical ? result.canonical : result.submitted}
        </Text>
      </View>
    )
  }

  return (
    <TextInput
      ref={ref}
      value={value}
      editable={!disabled}
      accessibilityLabel={position}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      spellCheck={false}
      showSoftInputOnFocus={answeringType !== 'multiple-choice'}
      onFocus={() => {
        setIsFocused(true)
        onFocus()
      }}
      onBlur={() => setIsFocused(false)}
      returnKeyType={isLastBlank ? 'done' : 'next'}
      submitBehavior={isLastBlank ? 'blurAndSubmit' : 'submit'}
      onSubmitEditing={onSubmit}
      onChangeText={onChange}
      selectionColor={primary}
      placeholderTextColor={muted}
      style={{
        width,
        height: SLOT_HEIGHT,
        fontFamily: SLOT_FONT,
        fontSize: SLOT_FONT_SIZE,
        color: foreground,
        borderColor: isFocused ? primary : border,
        backgroundColor: isFocused ? surface : surfaceMuted,
        borderWidth: isFocused ? 1.5 : 1,
        opacity: disabled ? 0.6 : 1,
        paddingVertical: 0,
        paddingHorizontal: 8,
        textAlignVertical: 'center',
      }}
      className="mx-1 rounded-lg"
    />
  )
})

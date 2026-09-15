import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { BlankResult, SessionCard, AnsweringType } from '@saulado/shared'
import { MultipleChoiceGrid } from './multiple-choice-grid'
import { VolumeIcon } from './icons'
import { useTheme } from '../stores/theme'

export const PARAGRAPH_FONT_SIZE = 18
export const LINE_HEIGHT = 28

interface StudyCardProps {
  card: SessionCard
  values: Record<number, string>
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  answeringType: AnsweringType
  onChange: (ordinal: number, value: string) => void
  onSubmit: (overrideValues?: Record<number, string>) => void
}

export function StudyCard({
  card,
  values,
  results,
  disabled,
  answeringType,
  onChange,
  onSubmit,
}: StudyCardProps): ReactElement {
  const { isDark } = useTheme()
  const [focusedOrdinal, setFocusedOrdinal] = useState(0)
  const inputRef = useRef<TextInput | null>(null)

  useEffect(() => {
    if (!results) {
      inputRef.current?.focus()
      setFocusedOrdinal(0)
    }
  }, [card.cardId, results])

  const handleSelectChoice = (option: string) => {
    if (disabled || !!results) return

    const nextValues = { ...values, [focusedOrdinal]: option }
    onChange(focusedOrdinal, option)

    const isLastBlank = focusedOrdinal === card.blankCount - 1
    if (isLastBlank) {
      onSubmit(nextValues)
    } else {
      const nextOrdinal = focusedOrdinal + 1
      setFocusedOrdinal(nextOrdinal)
    }
  }

  const byOrdinal = new Map(results?.map((result) => [result.ordinal, result]))

  // Category Tag & Concept Badge
  const categoryTag = card.tags?.[0] ? card.tags[0].toUpperCase() : 'CLINICAL INDICATION & EFFECT'
  const conceptTag = card.tags?.[1] || 'High Yield Concept'

  // Build readable prompt text from segments
  const promptText = card.segments
    .map((s) => (s.kind === 'text' ? s.text : '________'))
    .join('')
    .trim()

  const activeResult = byOrdinal.get(focusedOrdinal)

  return (
    <View style={{ gap: 16, width: '100%' }}>
      {/* ── 1. Question / Concept Card (Matching Images 1 & 2) ── */}
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#EEF2EE',
          backgroundColor: isDark ? '#111A17' : '#FFFFFF',
          padding: 22,
          gap: 14,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.2 : 0.04,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        {/* Top Header: Tag & Audio Icon */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: isDark ? '#A6C2B5' : '#317054',
            }}
          >
            {categoryTag}
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Audio pronunciation"
            hitSlop={8}
            activeOpacity={0.7}
          >
            <VolumeIcon color={isDark ? '#889591' : '#4C5854'} size={18} />
          </TouchableOpacity>
        </View>

        {/* Prompt Question Text */}
        <Text
          style={{
            fontSize: 19,
            fontWeight: '700',
            letterSpacing: -0.3,
            lineHeight: 28,
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          {promptText}
        </Text>

        {/* Concept Pill Badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: isDark ? 'rgba(49, 112, 84, 0.25)' : '#E8F3EE',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: isDark ? '#A6C2B5' : '#052E24',
              }}
            >
              {conceptTag}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 2A. Identification Input Section (Matching Image 1) ── */}
      {answeringType === 'identification' && (
        <View style={{ gap: 8, marginTop: 4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 2,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: isDark ? '#889591' : '#4C5854',
              }}
            >
              {card.blankCount > 1
                ? `Enter Answer for Blank ${focusedOrdinal + 1} of ${card.blankCount}`
                : 'Enter Drug Classification / Answer'}
            </Text>

            {card.blankCount > 1 && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {Array.from({ length: card.blankCount }).map((_, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setFocusedOrdinal(idx)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor:
                        focusedOrdinal === idx
                          ? '#317054'
                          : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : '#EEF2EE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: focusedOrdinal === idx ? '#FFFFFF' : isDark ? '#889591' : '#4C5854',
                      }}
                    >
                      {idx + 1}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Input Box with green border */}
          <View
            style={{
              height: 56,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: activeResult
                ? activeResult.correct
                  ? '#317054'
                  : '#EF4444'
                : '#317054',
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              paddingHorizontal: 18,
              justifyContent: 'center',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.2 : 0.03,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            <TextInput
              ref={inputRef}
              value={values[focusedOrdinal] ?? ''}
              onChangeText={(val) => onChange(focusedOrdinal, val)}
              placeholder="Type your answer here..."
              placeholderTextColor={isDark ? '#4C5854' : '#889591'}
              editable={!disabled && !results}
              returnKeyType={focusedOrdinal === card.blankCount - 1 ? 'done' : 'next'}
              onSubmitEditing={() => {
                if (focusedOrdinal === card.blankCount - 1) {
                  onSubmit()
                } else {
                  setFocusedOrdinal((prev) => prev + 1)
                }
              }}
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: isDark ? '#FFFFFF' : '#111A17',
              }}
            />
          </View>
        </View>
      )}

      {/* ── 2B. Multiple Choice Options Section (Matching Image 2) ── */}
      {answeringType === 'multiple-choice' && card.blankOptions && (
        <View style={{ gap: 6 }}>
          {card.blankCount > 1 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  color: isDark ? '#889591' : '#4C5854',
                }}
              >
                Options for Blank {focusedOrdinal + 1} of {card.blankCount}
              </Text>
            </View>
          )}
          <MultipleChoiceGrid
            options={card.blankOptions[focusedOrdinal] ?? []}
            selectedValue={values[focusedOrdinal] ?? ''}
            result={byOrdinal.get(focusedOrdinal) ?? null}
            onSelect={handleSelectChoice}
            disabled={disabled || !!results}
          />
        </View>
      )}
    </View>
  )
}

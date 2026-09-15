import { type ReactElement } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import type { BlankResult } from '@saulado/shared'
import { CheckIcon, CloseIcon } from './icons'
import { useTheme } from '../stores/theme'

interface MultipleChoiceGridProps {
  options: string[]
  selectedValue: string
  result?: BlankResult | null
  onSelect: (value: string) => void
  disabled: boolean
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function MultipleChoiceGrid({
  options,
  selectedValue,
  result,
  onSelect,
  disabled,
}: MultipleChoiceGridProps): ReactElement {
  const { isDark } = useTheme()

  const isGraded = result !== null && result !== undefined

  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {options.map((option, index) => {
        const isSelected = selectedValue === option
        const letter = OPTION_LETTERS[index] ?? String(index + 1)

        // Grading verdicts:
        const isCanonical =
          isGraded &&
          Boolean(result?.canonical) &&
          option.toLowerCase().trim() === result.canonical.toLowerCase().trim()

        const isSelectedWrong = isGraded && isSelected && !result?.correct
        const isUnselectedOther = isGraded && !isCanonical && !isSelected

        let backgroundColor = isDark ? '#111A17' : '#FFFFFF'
        let borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#EEF2EE'
        let borderWidth = 1
        let letterBg = isDark ? 'rgba(255, 255, 255, 0.08)' : '#EEF2EE'
        let letterColor = isDark ? '#FFFFFF' : '#111A17'
        let textColor = isDark ? '#FFFFFF' : '#111A17'

        if (isGraded) {
          if (isCanonical) {
            backgroundColor = isDark ? 'rgba(34, 197, 94, 0.16)' : '#E8F3EE'
            borderColor = '#317054'
            borderWidth = 1.5
            letterBg = '#317054'
            letterColor = '#FFFFFF'
            textColor = isDark ? '#FFFFFF' : '#052E24'
          } else if (isSelectedWrong) {
            backgroundColor = isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2'
            borderColor = '#EF4444'
            borderWidth = 1.5
            letterBg = '#EF4444'
            letterColor = '#FFFFFF'
            textColor = isDark ? '#FFFFFF' : '#991B1B'
          } else if (isUnselectedOther) {
            backgroundColor = isDark ? 'rgba(255, 255, 255, 0.02)' : '#FAFBF9'
            borderColor = isDark ? 'rgba(255, 255, 255, 0.04)' : '#F0F4F2'
            textColor = isDark ? '#4C5854' : '#889591'
          }
        } else if (isSelected) {
          backgroundColor = isDark ? 'rgba(49, 112, 84, 0.22)' : '#E8F3EE'
          borderColor = '#317054'
          borderWidth = 1.5
          letterBg = '#317054'
          letterColor = '#FFFFFF'
          textColor = isDark ? '#FFFFFF' : '#052E24'
        }

        return (
          <TouchableOpacity
            key={`${index}-${option}`}
            activeOpacity={0.75}
            disabled={disabled || isGraded}
            accessibilityRole="button"
            accessibilityLabel={`Option ${letter}: ${option}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              if (!disabled && !isGraded) {
                onSelect(option)
              }
            }}
            style={{
              width: '100%',
              minHeight: 56,
              borderRadius: 18,
              borderWidth,
              borderColor,
              backgroundColor,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: disabled && !isGraded ? 0.6 : 1,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingRight: 8,
              }}
            >
              {/* Circular Letter Badge (A, B, C, D) */}
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: letterBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: letterColor }}>
                  {letter}
                </Text>
              </View>

              {/* Option Text */}
              <Text
                numberOfLines={2}
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: isSelected ? '700' : '500',
                  color: textColor,
                  lineHeight: 21,
                }}
              >
                {option}
              </Text>
            </View>

            {/* Checkmark or Status indicator */}
            {isGraded ? (
              isCanonical ? (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#317054',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckIcon color="#FFFFFF" size={14} />
                </View>
              ) : isSelectedWrong ? (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#EF4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon color="#FFFFFF" size={14} />
                </View>
              ) : null
            ) : isSelected ? (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#317054' : '#E8F3EE',
                  borderWidth: isDark ? 0 : 1.5,
                  borderColor: '#317054',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckIcon color={isDark ? '#FFFFFF' : '#317054'} size={14} />
              </View>
            ) : null}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

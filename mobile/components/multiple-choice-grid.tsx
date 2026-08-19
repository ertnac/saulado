import { type ReactElement } from 'react'
import { Text, Pressable, View } from 'react-native'
import type { BlankResult } from '@saulado/shared'
import { CheckIcon, CloseIcon } from './icons'
import { useTokenColor } from '../stores/theme'

interface MultipleChoiceGridProps {
  options: string[]
  selectedValue: string
  result?: BlankResult | null
  onSelect: (value: string) => void
  disabled: boolean
}

export function MultipleChoiceGrid({
  options,
  selectedValue,
  result,
  onSelect,
  disabled,
}: MultipleChoiceGridProps): ReactElement {
  const successColor = useTokenColor('--success')
  const dangerColor = useTokenColor('--danger')

  const isGraded = result !== null && result !== undefined

  return (
    <View className="mt-6 flex-row flex-wrap gap-3">
      {options.map((option, index) => {
        const isSelected = selectedValue === option

        // Grading verdicts:
        // 1. Is this option the canonical correct answer?
        const isCanonical =
          isGraded &&
          Boolean(result?.canonical) &&
          option.toLowerCase().trim() === result.canonical.toLowerCase().trim()

        // 2. Did the user select this option and was it wrong?
        const isSelectedWrong = isGraded && isSelected && !result?.correct

        // 3. Unselected other distractors
        const isUnselectedOther = isGraded && !isCanonical && !isSelected

        let borderBgStyle = 'border-border bg-surface'
        let textStyle = 'text-foreground'

        if (isGraded) {
          if (isCanonical) {
            borderBgStyle = 'border-success bg-success/15'
            textStyle = 'text-success font-bold'
          } else if (isSelectedWrong) {
            borderBgStyle = 'border-danger bg-danger/15'
            textStyle = 'text-danger font-bold'
          } else if (isUnselectedOther) {
            borderBgStyle = 'border-border/30 bg-surface/30 opacity-40'
            textStyle = 'text-muted-foreground'
          }
        } else {
          if (isSelected) {
            borderBgStyle = 'border-primary bg-primary/10'
            textStyle = 'text-primary font-semibold'
          } else {
            borderBgStyle = 'border-border bg-surface'
            textStyle = 'text-foreground'
          }
        }

        return (
          <Pressable
            key={`${index}-${option}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: disabled || isGraded }}
            disabled={disabled || isGraded}
            onPress={() => {
              if (!disabled && !isGraded) {
                onSelect(option)
              }
            }}
            className={`
              flex-1 basis-[45%] rounded-xl border p-4 items-center justify-center min-h-[64px]
              ${borderBgStyle}
              ${disabled && !isGraded ? 'opacity-50' : 'opacity-100'}
            `}
          >
            <View className="flex-row items-center justify-center gap-1.5 px-1">
              {isCanonical && <CheckIcon color={successColor} size={18} />}
              {isSelectedWrong && <CloseIcon color={dangerColor} size={18} />}
              <Text className={`text-center font-medium ${textStyle}`}>{option}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

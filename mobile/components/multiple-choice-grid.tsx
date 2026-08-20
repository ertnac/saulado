import { type ReactElement } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
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

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

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
  const isAnyOptionLong = options.some((opt) => opt.length > 22)

  return (
    <View className="mt-4 gap-2.5">
      <View className="flex-row flex-wrap gap-2.5">
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

          let containerStyle = 'border-border/80 bg-surface shadow-xs'
          let letterBadgeStyle = 'bg-surface-muted border-border/70 text-muted-foreground'
          let textStyle = 'text-foreground font-medium'

          if (isGraded) {
            if (isCanonical) {
              containerStyle = 'border-success bg-success/12'
              letterBadgeStyle = 'bg-success text-success-foreground border-success'
              textStyle = 'text-success font-semibold'
            } else if (isSelectedWrong) {
              containerStyle = 'border-danger bg-danger/12'
              letterBadgeStyle = 'bg-danger text-white border-danger'
              textStyle = 'text-danger font-semibold'
            } else if (isUnselectedOther) {
              containerStyle = 'border-border/40 bg-surface/40 opacity-40'
              letterBadgeStyle = 'bg-transparent border-border/40 text-muted-foreground/50'
              textStyle = 'text-muted-foreground'
            }
          } else {
            if (isSelected) {
              containerStyle = 'border-primary bg-primary/8 shadow-xs'
              letterBadgeStyle = 'bg-primary text-primary-foreground border-primary'
              textStyle = 'text-primary font-semibold'
            } else {
              containerStyle = 'border-border bg-surface'
              letterBadgeStyle = 'bg-surface-muted border-border/60 text-muted-foreground'
              textStyle = 'text-foreground'
            }
          }

          return (
            <TouchableOpacity
              key={`${index}-${option}`}
              activeOpacity={0.75}
              disabled={disabled || isGraded}
              onPress={() => {
                if (!disabled && !isGraded) {
                  onSelect(option)
                }
              }}
              className={`
                ${isAnyOptionLong ? 'w-full basis-full' : 'flex-1 basis-[46%]'} min-h-[58px] rounded-2xl border p-3.5 flex-row items-center justify-between
                ${containerStyle}
                ${disabled && !isGraded ? 'opacity-50' : 'opacity-100'}
              `}
            >
              <View className="flex-1 flex-row items-center gap-2.5 pr-2">
                <View
                  className={`h-7 w-7 rounded-full border items-center justify-center ${letterBadgeStyle}`}
                >
                  <Text className="text-xs font-bold">{letter}</Text>
                </View>
                <Text className={`flex-1 text-sm ${textStyle}`} numberOfLines={2}>
                  {option}
                </Text>
              </View>

              {isCanonical && (
                <View className="h-6 w-6 rounded-full bg-success/20 items-center justify-center">
                  <CheckIcon color={successColor} size={14} />
                </View>
              )}
              {isSelectedWrong && (
                <View className="h-6 w-6 rounded-full bg-danger/20 items-center justify-center">
                  <CloseIcon color={dangerColor} size={14} />
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

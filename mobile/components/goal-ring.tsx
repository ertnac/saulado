import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTokenColor } from '../stores/theme'

/**
 * The daily goal as a ring, ported from `frontend/src/components/charts/GoalRing.tsx`.
 *
 * Same geometry, same copy, one platform substitution: the centre number is HTML
 * on top of the SVG on web, so here it is a `Text` in an absolutely-positioned
 * `View` — `react-native-svg`'s own `Text` would not flow or wrap like RN text.
 *
 * The ring is decorative (the number carries the information), so the whole
 * picture is hidden from screen readers rather than labelled.
 */
const SIZE = 72
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface GoalRingProps {
  value: number
  goal: number
  met: boolean
}

export function GoalRing({ value, goal, met }: GoalRingProps): ReactElement {
  const primary = useTokenColor('--primary')
  const success = useTokenColor('--success')
  const surfaceMuted = useTokenColor('--surface-muted')

  const fraction = goal <= 0 ? 1 : Math.min(1, value / goal)
  const offset = CIRCUMFERENCE * (1 - fraction)

  return (
    <View
      accessible
      accessibilityLabel={
        met
          ? 'Daily goal met.'
          : `${String(value)} of ${String(goal)} reviews today. ${String(Math.max(0, goal - value))} to go.`
      }
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-[72px] w-[72px]"
      >
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={surfaceMuted}
            strokeWidth={STROKE}
            fill="none"
          />
          {fraction > 0 && (
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={met ? success : primary}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}
            />
          )}
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-lg font-semibold tabular-nums text-foreground">{value}</Text>
        </View>
      </View>
    </View>
  )
}

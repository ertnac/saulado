import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import type { DayStat } from '@saulado/shared'
import { barHeightPercent } from '../lib/chart-scale'

/**
 * Seven days at a glance — a port of `frontend/src/components/charts/Sparkline.tsx`.
 *
 * Deliberately not the bar chart with a smaller `days` array. No axis, no
 * ceiling label, no correct/incorrect split: the dashboard's job is "did I study
 * this week", and every one of those would be answering a question the progress
 * screen exists to answer properly.
 *
 * A `View` grid rather than SVG. Seven rectangles are layout, not geometry, and
 * percentage heights inside a fixed-height row are exactly what Yoga is for.
 */
export function Sparkline({ days, label }: { days: DayStat[]; label: string }): ReactElement {
  const busiest = Math.max(0, ...days.map((day) => day.reviews))
  const total = days.reduce((sum, day) => sum + day.reviews, 0)
  const activeCount = days.filter((day) => day.reviews > 0).length

  return (
    <View className="gap-2">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-10 flex-row items-end gap-1"
      >
        {days.map((day) => (
          <View
            key={day.day}
            /*
              Idle days get a 4% stub rather than nothing. A row of bars with
              holes in it looks like a rendering failure, and "you did not study
              on Tuesday" is information worth showing rather than hiding.
            */
            style={{ height: `${Math.max(4, barHeightPercent(day.reviews, busiest))}%` }}
            className={`min-w-0 flex-1 rounded-sm ${
              day.reviews > 0 ? 'bg-success' : 'bg-surface-muted'
            }`}
          />
        ))}
      </View>

      <Text className="text-xs text-muted-foreground">
        {`${label}: ${String(total)} ${total === 1 ? 'review' : 'reviews'} over ${String(activeCount)} of the last ${String(days.length)} days.`}
      </Text>
    </View>
  )
}

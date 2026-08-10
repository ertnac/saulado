import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import type { DayStat } from '@saulado/shared'
import { barHeightPercent, niceCeiling, shortDate } from '../lib/chart-scale'
import { ChartEmpty, ChartFrame } from './chart-frame'

/**
 * Reviews per day — a port of `frontend/src/components/charts/BarChart.tsx`.
 *
 * A `<View>` grid, not SVG. The plan says these are "arguably easier here than
 * in CSS" and that holds: percentage heights inside a fixed-height flex row are
 * Yoga's native behaviour, where the web version needed `items-end` plus a
 * nested percentage to get the same thing.
 *
 * Each bar carries two figures at once. The pale outer bar is the day's reviews
 * against the ceiling; the solid inner bar is the share of those answered
 * correctly, measured **against the bar it sits in** rather than against the
 * plot — so a perfect day of 3 reviews is a short bar that is entirely filled,
 * not a short bar that looks like a failure.
 */
const MAX_TICKS = 7

interface BarChartProps {
  days: DayStat[]
  caption: string
  emptyMessage: string
}

export function BarChart({ days, caption, emptyMessage }: BarChartProps): ReactElement {
  const total = days.reduce((sum, day) => sum + day.reviews, 0)

  if (total === 0) return <ChartEmpty caption={caption} message={emptyMessage} />

  const ceiling = niceCeiling(Math.max(...days.map((day) => day.reviews)))
  const stride = Math.max(1, Math.ceil(days.length / MAX_TICKS))
  const correct = days.reduce((sum, day) => sum + day.correct, 0)
  const activeCount = days.filter((day) => day.reviews > 0).length

  return (
    <ChartFrame
      caption={caption}
      summary={`${String(total)} reviews over ${String(activeCount)} of ${String(days.length)} days, ${String(correct)} correct. Busiest day ${String(Math.max(...days.map((day) => day.reviews)))}. The filled part of each bar is the reviews answered correctly.`}
    >
      <View className="flex-row gap-2">
        {/* Y axis. Two labels, not five — the summary carries the totals. */}
        <View className="h-40 w-8 justify-between">
          <Text className="text-right text-[10px] tabular-nums text-muted-foreground">
            {ceiling}
          </Text>
          <Text className="text-right text-[10px] tabular-nums text-muted-foreground">0</Text>
        </View>

        <View className="min-w-0 flex-1">
          <View className="h-40 flex-row items-end gap-px border-b border-border">
            {days.map((day) => (
              <View
                key={day.day}
                style={{ height: `${barHeightPercent(day.reviews, ceiling)}%` }}
                className="min-w-0 flex-1 justify-end overflow-hidden rounded-t-sm bg-success/20"
              >
                <View
                  style={{
                    height: `${day.reviews > 0 ? Math.round((day.correct / day.reviews) * 100) : 0}%`,
                  }}
                  className="w-full rounded-t-sm bg-success"
                />
              </View>
            ))}
          </View>

          <View className="mt-1 flex-row gap-px">
            {days.map((day, index) => (
              <View key={day.day} className="min-w-0 flex-1">
                {/*
                  Anchored to the last day rather than the first: the right edge
                  is today, which is the label a reader looks for. Counting
                  strides from the left would leave today unlabelled whenever the
                  window length is not a multiple of the stride.
                */}
                {(days.length - 1 - index) % stride === 0 && (
                  <Text
                    numberOfLines={1}
                    className="text-[10px] tabular-nums text-muted-foreground"
                  >
                    {shortDate(day.day)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </ChartFrame>
  )
}

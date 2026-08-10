import type { ReactElement } from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { DayStat } from '@saulado/shared'
import { weekdayIndex } from '../lib/chart-scale'
import { ChartEmpty, ChartFrame } from './chart-frame'

/**
 * The contribution grid — a port of `frontend/src/components/charts/Heatmap.tsx`.
 *
 * **Intensity varies by lightness, not hue.** Five steps of one colour stay
 * distinguishable under every form of colour blindness, where a red-to-green
 * ramp would collapse for the ~8% of men who cannot separate the ends of it
 * (saulado-ux §1.3).
 *
 * The two helpers below are pure and were ported unchanged. Everything else is a
 * grid of 12pt squares, which is layout rather than geometry — no SVG involved.
 */

/** 0-4, where 0 is a day with no reviews. Relative to the busiest day in view. */
export function levelFor(reviews: number, busiest: number): number {
  if (reviews <= 0 || busiest <= 0) return 0

  const fraction = reviews / busiest
  if (fraction > 0.75) return 4
  if (fraction > 0.5) return 3
  if (fraction > 0.25) return 2
  return 1
}

/**
 * Groups days into calendar weeks, padded so every column has seven rows.
 *
 * The leading nulls are what put the first day in its real weekday row — a
 * window starting on a Wednesday has to start three cells down, or every square
 * in the grid sits under the wrong letter.
 */
export function toWeeks(days: DayStat[]): (DayStat | null)[][] {
  const first = days[0]
  if (first === undefined) return []

  const cells: (DayStat | null)[] = [...Array<null>(weekdayIndex(first.day)).fill(null), ...days]
  const weeks: (DayStat | null)[][] = []

  for (let start = 0; start < cells.length; start += 7) {
    const week = cells.slice(start, start + 7)
    // Pad the final column too, so the grid stays rectangular.
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  return weeks
}

const LEVEL_CLASSES = [
  'bg-surface-muted',
  'bg-success/30',
  'bg-success/50',
  'bg-success/75',
  'bg-success',
]

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface HeatmapProps {
  days: DayStat[]
  caption: string
  emptyMessage: string
}

export function Heatmap({ days, caption, emptyMessage }: HeatmapProps): ReactElement {
  const active = days.filter((day) => day.reviews > 0)

  if (active.length === 0) return <ChartEmpty caption={caption} message={emptyMessage} />

  const busiest = Math.max(...active.map((day) => day.reviews))
  const weeks = toWeeks(days)

  return (
    <ChartFrame
      caption={caption}
      summary={`${String(active.length)} ${active.length === 1 ? 'day' : 'days'} studied out of ${String(days.length)}. Busiest day ${String(busiest)} reviews. Darker means more reviews.`}
    >
      {/*
        Horizontal scroll rather than shrinking the squares. A year is 53 columns
        and 375pt cannot hold them at a legible size; squeezing them to fit is how
        a heatmap becomes a grey smear.
      */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-1 pb-1">
          <View className="gap-1 pr-1">
            {WEEKDAY_LABELS.map((label, row) => (
              <View key={row} className="h-3 justify-center">
                {/*
                  Alternate rows only — seven single letters stacked at 9pt is a
                  column of noise, and Mon/Wed/Fri is enough to orient by.
                */}
                <Text className="text-[9px] leading-none text-muted-foreground">
                  {row % 2 === 1 ? label : ''}
                </Text>
              </View>
            ))}
          </View>

          {weeks.map((week, index) => (
            <View key={index} className="gap-1">
              {week.map((day, row) => (
                <View
                  key={row}
                  className={
                    day === null
                      ? 'h-3 w-3'
                      : `h-3 w-3 rounded-sm ${LEVEL_CLASSES[levelFor(day.reviews, busiest)] ?? ''}`
                  }
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="flex-row items-center gap-1.5">
        <Text className="text-[10px] text-muted-foreground">Less</Text>
        {LEVEL_CLASSES.map((className, level) => (
          <View key={level} className={`h-3 w-3 rounded-sm ${className}`} />
        ))}
        <Text className="text-[10px] text-muted-foreground">More</Text>
      </View>
    </ChartFrame>
  )
}

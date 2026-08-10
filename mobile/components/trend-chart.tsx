import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import Svg, { Line, Polyline } from 'react-native-svg'
import type { DayStat } from '@saulado/shared'
import { accuracyPercent } from '@saulado/shared'
import { shortDate } from '../lib/chart-scale'
import { ChartEmpty, ChartFrame } from './chart-frame'
import { useTokenColor } from '../stores/theme'

/**
 * Accuracy over time — a port of `frontend/src/components/charts/TrendChart.tsx`.
 *
 * The one chart that is genuinely SVG, because a polyline through N points is
 * genuinely geometry. `preserveAspectRatio="none"` lets it stretch to any
 * container width and `vectorEffect="non-scaling-stroke"` stops the stroke
 * thickening as it does — the pair is what makes a fixed `viewBox` behave
 * responsively without measuring the container.
 *
 * **The line breaks on rest days.** `accuracyPercent` returns `null` for a day
 * with no reviews, and this draws that as a gap rather than joining across it or
 * plotting it at 0%. A line dropping to the floor every weekend would show a
 * cliff the user never fell off; a line joined straight across invents a
 * measurement that was never taken. A gap is the only honest option.
 */

/** Percent, so the y axis is fixed rather than data-dependent. */
const Y_MAX = 100

interface Point {
  index: number
  accuracy: number
}

/**
 * Splits the series into runs of consecutive days that have an accuracy.
 *
 * Each run is drawn as its own polyline, which is what produces the gaps.
 */
export function segments(days: DayStat[]): Point[][] {
  const runs: Point[][] = []
  let run: Point[] = []

  days.forEach((day, index) => {
    const accuracy = accuracyPercent(day.correct, day.reviews)

    if (accuracy === null) {
      if (run.length > 0) runs.push(run)
      run = []
      return
    }

    run.push({ index, accuracy })
  })

  if (run.length > 0) runs.push(run)
  return runs
}

interface TrendChartProps {
  days: DayStat[]
  caption: string
  emptyMessage: string
}

export function TrendChart({ days, caption, emptyMessage }: TrendChartProps): ReactElement {
  const success = useTokenColor('--success')
  const border = useTokenColor('--border')

  const runs = segments(days)

  if (runs.length === 0) return <ChartEmpty caption={caption} message={emptyMessage} />

  // Guard the single-day window: dividing by `length - 1` would be a divide by
  // zero, and one point has no line to draw anyway.
  const span = Math.max(1, days.length - 1)
  const x = (index: number): number => (index / span) * 100
  const y = (accuracy: number): number => Y_MAX - accuracy

  const studied = days.filter((day) => day.reviews > 0)
  const reviews = studied.reduce((sum, day) => sum + day.reviews, 0)
  const correct = studied.reduce((sum, day) => sum + day.correct, 0)
  const overall = accuracyPercent(correct, reviews)

  return (
    <ChartFrame
      caption={caption}
      summary={`${overall === null ? 'No' : `${String(overall)}%`} accuracy over ${String(studied.length)} ${studied.length === 1 ? 'day' : 'days'} of study, ${shortDate(days[0]?.day ?? '')} to ${shortDate(days.at(-1)?.day ?? '')}. Days with no reviews leave a gap rather than a zero — a rest day is not a day of wrong answers.`}
    >
      <View className="flex-row gap-2">
        <View className="h-40 w-8 justify-between">
          <Text className="text-right text-[10px] tabular-nums text-muted-foreground">100%</Text>
          <Text className="text-right text-[10px] tabular-nums text-muted-foreground">50%</Text>
          <Text className="text-right text-[10px] tabular-nums text-muted-foreground">0%</Text>
        </View>

        <View className="min-w-0 flex-1">
          <View className="h-40 border-b border-border">
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 100 ${String(Y_MAX)}`}
              preserveAspectRatio="none"
            >
              {/* Midline. A reference at 50% is what makes a slope readable. */}
              <Line
                x1={0}
                y1={y(50)}
                x2={100}
                y2={y(50)}
                stroke={border}
                strokeWidth={1}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />

              {runs.map((run) => {
                const first = run[0]
                if (first === undefined) return null

                // A one-day run has no line — a two-point polyline is the
                // minimum that draws anything. Rendered as a round-capped dot so
                // a single day of study in the window is still visible rather
                // than silently missing.
                if (run.length === 1) {
                  return (
                    <Line
                      key={first.index}
                      x1={x(first.index)}
                      y1={y(first.accuracy)}
                      x2={x(first.index)}
                      y2={y(first.accuracy)}
                      stroke={success}
                      strokeWidth={6}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                }

                return (
                  <Polyline
                    key={first.index}
                    points={run
                      .map((point) => `${String(x(point.index))},${String(y(point.accuracy))}`)
                      .join(' ')}
                    fill="none"
                    stroke={success}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </Svg>
          </View>

          <View className="mt-1 flex-row justify-between">
            <Text className="text-[10px] tabular-nums text-muted-foreground">
              {shortDate(days[0]?.day ?? '')}
            </Text>
            <Text className="text-[10px] tabular-nums text-muted-foreground">
              {shortDate(days.at(-1)?.day ?? '')}
            </Text>
          </View>
        </View>
      </View>
    </ChartFrame>
  )
}

import type { ReactElement } from 'react'
import type { DayStat } from '@saulado/shared'
import { accuracyPercent } from '@saulado/shared'
import { motion } from 'framer-motion'
import { useDrawOn } from '@/components/motion/useDrawOn'
import { DUR, EASE } from '@/lib/motion'
import { ChartEmpty, ChartFigure } from './ChartFigure'
import { longDate, shortDate } from './scale'

/**
 * Accuracy over time (plan §5.2).
 *
 * The one chart that is genuinely SVG, because a polyline through N points is
 * genuinely geometry (ADR 0002 §5). `preserveAspectRatio="none"` lets it stretch
 * to any container width, and `vectorEffect="non-scaling-stroke"` stops the
 * stroke thickening as it does — the pair is what makes a fixed `viewBox` behave
 * responsively without a resize observer.
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
function segments(days: DayStat[]): Point[][] {
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
  const runs = segments(days)
  const drawOn = useDrawOn()

  const table = {
    headers: ['Day', 'Accuracy', 'Reviews'],
    rows: days.map((day) => {
      const accuracy = accuracyPercent(day.correct, day.reviews)
      return [
        longDate(day.day),
        accuracy === null ? 'No reviews' : `${String(accuracy)}%`,
        String(day.reviews),
      ]
    }),
  }

  if (runs.length === 0) {
    return (
      <ChartFigure caption={caption} table={table}>
        <ChartEmpty>{emptyMessage}</ChartEmpty>
      </ChartFigure>
    )
  }

  // Guard the single-day window: dividing by `length - 1` would be a divide by
  // zero, and one point has no line to draw anyway.
  const span = Math.max(1, days.length - 1)
  const x = (index: number): number => (index / span) * 100
  const y = (accuracy: number): number => Y_MAX - accuracy

  return (
    <ChartFigure
      caption={caption}
      description="Days with no reviews leave a gap rather than a zero — a rest day is not a day of wrong answers."
      table={table}
    >
      <div className="flex gap-2">
        <div className="flex h-40 w-8 flex-col justify-between text-right text-[10px] tabular-nums text-muted-foreground">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 100 ${String(Y_MAX)}`}
            preserveAspectRatio="none"
            className="h-40 w-full overflow-visible border-b border-border"
            role="presentation"
          >
            {/* Midline. A reference at 50% is what makes a slope readable. */}
            <line
              x1="0"
              y1={y(50)}
              x2="100"
              y2={y(50)}
              className="stroke-border"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />

            {runs.map((run) => {
              const first = run[0]
              if (first === undefined) return null

              // A one-day run has no line — a two-point polyline is the minimum
              // that draws anything. Rendered as a dot so a single day of study
              // in the window is still visible rather than silently missing.
              if (run.length === 1) {
                return (
                  <motion.line
                    key={first.index}
                    x1={x(first.index)}
                    y1={y(first.accuracy)}
                    x2={x(first.index)}
                    y2={y(first.accuracy)}
                    className="stroke-success"
                    strokeWidth="6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    /*
                      A fade, not a `pathLength` draw: this line's two endpoints are
                      the same point, so it has no length to draw along. Fading is
                      also the only enter animation that leaves the dot at its exact
                      plotted position at every frame.
                    */
                    initial={drawOn ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: DUR.slow, ease: EASE }}
                  />
                )
              }

              return (
                <motion.polyline
                  key={first.index}
                  points={run
                    .map((point) => `${String(x(point.index))},${String(y(point.accuracy))}`)
                    .join(' ')}
                  fill="none"
                  className="stroke-success"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  /*
                    Drawn left to right along its own length. `EASE` rather than
                    `EASE_SQUISH`: overshoot on a data mark would push the line past
                    the last measured point, inventing a reading for a day that has
                    not happened.
                  */
                  initial={drawOn ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: DUR.page, ease: EASE }}
                />
              )
            })}
          </svg>

          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{shortDate(days[0]?.day ?? '')}</span>
            <span>{shortDate(days.at(-1)?.day ?? '')}</span>
          </div>
        </div>
      </div>
    </ChartFigure>
  )
}

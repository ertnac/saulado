import type { ReactElement } from 'react'
import type { DayStat } from '@saulado/shared'
import { accuracyPercent } from '@saulado/shared'
import { ChartEmpty, ChartFigure } from './ChartFigure'
import { barHeightPercent, longDate, niceCeiling, shortDate } from './scale'

/**
 * Reviews per day (plan §5.2).
 *
 * HTML rather than SVG — see ADR 0002 §5. A row of flex children with
 * percentage heights is responsive at any width with no `viewBox` arithmetic,
 * and the axis labels beside it render at their natural size rather than being
 * scaled by an SVG transform.
 *
 * Each bar is stacked: the filled portion is the reviews that were correct, the
 * remainder is the rest. That puts volume and accuracy in one shape instead of
 * making the user read a second chart to find out whether a tall day went well.
 * The colour split is a *redundant* encoding — every number in it is in the
 * table underneath (ADR 0002 §4).
 */

/** Axis ticks, capped. Thirty labels under a 30-day chart is a grey smear. */
const MAX_TICKS = 7

interface BarChartProps {
  days: DayStat[]
  caption: string
  /** What to say when the window is genuinely empty rather than all-zero. */
  emptyMessage: string
}

export function BarChart({ days, caption, emptyMessage }: BarChartProps): ReactElement {
  const total = days.reduce((sum, day) => sum + day.reviews, 0)

  const table = {
    headers: ['Day', 'Reviews', 'Correct', 'Accuracy'],
    rows: days.map((day) => {
      const accuracy = accuracyPercent(day.correct, day.reviews)
      return [
        longDate(day.day),
        String(day.reviews),
        String(day.correct),
        // "No reviews" rather than "0%" — a rest day is not a day of total
        // failure, and `accuracyPercent` returns null precisely so this
        // distinction survives to the point of display.
        accuracy === null ? 'No reviews' : `${String(accuracy)}%`,
      ]
    }),
  }

  if (total === 0) {
    return (
      <ChartFigure caption={caption} table={table}>
        <ChartEmpty>{emptyMessage}</ChartEmpty>
      </ChartFigure>
    )
  }

  const ceiling = niceCeiling(Math.max(...days.map((day) => day.reviews)))
  const stride = Math.max(1, Math.ceil(days.length / MAX_TICKS))

  return (
    <ChartFigure
      caption={caption}
      description={`Peak ${String(ceiling)} in a day. The filled part of each bar is the reviews answered correctly.`}
      table={table}
    >
      <div className="flex gap-2">
        {/* Y axis. Two labels, not five — the table has the exact numbers. */}
        <div className="flex h-40 w-8 flex-col justify-between text-right text-[10px] tabular-nums text-muted-foreground">
          <span>{ceiling}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex h-40 items-end gap-px border-b border-border">
            {days.map((day) => (
              <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t-sm bg-muted"
                  style={{ height: `${String(barHeightPercent(day.reviews, ceiling))}%` }}
                >
                  {/*
                    Nested so the correct portion is measured against the bar it
                    sits in, not against the plot. `h-full` on a zero-height
                    parent stays zero, which is the behaviour we want on an idle
                    day.
                  */}
                  <div
                    className="w-full rounded-t-sm bg-success"
                    style={{
                      height: `${String(day.reviews > 0 ? Math.round((day.correct / day.reviews) * 100) : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-1 flex gap-px">
            {days.map((day, index) => (
              <div
                key={day.day}
                className="min-w-0 flex-1 text-[10px] tabular-nums text-muted-foreground"
              >
                {/*
                  Anchored to the last day rather than the first: the right edge
                  is today, which is the label a reader looks for. Counting
                  strides from the left would leave today unlabelled whenever the
                  window length is not a multiple of the stride.
                */}
                {(days.length - 1 - index) % stride === 0 ? (
                  <span className="block truncate">{shortDate(day.day)}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ChartFigure>
  )
}

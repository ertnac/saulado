import type { ReactElement } from 'react'
import type { DayStat } from '@saulado/shared'
import { barHeightPercent, longDate } from './scale'

/**
 * The seven-day sparkline on the dashboard (plan §5.1).
 *
 * Smaller than {@link BarChart} in every sense: no axis, no ceiling label, no
 * correct/incorrect split. It answers one question — "have I been at this?" — and
 * a reader who wants the numbers has the progress page a click away.
 *
 * Still carries a table, because a picture nobody can read is not a shortcut, it
 * is an omission. `ChartFigure` is not reused here only because this has no
 * caption of its own; it sits under a heading the dashboard already provides.
 */

interface SparklineProps {
  days: DayStat[]
  /** Read out in place of the bars. */
  label: string
}

export function Sparkline({ days, label }: SparklineProps): ReactElement {
  const busiest = Math.max(0, ...days.map((day) => day.reviews))
  const total = days.reduce((sum, day) => sum + day.reviews, 0)

  return (
    <div className="space-y-1.5">
      <div className="flex h-10 items-end gap-1" aria-hidden="true">
        {days.map((day) => (
          <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div
              title={`${longDate(day.day)}: ${String(day.reviews)} reviews`}
              className={`w-full rounded-sm ${day.reviews > 0 ? 'bg-success' : 'bg-surface-muted'}`}
              /*
                Idle days get a 4% stub rather than nothing. A row of bars with
                holes in it looks like a rendering failure; a flat floor reads as
                a quiet day, which is what it was. The colour carries which is
                which, and the table carries the number.
              */
              style={{ height: `${String(Math.max(4, barHeightPercent(day.reviews, busiest)))}%` }}
            />
          </div>
        ))}
      </div>

      <p className="sr-only">
        {label}: {total} {total === 1 ? 'review' : 'reviews'} over{' '}
        {days.filter((day) => day.reviews > 0).length} of the last {days.length} days.
      </p>
    </div>
  )
}

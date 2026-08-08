import type { ReactElement } from 'react'
import type { DayStat } from '@saulado/shared'
import { ChartEmpty, ChartFigure } from './ChartFigure'
import { longDate, weekdayIndex } from './scale'

/**
 * The contribution heatmap (plan §5.2).
 *
 * A grid of weeks, one column each, Sunday at the top. Its job is not precision
 * — you cannot read a count off a square — but shape: whether the habit is daily
 * or bursty, and how long the gaps run. That is a question a bar chart of 365
 * days answers badly and this answers at a glance.
 *
 * **Intensity varies by lightness, not hue.** The five levels are one colour at
 * increasing opacity, so the ordering survives every form of colour blindness —
 * a red-to-green scale would collapse to a flat field for a deuteranope. The
 * count itself is in the table (`ChartFigure`) and in each cell's `<title>`.
 */

const LEVEL_CLASSES = [
  'bg-surface-muted',
  'bg-success/30',
  'bg-success/50',
  'bg-success/75',
  'bg-success',
] as const

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/**
 * Which of the five shades a day earns, by quartile of the busiest day.
 *
 * Relative rather than absolute because "a busy day" means twenty reviews for
 * one user and three hundred for another, and a fixed scale would render the
 * first user's best week as uniformly empty. Any day with a single review gets
 * at least level 1 — studied and not studied must never look the same.
 */
export function levelFor(reviews: number, busiest: number): number {
  if (reviews <= 0 || busiest <= 0) return 0

  const fraction = reviews / busiest
  if (fraction > 0.75) return 4
  if (fraction > 0.5) return 3
  if (fraction > 0.25) return 2
  return 1
}

/**
 * Splits a dense day series into week columns.
 *
 * The first column is padded with nulls so the first real day sits on its true
 * weekday row. Without the padding every square would be one row off, and a
 * heatmap whose rows do not mean what the labels say is worse than none.
 */
export function toWeeks(days: DayStat[]): (DayStat | null)[][] {
  const first = days[0]
  if (first === undefined) return []

  const cells: (DayStat | null)[] = [...Array<null>(weekdayIndex(first.day)).fill(null), ...days]

  const weeks: (DayStat | null)[][] = []
  for (let start = 0; start < cells.length; start += 7) {
    const week = cells.slice(start, start + 7)
    // Pad the final column too, so the grid stays rectangular and the last week
    // does not stretch its squares to fill the gap.
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  return weeks
}

interface HeatmapProps {
  days: DayStat[]
  caption: string
  emptyMessage: string
}

export function Heatmap({ days, caption, emptyMessage }: HeatmapProps): ReactElement {
  const active = days.filter((day) => day.reviews > 0)

  const table = {
    headers: ['Day', 'Reviews'],
    // Active days only. A year of "0" rows is 365 lines of nothing for a screen
    // reader to walk through, and the bar chart above already carries the dense
    // series for anyone who needs every day.
    rows: active.map((day) => [longDate(day.day), String(day.reviews)]),
  }

  if (active.length === 0) {
    return (
      <ChartFigure caption={caption} table={table}>
        <ChartEmpty>{emptyMessage}</ChartEmpty>
      </ChartFigure>
    )
  }

  const busiest = Math.max(...active.map((day) => day.reviews))
  const weeks = toWeeks(days)

  return (
    <ChartFigure
      caption={caption}
      description={`${String(active.length)} ${active.length === 1 ? 'day' : 'days'} studied. Darker means more reviews.`}
      table={table}
    >
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col gap-1 pr-1">
          {WEEKDAY_LABELS.map((label, row) => (
            <span
              key={row}
              className="flex h-3 items-center text-[9px] leading-none text-muted-foreground"
            >
              {/* Alternate rows only — seven single letters stacked at 9px is a
                  column of noise, and Mon/Wed/Fri is enough to orient by. */}
              {row % 2 === 1 ? label : ''}
            </span>
          ))}
        </div>

        {weeks.map((week, index) => (
          <div key={index} className="flex shrink-0 flex-col gap-1">
            {week.map((day, row) =>
              day === null ? (
                <span key={row} className="h-3 w-3" />
              ) : (
                <span
                  key={row}
                  /*
                    A native tooltip for pointer users. Not an accessibility
                    affordance — this subtree is aria-hidden and hover does not
                    exist on touch — the table is what carries these numbers to
                    everyone else.
                  */
                  title={`${longDate(day.day)}: ${String(day.reviews)} reviews`}
                  className={`h-3 w-3 rounded-sm ${LEVEL_CLASSES[levelFor(day.reviews, busiest)] ?? ''}`}
                />
              ),
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        {LEVEL_CLASSES.map((className, level) => (
          <span key={level} className={`h-3 w-3 rounded-sm ${className}`} />
        ))}
        <span>More</span>
      </div>
    </ChartFigure>
  )
}

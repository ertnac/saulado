import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import {
  PROGRESS_RANGES,
  accuracyPercent,
  type ProgressRange,
  type SetProgress,
} from '@saulado/shared'
import { buttonClass } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart } from '@/components/charts/BarChart'
import { Heatmap } from '@/components/charts/Heatmap'
import { TrendChart } from '@/components/charts/TrendChart'
import { cn } from '@/lib/utils'
import { useProgress } from './queries'

/**
 * The progress page (plan §5.2).
 *
 * Four views of the same window: volume over time, accuracy over time, the shape
 * of the habit, and which sets the work went into. They are four because each
 * answers a question the others answer badly — a bar chart cannot show accuracy,
 * an accuracy line cannot show effort, and neither shows *where* the effort went.
 *
 * The rule that governs all of them: **a day with no reviews is a rest day, not
 * a failure.** It shows as a zero bar, a gap in the trend line, and an unfilled
 * heatmap square — never as 0% accuracy, which would be a claim that the user
 * got everything wrong.
 */

const RANGE_LABELS: Record<ProgressRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '365d': 'A year',
}

/**
 * The range switcher.
 *
 * A radio group, not a row of buttons. The ranges are mutually exclusive and one
 * is always chosen, which is exactly what a radio group means — a screen reader
 * announces "30 days, selected, 2 of 4" instead of four unrelated buttons, and
 * arrow-key navigation comes free.
 */
function RangeSwitcher({
  value,
  onChange,
}: {
  value: ProgressRange
  onChange: (range: ProgressRange) => void
}): ReactElement {
  return (
    <fieldset>
      <legend className="sr-only">Time range</legend>
      <div className="flex flex-wrap gap-1 rounded-md border border-border p-1">
        {PROGRESS_RANGES.map((range) => (
          <label
            key={range}
            className={cn(
              'cursor-pointer rounded px-3 py-1.5 text-sm font-medium',
              // The selected state is carried by background *and* weight, not
              // by colour alone.
              value === range
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <input
              type="radio"
              name="progress-range"
              value={range}
              checked={value === range}
              onChange={() => {
                onChange(range)
              }}
              className="sr-only"
            />
            {RANGE_LABELS[range]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}): ReactElement {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint !== undefined && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * The per-set table.
 *
 * A real `<table>`, not a grid of divs — it is tabular data, the header cells
 * are what let a screen reader say "Accuracy, 92%" instead of just "92%", and
 * that association is not something ARIA can retrofit convincingly.
 */
function PerSetTable({ sets }: { sets: SetProgress[] }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Reviews by set over the selected range</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">
              Set
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Reviews
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Accuracy
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Cards seen
            </th>
          </tr>
        </thead>
        <tbody>
          {sets.map((set) => {
            const accuracy = accuracyPercent(set.correct, set.reviews)

            return (
              <tr key={set.studySetId} className="border-b border-border last:border-0">
                <th scope="row" className="max-w-[16rem] truncate py-2.5 pr-4 font-medium">
                  <Link
                    to={`/sets/${set.studySetId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {set.title}
                  </Link>
                </th>
                <td className="py-2.5 pr-4 text-right tabular-nums">{set.reviews}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {accuracy === null ? '—' : `${String(accuracy)}%`}
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                  {set.cardsStudied} of {set.cardCount}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The never-studied state.
 *
 * Deliberately not four empty charts. A user who has never studied has no
 * progress to show, and rendering the scaffolding of a page that would describe
 * it tells them only that they are missing something.
 */
function NothingYet(): ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <p className="font-medium">No reviews yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Once you have studied, this page tracks how much you review, how accurate you are, and which
        sets the time goes into.
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-5' })} to="/study">
        Start studying
      </Link>
    </div>
  )
}

export function ProgressPage(): ReactElement {
  const [range, setRange] = useState<ProgressRange>('30d')
  const progress = useProgress(range)
  const data = progress.data

  const accuracy =
    data === undefined ? null : accuracyPercent(data.totals.correct, data.totals.reviews)

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="mt-1 text-muted-foreground">How your reviews have gone over time.</p>
        </div>

        <RangeSwitcher value={range} onChange={setRange} />
      </header>

      {progress.isPending && (
        <div className="space-y-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}

      {progress.isError && (
        <div className="rounded-lg border border-dashed border-border p-5">
          <p className="text-sm text-muted-foreground">
            Could not load your progress. Studying still works.
          </p>
          <Link className={buttonClass({ className: 'mt-4' })} to="/study">
            Go to study
          </Link>
        </div>
      )}

      {data !== undefined &&
        // `totals.reviews` rather than `days.length` — the series is always dense
        // and therefore always non-empty, so its length says nothing about
        // whether there is anything to show.
        (data.totals.reviews === 0 ? (
          <NothingYet />
        ) : (
          <>
            <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryStat label="Reviews" value={String(data.totals.reviews)} />
              <SummaryStat
                label="Accuracy"
                value={accuracy === null ? '—' : `${String(accuracy)}%`}
                hint={`${String(data.totals.correct)} fully correct`}
              />
              <SummaryStat
                label="Days studied"
                value={String(data.totals.activeDays)}
                hint={`of ${String(data.days.length)}`}
              />
              <SummaryStat
                label="Streak"
                value={data.streak.current === 1 ? '1 day' : `${String(data.streak.current)} days`}
                hint={
                  data.streak.longest > 0 ? `Longest ${String(data.streak.longest)}` : undefined
                }
              />
            </section>

            <section className="space-y-8 rounded-lg border border-border p-5">
              <BarChart
                days={data.days}
                caption="Reviews per day"
                emptyMessage="No reviews in this range. Try a longer one."
              />

              <TrendChart
                days={data.days}
                caption="Accuracy"
                emptyMessage="No reviews in this range yet."
              />
            </section>

            <section className="rounded-lg border border-border p-5">
              <Heatmap
                days={data.days}
                caption="Study days"
                emptyMessage="No study days in this range."
              />
            </section>

            <section aria-labelledby="per-set-heading" className="space-y-3">
              <h2 id="per-set-heading" className="text-sm font-medium uppercase tracking-wide">
                By set
              </h2>

              {data.perSet.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No sets were studied in this range.
                </p>
              ) : (
                <PerSetTable sets={data.perSet} />
              )}
            </section>
          </>
        ))}
    </div>
  )
}

import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import {
  PROGRESS_RANGES,
  accuracyPercent,
  type ProgressRange,
  type SetProgress,
} from '@saulado/shared'
import { buttonClass } from '@/components/ui/button'
import { Card, CardFigure, CardLabel } from '@/components/ui/card'
import { segmentClass } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart } from '@/components/charts/BarChart'
import { Heatmap } from '@/components/charts/Heatmap'
import { TrendChart } from '@/components/charts/TrendChart'
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
      <div className="flex flex-wrap gap-1 rounded-full bg-surface-muted p-1">
        {PROGRESS_RANGES.map((range) => (
          <label
            key={range}
            className={segmentClass(
              value === range,
              // The radio inside is `sr-only`, so the ring has to be borrowed on
              // to its label or the group has no visible focus at all.
              'cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
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
    <Card className="p-4">
      <CardLabel>{label}</CardLabel>
      <CardFigure>{value}</CardFigure>
      {hint !== undefined && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </Card>
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
            <th scope="col" className="px-3 py-2.5 font-medium">
              Set
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Reviews
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Accuracy
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Cards seen
            </th>
          </tr>
        </thead>
        <tbody>
          {sets.map((set) => {
            const accuracy = accuracyPercent(set.correct, set.reviews)

            return (
              <tr
                key={set.studySetId}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-muted"
              >
                <th scope="row" className="max-w-[16rem] truncate px-3 py-3 font-medium">
                  <Link
                    to={`/sets/${set.studySetId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {set.title}
                  </Link>
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{set.reviews}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {accuracy === null ? '—' : `${String(accuracy)}%`}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
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
    <Card tone="dashed" className="p-8 text-center">
      <p className="font-medium">No reviews yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Once you have studied, this page tracks how much you review, how accurate you are, and which
        sets the time goes into.
      </p>
      <Link className={buttonClass({ size: 'lg', className: 'mt-5' })} to="/study">
        Start studying
      </Link>
    </Card>
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
      <PageHeader
        title="Progress"
        description="How your reviews have gone over time."
        actions={<RangeSwitcher value={range} onChange={setRange} />}
        className="mb-0"
      />

      {progress.isPending && (
        <div className="space-y-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}

      {progress.isError && (
        <Card tone="dashed" className="p-5">
          <p className="text-sm text-muted-foreground">
            Could not load your progress. Studying still works.
          </p>
          <Link className={buttonClass({ className: 'mt-4' })} to="/study">
            Go to study
          </Link>
        </Card>
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

            <Card as="section" className="space-y-8 p-5">
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
            </Card>

            <Card as="section" className="p-5">
              <Heatmap
                days={data.days}
                caption="Study days"
                emptyMessage="No study days in this range."
              />
            </Card>

            <section aria-labelledby="per-set-heading" className="space-y-3">
              <h2 id="per-set-heading" className="text-base font-semibold tracking-tight">
                By set
              </h2>

              {data.perSet.length === 0 ? (
                <Card tone="dashed" className="p-5">
                  <p className="text-sm text-muted-foreground">
                    No sets were studied in this range.
                  </p>
                </Card>
              ) : (
                <Card className="p-1.5">
                  <PerSetTable sets={data.perSet} />
                </Card>
              )}
            </section>
          </>
        ))}
    </div>
  )
}

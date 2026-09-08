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
import { BarChart } from '@/components/charts/BarChart'
import { Heatmap } from '@/components/charts/Heatmap'
import { TrendChart } from '@/components/charts/TrendChart'
import { useProgress } from './queries'

const RANGE_LABELS: Record<ProgressRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '365d': 'A year',
}

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

export function ProgressSection({ showHeader = true }: { showHeader?: boolean }): ReactElement {
  const [range, setRange] = useState<ProgressRange>('30d')
  const progress = useProgress(range)
  const data = progress.data

  const accuracy =
    data === undefined ? null : accuracyPercent(data.totals.correct, data.totals.reviews)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {showHeader && (
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Study Progress & Stats
            </h2>
            <p className="text-xs text-muted-foreground">
              Review volume, accuracy, and streak performance over time.
            </p>
          </div>
        )}
        <div className="sm:ml-auto">
          <RangeSwitcher value={range} onChange={setRange} />
        </div>
      </div>

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

            <Card as="section" elevation="flat" className="space-y-8 p-5">
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

            <Card as="section" elevation="flat" className="p-5">
              <Heatmap
                days={data.days}
                caption="Study days"
                emptyMessage="No study days in this range."
              />
            </Card>

            <section aria-labelledby="per-set-heading" className="space-y-3">
              <h3 id="per-set-heading" className="text-base font-semibold tracking-tight">
                By set
              </h3>

              {data.perSet.length === 0 ? (
                <Card tone="dashed" className="p-5">
                  <p className="text-sm text-muted-foreground">
                    No sets were studied in this range.
                  </p>
                </Card>
              ) : (
                <Card elevation="flat" className="p-1.5">
                  <PerSetTable sets={data.perSet} />
                </Card>
              )}
            </section>
          </>
        ))}
    </div>
  )
}

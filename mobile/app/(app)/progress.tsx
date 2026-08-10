import { useState, type ReactElement } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  PROGRESS_RANGES,
  accuracyPercent,
  type ProgressRange,
  type SetProgress,
} from '@saulado/shared'
import { BarChart } from '../../components/bar-chart'
import { Button } from '../../components/button'
import { Card, CardFigure, CardLabel } from '../../components/card'
import { Heatmap } from '../../components/heatmap'
import { TrendChart } from '../../components/trend-chart'
import { useProgress } from '../../hooks/progress'
import { useTokenColor } from '../../stores/theme'

/**
 * The progress screen — a port of `frontend/src/features/dashboard/ProgressPage.tsx`.
 *
 * Four views of the same window: volume over time, accuracy over time, the shape
 * of the habit, and which sets the work went into. They are four because each
 * answers a question the others answer badly — a bar chart cannot show accuracy,
 * an accuracy line cannot show effort, and neither shows *where* the effort went.
 *
 * The rule that governs all of them: **a day with no reviews is a rest day, not a
 * failure.** It shows as a zero bar, a gap in the trend line, and an unfilled
 * heatmap square — never as 0% accuracy, which would be a claim that the user got
 * everything wrong.
 *
 * The web page's `<table>` of per-set figures becomes a list of rows. React Native
 * has no table and no header-cell association for a screen reader to read, so each
 * row carries its own `accessibilityLabel` naming every figure it shows — which is
 * what the `<th scope="row">` was buying on web.
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
 * `accessibilityRole="radio"` with `checked`, not four buttons. The ranges are
 * mutually exclusive and one is always chosen, so a screen reader should announce
 * "30 days, selected" rather than reading four unrelated controls.
 */
function RangeSwitcher({
  value,
  onChange,
}: {
  value: ProgressRange
  onChange: (range: ProgressRange) => void
}): ReactElement {
  return (
    <View className="flex-row gap-1 rounded-full bg-surface-muted p-1">
      {PROGRESS_RANGES.map((range) => {
        const selected = value === range

        return (
          <Pressable
            key={range}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={RANGE_LABELS[range]}
            onPress={() => {
              onChange(range)
            }}
            className={`min-h-11 flex-1 items-center justify-center rounded-full px-3 ${
              selected ? 'bg-surface' : ''
            }`}
          >
            <Text
              className={`text-sm ${
                selected ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {RANGE_LABELS[range]}
            </Text>
          </Pressable>
        )
      })}
    </View>
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
    <View className="min-w-[45%] flex-1 rounded-xl border border-border bg-surface p-4">
      <CardLabel>{label}</CardLabel>
      <CardFigure>{value}</CardFigure>
      {hint !== undefined && <Text className="mt-0.5 text-sm text-muted-foreground">{hint}</Text>}
    </View>
  )
}

function PerSetRow({ set, onPress }: { set: SetProgress; onPress: () => void }): ReactElement {
  const accuracy = accuracyPercent(set.correct, set.reviews)
  const accuracyText = accuracy === null ? 'no accuracy yet' : `${String(accuracy)}% accuracy`

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${set.title}. ${String(set.reviews)} reviews, ${accuracyText}, ${String(set.cardsStudied)} of ${String(set.cardCount)} cards seen.`}
      onPress={onPress}
      className="min-h-14 gap-1 border-b border-border/60 px-4 py-3 active:opacity-70"
    >
      <Text numberOfLines={1} className="font-medium text-foreground">
        {set.title}
      </Text>
      <Text className="text-sm tabular-nums text-muted-foreground">
        {`${String(set.reviews)} reviews · ${accuracy === null ? '—' : `${String(accuracy)}%`} · ${String(set.cardsStudied)} of ${String(set.cardCount)} cards`}
      </Text>
    </Pressable>
  )
}

/**
 * The never-studied state.
 *
 * Deliberately not four empty charts. A user who has never studied has no progress
 * to show, and rendering the scaffolding of a screen that would describe it tells
 * them only that they are missing something.
 */
function NothingYet({ onStudy }: { onStudy: () => void }): ReactElement {
  return (
    <Card tone="dashed">
      <Text className="text-center font-medium text-foreground">No reviews yet</Text>
      <Text className="mt-1 text-center text-sm text-muted-foreground">
        Once you have studied, this screen tracks how much you review, how accurate you are, and
        which sets the time goes into.
      </Text>
      <Button label="Start studying" size="lg" className="mt-5" onPress={onStudy} />
    </Card>
  )
}

export default function ProgressScreen(): ReactElement {
  const router = useRouter()
  const [range, setRange] = useState<ProgressRange>('30d')
  const progress = useProgress(range)
  const primary = useTokenColor('--primary')

  const data = progress.data
  const accuracy =
    data === undefined ? null : accuracyPercent(data.totals.correct, data.totals.reviews)

  function study(): void {
    router.push('/study')
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-5 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={progress.isRefetching}
          onRefresh={() => {
            void progress.refetch()
          }}
          tintColor={primary}
        />
      }
    >
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-2xl font-semibold tracking-tight text-foreground">Progress</Text>
          <Text className="text-sm text-muted-foreground">
            How your reviews have gone over time.
          </Text>
        </View>
        <RangeSwitcher value={range} onChange={setRange} />
      </View>

      {progress.isPending && (
        <Card tone="muted">
          <Text className="text-sm text-muted-foreground">Loading your progress…</Text>
        </Card>
      )}

      {progress.isError && (
        <Card tone="dashed">
          <Text className="text-sm text-muted-foreground">
            Could not load your progress. Studying still works.
          </Text>
          <Button label="Go to study" variant="outline" className="mt-4" onPress={study} />
        </Card>
      )}

      {data !== undefined &&
        // `totals.reviews` rather than `days.length` — the series is always dense
        // and therefore always non-empty, so its length says nothing about whether
        // there is anything to show.
        (data.totals.reviews === 0 ? (
          <NothingYet onStudy={study} />
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3">
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
            </View>

            <Card>
              <View className="gap-8">
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
              </View>
            </Card>

            <Card>
              <Heatmap
                days={data.days}
                caption="Study days"
                emptyMessage="No study days in this range."
              />
            </Card>

            <View className="gap-3">
              <Text className="text-base font-semibold tracking-tight text-foreground">By set</Text>

              {data.perSet.length === 0 ? (
                <Card tone="dashed">
                  <Text className="text-sm text-muted-foreground">
                    No sets were studied in this range.
                  </Text>
                </Card>
              ) : (
                <View className="overflow-hidden rounded-xl border border-border bg-surface">
                  {data.perSet.map((set) => (
                    <PerSetRow
                      key={set.studySetId}
                      set={set}
                      onPress={() => {
                        router.push(`/sets/${set.studySetId}`)
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ))}
    </ScrollView>
  )
}

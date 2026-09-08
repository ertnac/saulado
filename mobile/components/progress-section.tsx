import { useState, type ReactElement } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  PROGRESS_RANGES,
  accuracyPercent,
  type ProgressRange,
  type SetProgress,
} from '@saulado/shared'
import { BarChart } from './bar-chart'
import { Button } from './button'
import { Card, CardFigure, CardLabel } from './card'
import { Heatmap } from './heatmap'
import { TrendChart } from './trend-chart'
import { Section } from './settings-controls'
import { useProgress } from '../hooks/progress'

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
            className={`min-h-10 flex-1 items-center justify-center rounded-full px-2 ${
              selected ? 'bg-surface' : ''
            }`}
          >
            <Text
              className={`text-xs ${
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
    <View className="min-w-[45%] flex-1 rounded-xl border border-border bg-surface p-3.5">
      <CardLabel>{label}</CardLabel>
      <CardFigure>{value}</CardFigure>
      {hint !== undefined && <Text className="mt-0.5 text-xs text-muted-foreground">{hint}</Text>}
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
      className="min-h-12 gap-0.5 border-b border-border/60 px-4 py-2.5 active:opacity-70"
    >
      <Text numberOfLines={1} className="text-sm font-medium text-foreground">
        {set.title}
      </Text>
      <Text className="text-xs tabular-nums text-muted-foreground">
        {`${String(set.reviews)} reviews · ${accuracy === null ? '—' : `${String(accuracy)}%`} · ${String(set.cardsStudied)} of ${String(set.cardCount)} cards`}
      </Text>
    </Pressable>
  )
}

function NothingYet({ onStudy }: { onStudy: () => void }): ReactElement {
  return (
    <Card tone="dashed" className="p-4">
      <Text className="text-center text-sm font-medium text-foreground">No reviews yet</Text>
      <Text className="mt-1 text-center text-xs text-muted-foreground">
        Once you study, this section tracks your review volume, accuracy, and streaks.
      </Text>
      <Button label="Start studying" className="mt-4" onPress={onStudy} />
    </Card>
  )
}

export function ProgressSection(): ReactElement {
  const router = useRouter()
  const [range, setRange] = useState<ProgressRange>('30d')
  const progress = useProgress(range)

  const data = progress.data
  const accuracy =
    data === undefined ? null : accuracyPercent(data.totals.correct, data.totals.reviews)

  function study(): void {
    router.push('/study')
  }

  return (
    <Section title="Study Progress & Statistics">
      <View className="gap-4">
        <RangeSwitcher value={range} onChange={setRange} />

        {progress.isPending && (
          <Card tone="muted" className="p-4">
            <Text className="text-xs text-muted-foreground">Loading your progress…</Text>
          </Card>
        )}

        {progress.isError && (
          <Card tone="dashed" className="p-4">
            <Text className="text-xs text-muted-foreground">
              Could not load your progress. Studying still works.
            </Text>
            <Button label="Go to study" variant="outline" className="mt-3" onPress={study} />
          </Card>
        )}

        {data !== undefined &&
          (data.totals.reviews === 0 ? (
            <NothingYet onStudy={study} />
          ) : (
            <View className="gap-4">
              <View className="flex-row flex-wrap gap-2.5">
                <SummaryStat label="Reviews" value={String(data.totals.reviews)} />
                <SummaryStat
                  label="Accuracy"
                  value={accuracy === null ? '—' : `${String(accuracy)}%`}
                  hint={`${String(data.totals.correct)} correct`}
                />
                <SummaryStat
                  label="Days studied"
                  value={String(data.totals.activeDays)}
                  hint={`of ${String(data.days.length)}`}
                />
                <SummaryStat
                  label="Streak"
                  value={
                    data.streak.current === 1 ? '1 day' : `${String(data.streak.current)} days`
                  }
                  hint={data.streak.longest > 0 ? `Best ${String(data.streak.longest)}` : undefined}
                />
              </View>

              <Card className="p-4">
                <View className="gap-6">
                  <BarChart
                    days={data.days}
                    caption="Reviews per day"
                    emptyMessage="No reviews in this range."
                  />
                  <TrendChart
                    days={data.days}
                    caption="Accuracy"
                    emptyMessage="No reviews in this range yet."
                  />
                </View>
              </Card>

              <Card className="p-4">
                <Heatmap
                  days={data.days}
                  caption="Study days"
                  emptyMessage="No study days in this range."
                />
              </Card>

              <View className="gap-2">
                <Text className="text-sm font-semibold tracking-tight text-foreground">By Set</Text>

                {data.perSet.length === 0 ? (
                  <Card tone="dashed" className="p-3">
                    <Text className="text-xs text-muted-foreground">
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
            </View>
          ))}
      </View>
    </Section>
  )
}

import type { ReactElement } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { SessionSummary } from '@saulado/shared'

import { Button } from './button'
import { CheckIcon } from './icons'
import { useTokenColor } from '../stores/theme'

interface SessionSummaryProps {
  summary: SessionSummary
  studySetId: string | null
  onStudyAgain: () => void
  onRetake?: () => void
  pending: boolean
}

function minutes(durationMs: number): string {
  const total = Math.round(durationMs / 1000)
  if (total < 60) return `${String(total)}s`
  return `${String(Math.floor(total / 60))}m ${String(total % 60)}s`
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View className="min-w-[45%] flex-1 rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
      <Text className="text-2xl font-bold tracking-tight text-foreground">{value}</Text>
      <Text className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}

export function SessionSummaryView({
  summary,
  studySetId,
  onStudyAgain,
  onRetake,
  pending,
}: SessionSummaryProps): ReactElement {
  const router = useRouter()
  const success = useTokenColor('--success')

  return (
    <View className="gap-5">
      {/* ── Goal & Overview Banner ── */}
      <View className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Text className="text-xl font-bold tracking-tight text-foreground">
            Session complete 🎉
          </Text>
          {summary.goalMet && (
            <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 border border-success/30 px-3 py-1">
              <CheckIcon color={success} size={14} />
              <Text className="text-xs font-bold text-success">Goal met</Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-muted-foreground">
          {summary.goalMet
            ? `You have met your daily goal — ${String(summary.reviewsToday)} reviews today.`
            : `${String(summary.reviewsToday)} of ${String(summary.dailyGoal)} reviews toward today's goal.`}
        </Text>
      </View>

      {/* ── Key Metrics ── */}
      <View className="flex-row flex-wrap gap-3">
        <Stat label="Cards Seen" value={String(summary.cardsSeen)} />
        <Stat label="Correct" value={String(summary.correctCards)} />
        <Stat label="Accuracy" value={`${String(Math.round(summary.accuracy * 100))}%`} />
        <Stat label="Time Spent" value={minutes(summary.durationMs)} />
      </View>

      {/* ── Unanswered Blanks Card ── */}
      {summary.unanswered && summary.unanswered.length > 0 && onRetake && (
        <View className="rounded-2xl border border-primary/25 bg-primary/5 p-5 gap-3">
          <View>
            <Text className="text-base font-bold text-foreground">Finish unanswered cards</Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              You left {summary.unanswered.length} cards blank. Finish them now in practice mode.
            </Text>
          </View>
          <Button
            label="Practice unanswered blanks"
            size="md"
            variant="outline"
            onPress={onRetake}
            disabled={pending}
          />
        </View>
      )}

      {/* ── Cards to Review ── */}
      {summary.toRevisit.length > 0 && (
        <View className="rounded-2xl border border-border/80 bg-surface p-5 shadow-sm gap-3">
          <View>
            <Text className="text-base font-bold text-foreground">Cards to review</Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              These cards were graded again or hard and are scheduled to return.
            </Text>
          </View>

          <View className="gap-2 mt-1">
            {summary.toRevisit.map((card) => (
              <TouchableOpacity
                key={card.cardId}
                activeOpacity={0.7}
                className="rounded-xl border border-border/60 bg-surface-muted/40 p-3 flex-row items-center justify-between"
                onPress={() => {
                  router.push(`/sets/${card.studySetId}`)
                }}
              >
                <Text className="flex-1 text-xs font-medium text-foreground mr-2" numberOfLines={2}>
                  {card.label}
                </Text>
                <Text className="text-xs font-bold text-primary">View set →</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Bottom Action Buttons ── */}
      <View className="gap-3 mt-2">
        <Button
          label={pending ? 'Starting…' : 'Study again'}
          size="lg"
          loading={pending}
          onPress={onStudyAgain}
        />
        <Button
          label={studySetId === null ? 'Back to your sets' : 'Back to the set'}
          size="lg"
          variant="outline"
          onPress={() => {
            router.replace(studySetId === null ? '/sets' : `/sets/${studySetId}`)
          }}
        />
      </View>
    </View>
  )
}

import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { SessionSummary } from '@saulado/shared'

import { Button, TextLink } from './button'
import { CheckIcon } from './icons'
import { useTokenColor } from '../stores/theme'

/**
 * What the session added up to (plan §4.4).
 *
 * Reports rather than congratulates. The accuracy figure is the honest one —
 * cards answered correctly on the first attempt over cards seen — because a
 * number that quietly counts the retry of a failed card as a success makes the
 * whole screen worthless as feedback.
 */

interface SessionSummaryProps {
  summary: SessionSummary
  /** Where "study again" should go — the set just studied, or everything. */
  studySetId: string | null
  onStudyAgain: () => void
  pending: boolean
}

function minutes(durationMs: number): string {
  const total = Math.round(durationMs / 1000)
  if (total < 60) return `${String(total)}s`
  return `${String(Math.floor(total / 60))}m ${String(total % 60)}s`
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View className="min-w-[45%] flex-1 rounded-xl border border-border bg-surface p-4">
      <Text className="text-3xl font-semibold tracking-tight text-foreground">{value}</Text>
      <Text className="mt-0.5 text-sm text-muted-foreground">{label}</Text>
    </View>
  )
}

export function SessionSummaryView({
  summary,
  studySetId,
  onStudyAgain,
  pending,
}: SessionSummaryProps): ReactElement {
  const router = useRouter()
  const success = useTokenColor('--success')

  return (
    <View className="gap-6">
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-3">
          <Text className="text-2xl font-semibold tracking-tight text-foreground">
            Session complete
          </Text>
          {summary.goalMet && (
            <View className="flex-row items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5">
              <CheckIcon color={success} size={14} />
              <Text className="text-xs font-semibold text-success">Goal met</Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-muted-foreground">
          {summary.goalMet
            ? `You have met your daily goal — ${String(summary.reviewsToday)} reviews today.`
            : `${String(summary.reviewsToday)} of ${String(summary.dailyGoal)} reviews toward today's goal.`}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <Stat label="Cards" value={String(summary.cardsSeen)} />
        <Stat label="Correct" value={String(summary.correctCards)} />
        <Stat label="Accuracy" value={`${String(Math.round(summary.accuracy * 100))}%`} />
        <Stat label="Time" value={minutes(summary.durationMs)} />
      </View>

      {/*
        Linked, not just listed. The cards worth another look are exactly the ones
        the user might want to rewrite — a card that keeps failing is usually a
        card whose paragraph does not carry enough context to recall the answer.

        The link lands on the card's set. Opening a specific card for editing is
        Phase 4's job, so there is no per-card route to point at yet.
      */}
      {summary.toRevisit.length > 0 && (
        <View className="rounded-xl border border-accent/30 bg-accent/10 p-5">
          <Text className="font-medium text-foreground">Worth another look</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            These were graded again or hard. They are already scheduled to come back.
          </Text>
          <View className="mt-3 gap-1.5">
            {summary.toRevisit.map((card) => (
              <TextLink
                key={card.cardId}
                className="text-sm"
                onPress={() => {
                  router.push(`/sets/${card.studySetId}`)
                }}
              >
                {card.label}
              </TextLink>
            ))}
          </View>
        </View>
      )}

      <View className="gap-3">
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

import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import type { AnswerResponse, Grade } from '@saulado/shared'

import { CheckIcon, CloseIcon, SparklesIcon } from './icons'
import { SLOT_FONT } from './blank-slot'
import { useTokenColor } from '../stores/theme'

interface FeedbackPanelProps {
  answer: AnswerResponse
}

const GRADE_TITLE: Record<Grade, string> = {
  again: 'Not quite',
  hard: 'Partly right',
  good: 'Correct! 🎉',
  easy: 'Excellent! 🌟',
}

function whenBack(intervalDays: number): string {
  if (intervalDays <= 1) return 'tomorrow'
  if (intervalDays < 30) return `in ${String(intervalDays)} days`
  const months = Math.round(intervalDays / 30)
  return months === 1 ? 'in about a month' : `in about ${String(months)} months`
}

export function FeedbackPanel({ answer }: FeedbackPanelProps): ReactElement {
  const primary = useTokenColor('--primary')

  const wrong = answer.results.filter((result) => !result.correct)
  const typos = answer.results.filter((result) => result.correct && result.matchType === 'typo')
  const isPositive = answer.correct

  return (
    <View
      accessibilityLiveRegion="polite"
      className={`rounded-2xl border border-border/80 bg-surface p-4 shadow-sm ${
        isPositive ? 'border-l-4 border-l-success' : 'border-l-4 border-l-danger'
      }`}
    >
      {/* ── Status Header ── */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-3">
          <View
            className={`h-9 w-9 rounded-full items-center justify-center shadow-xs ${
              isPositive ? 'bg-success' : 'bg-danger'
            }`}
          >
            {isPositive ? (
              <CheckIcon color="#FFFFFF" size={18} />
            ) : (
              <CloseIcon color="#FFFFFF" size={18} />
            )}
          </View>

          <View>
            <Text className="text-base font-bold text-foreground">{GRADE_TITLE[answer.grade]}</Text>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {answer.requeued
                ? '🔁 Requeued for review today'
                : `📅 Scheduled for review ${whenBack(answer.intervalDays)}`}
            </Text>
          </View>
        </View>

        <View
          className={`rounded-full border px-2.5 py-0.5 ${
            isPositive ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10'
          }`}
        >
          <Text
            className={`text-[11px] font-bold uppercase tracking-wider ${
              isPositive ? 'text-success' : 'text-danger'
            }`}
          >
            {isPositive ? 'Passed' : 'Needs practice'}
          </Text>
        </View>
      </View>

      {/* ── Corrections (if any blank was missed) ── */}
      {wrong.length > 0 && (
        <View className="mt-3.5 border-t border-border/60 pt-3 gap-2.5">
          {wrong.map((result) => (
            <View
              key={result.ordinal}
              className="rounded-xl border border-border/60 bg-surface-muted/50 p-3 gap-1.5"
            >
              <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Blank {result.ordinal + 1}
              </Text>

              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-xs text-muted-foreground">Your answer:</Text>
                  {result.submitted.trim() !== '' ? (
                    <Text
                      style={{ fontFamily: SLOT_FONT }}
                      className="text-xs font-semibold text-danger line-through"
                    >
                      {result.submitted}
                    </Text>
                  ) : (
                    <Text className="text-xs italic text-muted-foreground">(Left blank)</Text>
                  )}
                </View>

                <View className="flex-row items-center gap-1.5 rounded-lg bg-success/15 border border-success/30 px-2 py-1">
                  <Text className="text-[10px] font-bold uppercase text-success">Correct:</Text>
                  <Text
                    style={{ fontFamily: SLOT_FONT }}
                    className="text-xs font-bold text-success"
                  >
                    {result.canonical}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Accepted Typos ── */}
      {typos.length > 0 && (
        <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-border/60 bg-surface-muted/50 p-3">
          <SparklesIcon color={primary} size={15} />
          <Text className="flex-1 text-xs text-muted-foreground">
            Spelling accepted —{' '}
            <Text className="font-semibold text-foreground">
              {typos.map((r) => r.canonical).join(', ')}
            </Text>
          </Text>
        </View>
      )}

      {/* ── Leech Warning ── */}
      {answer.isLeech && (
        <View className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
          <Text className="text-xs text-warning-foreground font-medium">
            ⚠️ This card has been missed multiple times. Consider rewriting or adding more context
            clues to the card.
          </Text>
        </View>
      )}
    </View>
  )
}

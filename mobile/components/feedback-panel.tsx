import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import type { AnswerResponse, Grade } from '@saulado/shared'

import { CheckIcon, CloseIcon } from './icons'
import { SLOT_FONT } from './blank-slot'
import { useTokenColor } from '../stores/theme'

/**
 * The verdict on the card just answered (plan §4.3).
 *
 * Deliberately below the card rather than over it: a sheet would cover the
 * paragraph, and the paragraph is the thing worth re-reading while the answer is
 * fresh. Nothing here moves the card above it, so the sentence the user just
 * worked on stays exactly where their eyes left it.
 *
 * The advance button is *not* here, unlike the web. On a phone it belongs in the
 * screen's sticky footer, above the keyboard and in thumb reach — saulado-ux §7.
 * The panel scrolls; the button must not.
 */

interface FeedbackPanelProps {
  answer: AnswerResponse
}

const GRADE_LABEL: Record<Grade, string> = {
  again: 'Not quite',
  hard: 'Partly right',
  good: 'Correct',
  easy: 'Correct',
}

/** "in 1 day" reads better than "in 1 days", and "tomorrow" better than either. */
function whenBack(intervalDays: number): string {
  if (intervalDays <= 1) return 'tomorrow'
  if (intervalDays < 30) return `in ${String(intervalDays)} days`
  const months = Math.round(intervalDays / 30)
  return months === 1 ? 'in about a month' : `in about ${String(months)} months`
}

export function FeedbackPanel({ answer }: FeedbackPanelProps): ReactElement {
  const success = useTokenColor('--success')
  const danger = useTokenColor('--danger')

  const wrong = answer.results.filter((result) => !result.correct)
  const typos = answer.results.filter((result) => result.correct && result.matchType === 'typo')

  return (
    <View
      // Polite, not assertive: this is announced after a submission the user
      // initiated, so it must not cut off whatever the reader is mid-way through.
      accessibilityLiveRegion="polite"
      className={`rounded-lg border p-5 ${
        answer.correct ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10'
      }`}
    >
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {/*
          Icon, word and colour all say the same thing. Any one of the three is
          enough on its own, which is the requirement — roughly one reader in
          twelve cannot separate the green from the red.
        */}
        <View className="flex-row items-center gap-1.5">
          {answer.correct ? <CheckIcon color={success} /> : <CloseIcon color={danger} />}
          <Text
            className={`text-lg font-semibold ${answer.correct ? 'text-success' : 'text-danger'}`}
          >
            {GRADE_LABEL[answer.grade]}
          </Text>
        </View>

        {/*
          The schedule is stated in plain language because it is the payoff of
          answering honestly — a user who cannot see that "again" means "back
          tomorrow" has no reason not to reveal every card.
        */}
        <Text className="text-sm text-muted-foreground">
          {answer.requeued
            ? 'Coming back later in this session, and again tomorrow.'
            : `Back ${whenBack(answer.intervalDays)}.`}
        </Text>
      </View>

      {/*
        Echoing the wrong submission beside the right answer is the whole point of
        the panel: "you wrote X, it was Y" is a correction, "it was Y" alone
        leaves the user to remember what they typed.
      */}
      {wrong.length > 0 && (
        <View className="mt-3 gap-1.5">
          {wrong.map((result) => (
            <View key={result.ordinal} className="flex-row flex-wrap items-baseline gap-x-2">
              <Text className="text-sm text-muted-foreground">
                Blank {result.ordinal + 1}
                {result.submitted.trim() === '' ? ' (left blank)' : ':'}
              </Text>
              {result.submitted.trim() !== '' && (
                <Text
                  style={{ fontFamily: SLOT_FONT, textDecorationLine: 'line-through' }}
                  className="text-sm text-foreground opacity-70"
                >
                  {result.submitted}
                </Text>
              )}
              <Text
                style={{ fontFamily: SLOT_FONT }}
                className="text-sm font-semibold text-foreground"
              >
                {result.canonical}
              </Text>
            </View>
          ))}
        </View>
      )}

      {typos.length > 0 && (
        <Text className="mt-3 text-sm text-muted-foreground">
          Counted as correct despite the spelling — {typos.map((r) => r.canonical).join(', ')}.
        </Text>
      )}

      {answer.isLeech && (
        <Text className="mt-3 text-sm text-foreground">
          This card keeps catching you out. It is often worth rewriting the paragraph so the answer
          is inferable from its context.
        </Text>
      )}
    </View>
  )
}

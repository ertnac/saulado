import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import type { StreakSummary } from '@saulado/shared'
import { Card } from './card'
import { FlameIcon } from './icons'
import { useTokenColor } from '../stores/theme'

/**
 * The streak, ported from `frontend/src/features/dashboard/StreakCard.tsx`
 * with modern Student Portal badge styling.
 *
 * The most emotionally load-bearing number in the app (saulado-ux §4), and every
 * string below is chosen against the same rule: **no loss framing.** A streak the
 * user has not continued today says "studying today continues it", not "your
 * streak is about to end". The three states are a fact, an invitation, and an
 * acknowledgement — never a threat.
 */
function days(count: number): string {
  return count === 1 ? '1 day' : `${String(count)} days`
}

export function StreakCard({ streak }: { streak: StreakSummary }): ReactElement {
  const { current, longest, studiedToday } = streak
  const accent = useTokenColor('--accent')

  function headline(): string {
    if (current === 0) return 'Start a streak today'
    return `${days(current)} in a row`
  }

  function detail(): string {
    if (current === 0) {
      return longest > 0
        ? `Your longest run so far is ${days(longest)}.`
        : 'A streak is any run of days with at least one review.'
    }

    if (studiedToday) {
      return current >= longest
        ? 'That is your longest run yet.'
        : `Longest so far: ${days(longest)}.`
    }

    // The one state that could be written as a warning, and deliberately is not.
    return 'Studying today continues it.'
  }

  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
          <FlameIcon color={accent} size={22} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Study Streak
          </Text>
          <Text className="text-lg font-bold tracking-tight text-foreground">{headline()}</Text>
        </View>
      </View>
      <Text className="mt-2.5 text-sm text-muted-foreground">{detail()}</Text>
    </Card>
  )
}

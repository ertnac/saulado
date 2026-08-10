import type { ReactElement } from 'react'
import { Text } from 'react-native'
import type { StreakSummary } from '@saulado/shared'
import { Card, CardLabel } from './card'

/**
 * The streak, ported verbatim from `frontend/src/features/dashboard/StreakCard.tsx`.
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
      <CardLabel>Streak</CardLabel>
      <Text className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        {headline()}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{detail()}</Text>
    </Card>
  )
}

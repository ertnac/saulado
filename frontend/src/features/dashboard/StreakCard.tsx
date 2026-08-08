import type { ReactElement } from 'react'
import type { StreakSummary } from '@saulado/shared'
import { Card, CardLabel } from '@/components/ui/card'

/**
 * The streak, framed honestly (plan §5.2).
 *
 * The requirement is that "2 days" and "Start a streak today" both read fine,
 * and that nothing here uses loss-framing. That rules out the entire genre of
 * streak UI that works by making the user afraid — no "don't break it!", no
 * flame that dims as the day goes on, no countdown.
 *
 * Four states, and the distinctions between them are the whole point:
 *
 * | `current` | `studiedToday` | Reads as                                  |
 * | --------- | -------------- | ----------------------------------------- |
 * | 0         | false          | an invitation, not a failure              |
 * | n         | **true**       | done — a plain statement of fact          |
 * | n         | **false**      | intact, with a neutral note on continuing |
 *
 * The third row is the one that is easy to get wrong. A user at 09:00 with a
 * twelve-day streak has not studied *yet*; the server already counts their
 * streak as intact (`currentStreak` anchors on yesterday when today is empty),
 * and the copy has to agree with that rather than implying they are one step
 * from losing something.
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
      // No mention of a streak that used to exist. A user returning after a
      // break is being invited back, not shown the wreckage.
      return longest > 0
        ? `Your longest run so far is ${days(longest)}.`
        : 'A streak is any run of days with at least one review.'
    }

    if (studiedToday) {
      return current >= longest
        ? 'That is your longest run yet.'
        : `Longest so far: ${days(longest)}.`
    }

    // Present tense, no urgency, no countdown. It is a fact about what a review
    // today would do, not a warning about what skipping it would cost.
    return 'Studying today continues it.'
  }

  return (
    <Card className="p-5">
      <CardLabel>Streak</CardLabel>
      <p className="mt-2 text-xl font-semibold tracking-tight">{headline()}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail()}</p>
    </Card>
  )
}

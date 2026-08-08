import { render, screen } from '@testing-library/react'
import type { StreakSummary } from '@saulado/shared'
import { describe, expect, it } from 'vitest'
import { StreakCard } from './StreakCard'

/**
 * The streak card.
 *
 * Every assertion here is about tone rather than arithmetic — the counting is
 * the server's job and is tested in `backend/src/progress/streak.ts`. What can
 * only be checked here is that none of the four states reads as a threat.
 *
 * The plan's wording is that "2 days" and "Start a streak today" must both read
 * fine. In practice that means two things the naive implementation gets wrong:
 * a zero streak must not be phrased as a loss, and an intact streak that has not
 * been continued *yet today* must not be phrased as one about to be lost.
 */

function streak(overrides: Partial<StreakSummary> = {}): StreakSummary {
  return { current: 0, longest: 0, studiedToday: false, ...overrides }
}

/** Loss-framing, in the forms it usually takes. */
const PUNITIVE =
  /don't|do not break|lost|lose|losing|broken|failed|missed|expires|ends in|last chance/i

describe('when there is no streak yet', () => {
  it('invites one rather than reporting a zero', () => {
    render(<StreakCard streak={streak()} />)

    expect(screen.getByText('Start a streak today')).toBeInTheDocument()
    // "0 days in a row" is accurate and reads as a scoreline on a game the user
    // has not been told they are playing.
    expect(screen.queryByText('0 days in a row')).not.toBeInTheDocument()
  })

  it('explains what a streak is when the user has never had one', () => {
    render(<StreakCard streak={streak()} />)

    expect(
      screen.getByText('A streak is any run of days with at least one review.'),
    ).toBeInTheDocument()
  })

  it('does not show the wreckage of a streak that ended', () => {
    // A returning user whose 30-day run lapsed. Their longest is worth stating;
    // the fact that they broke it is not.
    render(<StreakCard streak={streak({ longest: 30 })} />)

    expect(screen.getByText('Your longest run so far is 30 days.')).toBeInTheDocument()
    expect(screen.queryByText(PUNITIVE)).not.toBeInTheDocument()
  })
})

describe('when the streak is running', () => {
  it('says so plainly once today is done', () => {
    render(<StreakCard streak={streak({ current: 5, longest: 12, studiedToday: true })} />)

    expect(screen.getByText('5 days in a row')).toBeInTheDocument()
    expect(screen.getByText('Longest so far: 12 days.')).toBeInTheDocument()
  })

  it('notes when this run is the best one', () => {
    render(<StreakCard streak={streak({ current: 12, longest: 12, studiedToday: true })} />)

    expect(screen.getByText('That is your longest run yet.')).toBeInTheDocument()
  })

  it('treats a streak not yet continued today as intact, not at risk', () => {
    /*
      The load-bearing case. At 09:00 the server still counts this streak as 12
      — `currentStreak` anchors on yesterday when today is empty — so the copy
      has to agree. "Don't break your streak!" would contradict the number
      printed directly above it.
    */
    render(<StreakCard streak={streak({ current: 12, longest: 20, studiedToday: false })} />)

    expect(screen.getByText('12 days in a row')).toBeInTheDocument()
    expect(screen.getByText('Studying today continues it.')).toBeInTheDocument()
    expect(screen.queryByText(PUNITIVE)).not.toBeInTheDocument()
  })

  it('counts one day in the singular', () => {
    render(<StreakCard streak={streak({ current: 1, longest: 1, studiedToday: true })} />)

    expect(screen.getByText('1 day in a row')).toBeInTheDocument()
  })
})

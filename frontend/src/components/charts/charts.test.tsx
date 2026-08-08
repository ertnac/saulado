import { render, screen, within } from '@testing-library/react'
import type { DayStat } from '@saulado/shared'
import { describe, expect, it } from 'vitest'
import { BarChart } from './BarChart'
import { Heatmap, levelFor, toWeeks } from './Heatmap'
import { TrendChart } from './TrendChart'

/**
 * The chart primitives.
 *
 * These tests are almost entirely about the accessible table, not the picture —
 * which is the point of ADR 0002. The bars are `aria-hidden` divs; the table is
 * the chart as far as a screen reader is concerned, and it is the thing that has
 * to be right.
 *
 * The recurring assertion is the distinction between **a zero and an absence**.
 * A day with no reviews is a rest day. It must read as "No reviews", never as
 * "0%", because 0% is a claim that the user answered everything wrong.
 */

function day(date: string, reviews: number, correct: number): DayStat {
  return { day: date, reviews, correct, goalMet: false }
}

/** Sun 2026-08-02 through Sat 2026-08-08 — a whole calendar week. */
const WEEK: DayStat[] = [
  day('2026-08-02', 10, 8),
  day('2026-08-03', 0, 0),
  day('2026-08-04', 5, 5),
  day('2026-08-05', 0, 0),
  day('2026-08-06', 20, 10),
  day('2026-08-07', 3, 0),
  day('2026-08-08', 8, 6),
]

const IDLE: DayStat[] = WEEK.map((entry) => day(entry.day, 0, 0))

describe('BarChart', () => {
  it('puts every day in the table, including the idle ones', () => {
    render(<BarChart days={WEEK} caption="Reviews per day" emptyMessage="Nothing here." />)

    const table = screen.getByRole('table', { name: 'Reviews per day' })
    // Seven days plus the header row. A sparse table would silently drop the
    // rest days the chart is meant to show.
    expect(within(table).getAllByRole('row')).toHaveLength(8)
  })

  it('calls a rest day a rest day rather than 0% accuracy', () => {
    render(<BarChart days={WEEK} caption="Reviews per day" emptyMessage="Nothing here." />)

    const table = screen.getByRole('table', { name: 'Reviews per day' })
    expect(within(table).getAllByText('No reviews').length).toBeGreaterThan(0)
  })

  it('does report 0% when the reviews happened and were all wrong', () => {
    // The other half of the distinction: 3 reviews, none correct, is genuinely
    // 0% and must not be softened into "no reviews".
    render(<BarChart days={WEEK} caption="Reviews per day" emptyMessage="Nothing here." />)

    const table = screen.getByRole('table', { name: 'Reviews per day' })
    expect(within(table).getByText('0%')).toBeInTheDocument()
  })

  it('withholds the picture when there is nothing in it', () => {
    render(<BarChart days={IDLE} caption="Reviews per day" emptyMessage="No reviews yet." />)

    expect(screen.getByText('No reviews yet.')).toBeInTheDocument()
  })

  it('hides the bars from assistive technology', () => {
    const { container } = render(
      <BarChart days={WEEK} caption="Reviews per day" emptyMessage="Nothing here." />,
    )

    // Otherwise a screen reader walks 30 empty divs before reaching the table
    // that actually says something.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('TrendChart', () => {
  it('breaks the line on rest days instead of joining across them', () => {
    const { container } = render(
      <TrendChart days={WEEK} caption="Accuracy" emptyMessage="Nothing yet." />,
    )

    /*
      The week has reviews on 2nd, then 4th, then 6th–8th — three runs separated
      by idle days. One polyline per run is what draws the gaps; a single
      polyline through all five points would invent measurements for the 3rd and
      5th that were never taken.

      The 2nd and the 4th are single-day runs, drawn as dots.
    */
    expect(container.querySelectorAll('polyline')).toHaveLength(1)
    expect(container.querySelectorAll('line')).toHaveLength(3)
  })

  it('says in the caption that gaps are rest days', () => {
    render(<TrendChart days={WEEK} caption="Accuracy" emptyMessage="Nothing yet." />)

    expect(screen.getByText(/rest day is not a day of wrong answers/)).toBeInTheDocument()
  })

  it('draws nothing at all when no day has a measurement', () => {
    const { container } = render(
      <TrendChart days={IDLE} caption="Accuracy" emptyMessage="No reviews in this range yet." />,
    )

    expect(screen.getByText('No reviews in this range yet.')).toBeInTheDocument()
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('still plots a single day of study rather than dropping it', () => {
    const one = [day('2026-08-02', 4, 4), ...IDLE.slice(1)]
    const { container } = render(
      <TrendChart days={one} caption="Accuracy" emptyMessage="Nothing yet." />,
    )

    // A two-point polyline is the minimum that draws anything, so a lone day is
    // rendered as a dot. Without it, one day of study shows an empty chart.
    expect(container.querySelectorAll('line')).toHaveLength(2)
  })
})

describe('Heatmap', () => {
  it('lists only the days that had reviews', () => {
    render(<Heatmap days={WEEK} caption="Study days" emptyMessage="Nothing yet." />)

    const table = screen.getByRole('table', { name: 'Study days' })
    // Five active days plus the header. A year of "0" rows is 365 lines of
    // nothing for a screen reader to walk.
    expect(within(table).getAllByRole('row')).toHaveLength(6)
  })

  it('says how many days were studied, in text', () => {
    render(<Heatmap days={WEEK} caption="Study days" emptyMessage="Nothing yet." />)

    expect(screen.getByText(/5 days studied/)).toBeInTheDocument()
  })

  it('pads the first week so days land on their true weekday', () => {
    // 2026-08-05 is a Wednesday, so three empty cells precede it. Without the
    // padding every square sits in the wrong row and the weekday labels lie.
    const weeks = toWeeks([day('2026-08-05', 4, 4), day('2026-08-06', 2, 2)])

    expect(weeks).toHaveLength(1)
    expect(weeks[0]?.slice(0, 3)).toEqual([null, null, null])
    expect(weeks[0]?.[3]?.day).toBe('2026-08-05')
    expect(weeks[0]?.[4]?.day).toBe('2026-08-06')
  })

  it('keeps every column exactly seven cells tall', () => {
    // Including the last, so a part-finished week does not stretch its squares
    // to fill the space.
    for (const week of toWeeks(WEEK.slice(0, 4))) {
      expect(week).toHaveLength(7)
    }
  })

  it('starts a new column on each Sunday', () => {
    // 2026-08-02 is a Sunday, so a fortnight from it is exactly two columns.
    const fortnight = Array.from({ length: 14 }, (_, offset) => {
      const date = new Date(Date.UTC(2026, 7, 2 + offset))
      return day(date.toISOString().slice(0, 10), 1, 1)
    })

    expect(toWeeks(fortnight)).toHaveLength(2)
  })

  it('never lets a day of study look like a day of none', () => {
    // One review against a busiest day of 500 is 0.2% — but the square has to be
    // visibly filled, or the heatmap claims the user did nothing.
    expect(levelFor(1, 500)).toBeGreaterThanOrEqual(1)
    expect(levelFor(0, 500)).toBe(0)
  })

  it('shows the count on each square for pointer users', () => {
    render(<Heatmap days={WEEK} caption="Study days" emptyMessage="Nothing yet." />)

    expect(screen.getByTitle('Thu 6 Aug: 20 reviews')).toBeInTheDocument()
  })

  it('withholds the grid when no day was studied', () => {
    render(<Heatmap days={IDLE} caption="Study days" emptyMessage="No study days in this range." />)

    expect(screen.getByText('No study days in this range.')).toBeInTheDocument()
  })
})

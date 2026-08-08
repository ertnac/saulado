import type { DayKey } from '@saulado/shared'

/**
 * Shared chart arithmetic and date formatting.
 *
 * Extracted because the bar chart, the trend line and the heatmap all need the
 * same three things — a scale, a short weekday label, and a readable date — and
 * three copies would drift the moment one of them was adjusted.
 */

/**
 * A day key formatted for a human.
 *
 * Parsed as UTC deliberately. A day key is a calendar day, not an instant
 * (`shared/src/study/day.ts`), and `new Date('2026-08-08')` is already UTC
 * midnight — so formatting it in the browser's zone would render it as the 7th
 * for anyone west of Greenwich. Every label here reads the UTC components back
 * out, which is the same convention `dateToDayKey` writes them with.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function keyToUtc(day: DayKey): Date {
  return new Date(`${day}T00:00:00Z`)
}

/** `8 Aug` — the axis label form. */
export function shortDate(day: DayKey): string {
  const date = keyToUtc(day)
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ''}`
}

/** `Sat 8 Aug` — the table and tooltip form, where the weekday earns its space. */
export function longDate(day: DayKey): string {
  const date = keyToUtc(day)
  return `${WEEKDAYS[date.getUTCDay()] ?? ''} ${shortDate(day)}`
}

/** 0 = Sunday. Used to place a day in a heatmap column. */
export function weekdayIndex(day: DayKey): number {
  return keyToUtc(day).getUTCDay()
}

/**
 * A value as a percentage of the maximum, floored so a nonzero value is visible.
 *
 * The floor is the point. One review on a day where the peak was 200 is 0.5% of
 * the height — under a pixel, indistinguishable from a day of nothing. A bar the
 * user can see is a truer picture than one that rounds their work away.
 */
export function barHeightPercent(value: number, max: number): number {
  if (value <= 0) return 0
  if (max <= 0) return 0
  return Math.max(4, Math.round((value / max) * 100))
}

/**
 * A round number at or above the largest value, for the top of the axis.
 *
 * Scaling to the exact maximum makes the tallest bar full-height on every chart,
 * which erases the difference between a good week and a great one. A 1/2/5
 * progression keeps the ceiling meaningful and the label readable.
 */
export function niceCeiling(max: number): number {
  if (max <= 0) return 1
  if (max <= 5) return 5

  const magnitude = 10 ** Math.floor(Math.log10(max))
  for (const step of [1, 2, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= max) return candidate
  }

  return 10 * magnitude
}

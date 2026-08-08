/**
 * Day boundaries in the user's own timezone.
 *
 * A "streak day" is a day with at least one review — and *which* day a review
 * lands on is a question the server cannot answer without knowing where the user
 * is (plan §2.3). Reviewing at 23:00 in Auckland is a different calendar day
 * from the same instant in UTC, so computing streaks or `due_at <= today`
 * against the server's clock silently breaks the feature for most of the world.
 *
 * Two representations, kept deliberately distinct:
 *
 * - **Instants** are `Date`s. Real points in time, timezone-free.
 * - **Day keys** are `YYYY-MM-DD` strings. Calendar days, meaningless without
 *   the zone that produced them.
 *
 * `due_at` is a SQL `DATE`, which is a day key, not an instant. Prisma hands
 * those back as `Date` at UTC midnight, so {@link dayKeyToDate} and
 * {@link dateToDayKey} exist to cross that boundary in exactly one place
 * instead of scattering `setUTCHours(0,0,0,0)` through the query layer.
 */

/** `YYYY-MM-DD`. Only meaningful alongside the timezone it was computed in. */
export type DayKey = string

/**
 * `en-CA` is not arbitrary: its short date format is ISO-8601 (`2026-08-08`),
 * so the formatter emits a day key directly. `en-US` would give `08/08/2026`
 * and need reassembling.
 */
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/** True if the runtime recognises this IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    dayFormatter(timeZone).format(new Date())
    return true
  } catch {
    return false
  }
}

/** The calendar day an instant falls on, as seen from `timeZone`. */
export function dayKeyInZone(at: Date, timeZone: string): DayKey {
  return dayFormatter(timeZone).format(at)
}

/**
 * How far `timeZone` is ahead of UTC at a given instant, in milliseconds.
 *
 * Derived by formatting the instant *as* local wall-clock time and reading it
 * back as though it were UTC. The difference between that and the true instant
 * is the offset. This is the only approach that stays correct across DST
 * without shipping a timezone database — `getTimezoneOffset()` only ever
 * reports the *host's* zone, which is not the user's.
 */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  )

  // Millisecond precision is dropped by the formatter; the instant carries it.
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000
}

const HOUR_MS = 3_600_000

/**
 * The instant a calendar day begins in `timeZone`.
 *
 * Two passes, then a guard, because midnight is not a fixed target:
 *
 * 1. Guess by treating local midnight as UTC midnight.
 * 2. Correct using the offset *at the guessed instant* — the offset on the day
 *    itself can differ from the offset today, which is what makes a naive
 *    single-pass conversion drift by an hour twice a year.
 * 3. Some zones **skip midnight entirely** on the DST-start day (Santiago,
 *    Beirut, Havana): 23:59:59 jumps straight to 01:00:00 and 00:00 never
 *    happens. There is no instant to return, so we walk forward to the first
 *    one that is genuinely on the requested day.
 */
export function startOfDayInZone(at: Date, timeZone: string): Date {
  const key = dayKeyInZone(at, timeZone)
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  const localMidnight = Date.UTC(year, month - 1, day)

  const guess = localMidnight - zoneOffsetMs(new Date(localMidnight), timeZone)
  let instant = localMidnight - zoneOffsetMs(new Date(guess), timeZone)

  for (let attempt = 0; attempt < 3 && dayKeyInZone(new Date(instant), timeZone) < key; attempt++) {
    instant += HOUR_MS
  }

  return new Date(instant)
}

/** Whether two instants fall on the same calendar day in `timeZone`. */
export function isSameDayInZone(a: Date, b: Date, timeZone: string): boolean {
  return dayKeyInZone(a, timeZone) === dayKeyInZone(b, timeZone)
}

/** Shifts a day key by whole calendar days. Never touches a clock. */
export function addDaysToKey(key: DayKey, days: number): DayKey {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return dateToDayKey(shifted)
}

/**
 * A day key as the UTC-midnight `Date` a SQL `DATE` column round-trips through.
 *
 * Not an instant anyone should do arithmetic on — it is a calendar day wearing
 * a `Date`'s clothes because that is the only shape Prisma accepts.
 */
export function dayKeyToDate(key: DayKey): Date {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/** The inverse of {@link dayKeyToDate}, for values coming back out of the DB. */
export function dateToDayKey(value: Date): DayKey {
  return value.toISOString().slice(0, 10)
}

/** Calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetweenKeys(from: DayKey, to: DayKey): number {
  const ms = dayKeyToDate(to).getTime() - dayKeyToDate(from).getTime()
  return Math.round(ms / 86_400_000)
}

import type { DayStat, TodayProgress } from '@saulado/shared'

export interface GoalMetrics {
  todayReviews: number
  todayGoal: number
  goalPercent: number
  isGoalMet: boolean
  subtitle: string
}

export function computeGoalMetrics(today?: TodayProgress, fallbackGoal = 20): GoalMetrics {
  const todayReviews = today?.reviews ?? 0
  const todayGoal = today?.goal && today.goal > 0 ? today.goal : fallbackGoal
  const isGoalMet = Boolean(today?.goalMet || (todayReviews >= todayGoal && todayGoal > 0))
  const goalPercent =
    todayGoal > 0 ? Math.min(100, Math.round((todayReviews / todayGoal) * 100)) : 0

  let subtitle = `You've completed ${goalPercent}% of today's review cards.`
  if (isGoalMet) {
    subtitle = 'Daily goal reached! Great job.'
  }

  return {
    todayReviews,
    todayGoal,
    goalPercent,
    isGoalMet,
    subtitle,
  }
}

export interface KeyMetrics {
  masteredCount: number
  dueCount: number
  dueSubtitle: string
  accuracyText: string
  accuracySubtitle: string
}

export function computeKeyMetrics(
  totalMastered?: number,
  totalDue?: number,
  totals?: { reviews: number; correct: number },
): KeyMetrics {
  const masteredCount = totalMastered ?? 0
  const dueCount = totalDue ?? 0
  const dueSubtitle = dueCount > 0 ? 'Ready for review' : 'All caught up'

  const reviews = totals?.reviews ?? 0
  const correct = totals?.correct ?? 0
  let accuracyText = '—'
  let accuracySubtitle = 'No reviews yet'

  if (reviews > 0) {
    const pct = (correct / reviews) * 100
    accuracyText = `${pct.toFixed(1)}%`
    accuracySubtitle = `${correct} of ${reviews} correct`
  }

  return {
    masteredCount,
    dueCount,
    dueSubtitle,
    accuracyText,
    accuracySubtitle,
  }
}

export interface HeatmapCell {
  dayKey: string
  count: number
  tier: 0 | 1 | 2 | 3 // 0: 0, 1: 1-2, 2: 3-4, 3: 5+
}

export function compute4WeekHeatmap(days?: DayStat[], referenceDate = new Date()): HeatmapCell[][] {
  const dayMap = new Map<string, number>()
  if (days) {
    for (const d of days) {
      dayMap.set(d.day, d.reviews)
    }
  }

  // Build 28 days ending on referenceDate's week ending Sunday (or referenceDate if already aligned)
  // Day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const ref = new Date(referenceDate)
  const dayOfWeek = ref.getDay() // 0 = Sun
  const daysUntilSunday = (7 - dayOfWeek) % 7
  const windowEnd = new Date(ref)
  windowEnd.setDate(ref.getDate() + daysUntilSunday)

  const cells: HeatmapCell[] = []
  for (let i = 27; i >= 0; i--) {
    const d = new Date(windowEnd)
    d.setDate(windowEnd.getDate() - i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const key = `${yyyy}-${mm}-${dd}`
    const count = dayMap.get(key) ?? 0

    let tier: 0 | 1 | 2 | 3 = 0
    if (count >= 5) tier = 3
    else if (count >= 3) tier = 2
    else if (count >= 1) tier = 1

    cells.push({ dayKey: key, count, tier })
  }

  const rows: HeatmapCell[][] = []
  for (let r = 0; r < 4; r++) {
    rows.push(cells.slice(r * 7, (r + 1) * 7))
  }
  return rows
}

export interface TrendPoint {
  day: string
  val: number
  hasData: boolean
}

export interface AccuracyTrendResult {
  points: TrendPoint[]
  averageAccuracyText: string
}

export function computeAccuracyTrend(
  days?: DayStat[],
  referenceDate = new Date(),
): AccuracyTrendResult {
  const dayStatsMap = new Map<string, { reviews: number; correct: number }>()
  if (days) {
    for (const d of days) {
      dayStatsMap.set(d.day, { reviews: d.reviews, correct: d.correct })
    }
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const points: TrendPoint[] = []
  let totalReviews = 0
  let totalCorrect = 0

  for (let i = 6; i >= 0; i--) {
    const d = new Date(referenceDate)
    d.setDate(referenceDate.getDate() - i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const key = `${yyyy}-${mm}-${dd}`
    const stat = dayStatsMap.get(key)

    const dayName = dayNames[d.getDay()]
    if (stat && stat.reviews > 0) {
      const accuracy = Math.round((stat.correct / stat.reviews) * 100)
      points.push({ day: dayName, val: accuracy, hasData: true })
      totalReviews += stat.reviews
      totalCorrect += stat.correct
    } else {
      points.push({ day: dayName, val: 0, hasData: false })
    }
  }

  let averageAccuracyText = '—'
  if (totalReviews > 0) {
    const avg = Math.round((totalCorrect / totalReviews) * 100)
    averageAccuracyText = `${avg}%`
  }

  return {
    points,
    averageAccuracyText,
  }
}

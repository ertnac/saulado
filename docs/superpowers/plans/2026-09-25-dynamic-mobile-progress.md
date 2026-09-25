# Dynamic Mobile Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app Progress tab dynamic by connecting Daily Goal, Key Metrics, 4-Week Activity Heatmap, and 7-Day Accuracy Trend to real user data with pull-to-refresh.

**Architecture:** Extract calculation and data-formatting logic into a pure helper module (`mobile/lib/progress-metrics.ts`) with unit tests. Connect `mobile/app/(app)/progress.tsx` to `useDashboard()`, `useProgress('30d')`, and `useDueCounts()`, incorporating pull-to-refresh and smooth scroll for "View Report".

**Tech Stack:** React Native, Expo Router, TanStack Query, Vitest, TypeScript.

## Global Constraints

- Do not add new backend routes or mutate shared wire types; use existing data from `useDashboard`, `useProgress`, and `useDueCounts`.
- Show honest zero/empty states (e.g., `0/20`, `0 cards`, `—` for undefined accuracy) instead of hardcoded placeholder numbers.
- Maintain light/dark theme styling using the project's existing color palette (`#052E24`, `#317054`, `#6B9985`, `#A6C2B5`, `#E8F3EE`).

---

### Task 1: Create Progress Metrics Calculation Helper and Unit Tests

**Files:**

- Create: `mobile/lib/progress-metrics.ts`
- Test: `mobile/lib/__tests__/progress-metrics.test.ts`

**Interfaces:**

- Consumes: `DayStat`, `TodayProgress` from `@saulado/shared`.
- Produces:
  - `computeGoalMetrics(today?: TodayProgress, fallbackGoal?: number): { todayReviews: number; todayGoal: number; goalPercent: number; isGoalMet: boolean; subtitle: string }`
  - `computeKeyMetrics(totalMastered?: number, totalDue?: number, totals?: { reviews: number; correct: number }): { masteredCount: number; dueCount: number; dueSubtitle: string; accuracyText: string; accuracySubtitle: string }`
  - `compute4WeekHeatmap(days?: DayStat[], referenceDate?: Date): { count: number; tier: 0 | 1 | 2 | 3; dayKey: string }[][]`
  - `computeAccuracyTrend(days?: DayStat[], referenceDate?: Date): { points: { day: string; val: number; hasData: boolean }[]; averageAccuracyText: string }`

- [ ] **Step 1: Write the failing tests for progress metrics**

```typescript
// mobile/lib/__tests__/progress-metrics.test.ts
import { describe, expect, it } from 'vitest'
import type { DayStat, TodayProgress } from '@saulado/shared'
import {
  computeGoalMetrics,
  computeKeyMetrics,
  compute4WeekHeatmap,
  computeAccuracyTrend,
} from '../progress-metrics'

describe('progress-metrics', () => {
  describe('computeGoalMetrics', () => {
    it('returns zero values when today is undefined', () => {
      const res = computeGoalMetrics(undefined, 20)
      expect(res.todayReviews).toBe(0)
      expect(res.todayGoal).toBe(20)
      expect(res.goalPercent).toBe(0)
      expect(res.isGoalMet).toBe(false)
      expect(res.subtitle).toBe("You've completed 0% of today's review cards.")
    })

    it('calculates correct percentages and completion subtitle', () => {
      const today: TodayProgress = {
        reviews: 15,
        goal: 20,
        correct: 14,
        goalMet: false,
      }
      const res = computeGoalMetrics(today, 20)
      expect(res.todayReviews).toBe(15)
      expect(res.goalPercent).toBe(75)
      expect(res.isGoalMet).toBe(false)
      expect(res.subtitle).toBe("You've completed 75% of today's review cards.")

      const metToday: TodayProgress = {
        reviews: 25,
        goal: 20,
        correct: 24,
        goalMet: true,
      }
      const metRes = computeGoalMetrics(metToday, 20)
      expect(metRes.goalPercent).toBe(100)
      expect(metRes.isGoalMet).toBe(true)
      expect(metRes.subtitle).toBe('Daily goal reached! Great job.')
    })
  })

  describe('computeKeyMetrics', () => {
    it('handles empty/zero data honestly', () => {
      const res = computeKeyMetrics(undefined, undefined, undefined)
      expect(res.masteredCount).toBe(0)
      expect(res.dueCount).toBe(0)
      expect(res.dueSubtitle).toBe('All caught up')
      expect(res.accuracyText).toBe('—')
      expect(res.accuracySubtitle).toBe('No reviews yet')
    })

    it('formats non-zero metrics accurately', () => {
      const res = computeKeyMetrics(42, 10, { reviews: 50, correct: 45 })
      expect(res.masteredCount).toBe(42)
      expect(res.dueCount).toBe(10)
      expect(res.dueSubtitle).toBe('Ready for review')
      expect(res.accuracyText).toBe('90.0%')
      expect(res.accuracySubtitle).toBe('45 of 50 correct')
    })
  })

  describe('compute4WeekHeatmap', () => {
    it('returns a 4x7 grid with correct tiers', () => {
      const refDate = new Date('2026-09-27T12:00:00Z') // Sunday
      const days: DayStat[] = [
        { day: '2026-09-27', reviews: 6, correct: 6, goalMet: true },
        { day: '2026-09-26', reviews: 3, correct: 2, goalMet: false },
        { day: '2026-09-25', reviews: 1, correct: 1, goalMet: false },
        { day: '2026-09-24', reviews: 0, correct: 0, goalMet: false },
      ]
      const grid = compute4WeekHeatmap(days, refDate)
      expect(grid.length).toBe(4)
      expect(grid[0].length).toBe(7)
      expect(grid[3].length).toBe(7)

      // The last element of week 4 (index [3][6]) corresponds to Sunday 2026-09-27
      const sundayCell = grid[3][6]
      expect(sundayCell.dayKey).toBe('2026-09-27')
      expect(sundayCell.count).toBe(6)
      expect(sundayCell.tier).toBe(3) // 5+ reviews => tier 3
    })
  })

  describe('computeAccuracyTrend', () => {
    it('handles days with and without reviews', () => {
      const refDate = new Date('2026-09-27T12:00:00Z')
      const days: DayStat[] = [
        { day: '2026-09-27', reviews: 10, correct: 8, goalMet: true },
        { day: '2026-09-26', reviews: 5, correct: 5, goalMet: true },
      ]
      const trend = computeAccuracyTrend(days, refDate)
      expect(trend.points.length).toBe(7)
      expect(trend.averageAccuracyText).toBe('87%')
    })

    it('returns honest empty state when no reviews in window', () => {
      const trend = computeAccuracyTrend([], new Date('2026-09-27T12:00:00Z'))
      expect(trend.averageAccuracyText).toBe('—')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test mobile/lib/__tests__/progress-metrics.test.ts` in `c:/projects/saulado/mobile`
Expected: FAIL with module not found or functions undefined.

- [ ] **Step 3: Implement `mobile/lib/progress-metrics.ts`**

```typescript
// mobile/lib/progress-metrics.ts
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

  // Build 28 days ending on referenceDate (or current week Sunday)
  // To align with Mon-Sun columns:
  // Find current day of week (0=Sun, 1=Mon, ..., 6=Sat)
  // Let end of the 4-week window be the coming/current Sunday
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test mobile/lib/__tests__/progress-metrics.test.ts` in `c:/projects/saulado/mobile`
Expected: PASS all 4 test suites.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/progress-metrics.ts mobile/lib/__tests__/progress-metrics.test.ts
git commit -m "feat(mobile): add progress metrics computation helpers and tests"
```

---

### Task 2: Wire Dynamic Metrics, Heatmap, and Trend Chart in `progress.tsx`

**Files:**

- Modify: `mobile/app/(app)/progress.tsx`

**Interfaces:**

- Consumes:
  - `computeGoalMetrics`, `computeKeyMetrics`, `compute4WeekHeatmap`, `computeAccuracyTrend` from `mobile/lib/progress-metrics.ts`
  - `useDashboard`, `useProgress` from `mobile/hooks/progress`
  - `useDueCounts` from `mobile/hooks/study`
- Produces: Dynamic `ProgressScreen` component with live metrics, dynamic charts, smooth scrolling, and pull-to-refresh.

- [ ] **Step 1: Update `AccuracyTrendChart` in `progress.tsx` to accept dynamic points**

Refactor `AccuracyTrendChart` to receive:

```typescript
interface AccuracyTrendChartProps {
  points: { day: string; val: number; hasData: boolean }[]
  isDark: boolean
}
```

Compute SVG polyline path dynamically:

- When all `hasData` are false, render a gentle dashed baseline.
- When data exists, compute normalized Y coordinates (`minVal = 50`, `maxVal = 100` or auto-scaled based on min/max) and render polyline with circular data points on days with data.

- [ ] **Step 2: Update `ProgressScreen` to consume dynamic metrics**

1. Call `useDueCounts()` in addition to `useDashboard()` and `useProgress('30d')`.
2. Compute `goalMetrics = computeGoalMetrics(dashboard.data?.today, settings?.dailyGoal)`.
3. Compute `keyMetrics = computeKeyMetrics(dueCounts.data?.totalMastered, dashboard.data?.totalDue ?? dueCounts.data?.totalDue, progressQuery.data?.totals)`.
4. Compute `heatmapRows = compute4WeekHeatmap(progressQuery.data?.days)`.
5. Compute `trendResult = computeAccuracyTrend(progressQuery.data?.days ?? dashboard.data?.sparkline)`.
6. Add `scrollViewRef = useRef<ScrollView>(null)` and attach `onLayout` to the Activity Heatmap section to record Y position.
7. Implement "View Report" button handler: `scrollViewRef.current?.scrollTo({ y: reportY, animated: true })`.
8. Add `RefreshControl` with refreshing state `isRefetching = dashboard.isRefetching || progressQuery.isRefetching || dueCounts.isRefetching` and `onRefresh = () => Promise.all([dashboard.refetch(), progressQuery.refetch(), dueCounts.refetch()])`.

- [ ] **Step 3: Run typecheck and existing tests to ensure no regressions**

Run: `npm run typecheck` in `c:/projects/saulado/mobile`
Run: `npm test` in `c:/projects/saulado/mobile`
Expected: 0 type errors, all tests passing.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/progress.tsx
git commit -m "feat(mobile): make progress screen metrics, heatmap and trend dynamic"
```

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

# Dynamic Mobile Progress Screen Specification

## Goal

Make the mobile app's Progress tab dynamic by wiring the current static mock data directly to live user metrics, review history, and study activities using existing backend APIs and TanStack Query hooks.

## Scope & Screen Sections

The mobile Progress tab (`mobile/app/(app)/progress.tsx`) displays four main sections:

### 1. Daily Review Goal

- **Data Source**: `useDashboard().data.today`
- **Fields**:
  - `reviews`: Number of cards reviewed today.
  - `goal`: Daily target (defaults to user setting or 20).
  - `percent`: `Math.min(100, Math.round((reviews / goal) * 100))` (or `0` when goal is 0).
- **Display**:
  - Circular gauge displaying `{reviews}/{total}` in the center and the percentage progress arc.
  - Subtitle: `"You've completed {percent}% of today's review cards."` (or `"Goal achieved for today!"` if `goalMet` is true).
- **Actions**:
  - **Review Now**: Navigates to `/study`.
  - **View Report**: Smoothly scrolls down the screen to the Activity Heatmap & Accuracy Trend metrics.

### 2. Key Metrics

- **Metric 1: Cards Mastered**
  - **Data Source**: `useDueCounts().data.totalMastered ?? 0`
  - Cards with `repetitions >= 2` across all sets.
  - Subtitle: `"Mastered cards"`
- **Metric 2: Cards Due**
  - **Data Source**: `useDashboard().data.totalDue ?? useDueCounts().data.totalDue ?? 0`
  - Subtitle: `dueCount > 0 ? "Ready for review" : "All caught up"`
- **Metric 3: Review Accuracy**
  - **Data Source**: `useProgress('30d').data.totals`
  - Derived accuracy: `(totals.correct / totals.reviews) * 100` formatted to 1 decimal place (or `"—"` when total reviews is 0).
  - Subtitle: `reviews > 0 ? "{totals.correct} of {totals.reviews} correct" : "No reviews yet"`

### 3. Activity Heatmap (Past 4 Weeks)

- **Data Source**: `useProgress('30d').data.days`
- **Grid Layout**: 4 rows × 7 columns (28 days total, ending today).
- **Day Headers**: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
- **Color Bracketing** (by number of cards reviewed per day):
  - 0 reviews: `#E8F3EE` (Light) / `rgba(255, 255, 255, 0.06)` (Dark)
  - 1–2 reviews: `#6B9985`
  - 3–4 reviews: `#317054`
  - 5+ reviews: `#052E24`

### 4. Accuracy Trend (Last 7 Days)

- **Data Source**: Last 7 days from `useProgress('30d').data.days` or `useDashboard().data.sparkline`.
- **Chart Header**:
  - Calculates the real 7-day average accuracy: `(7dayCorrect / 7dayReviews) * 100` (or `"—"` if no reviews in the last 7 days).
- **SVG Line Chart**:
  - Dynamically plots the 7 data points for each day of the week (Mon through Sun).
  - For days with reviews, points correspond to `(correct / reviews) * 100`.
  - For days without reviews, smoothly connects or handles baseline honest 0 display.
  - Day label text below each point matches the day name.

### 5. Pull-to-Refresh

- Wraps the root `ScrollView` with React Native's `RefreshControl`.
- Tied to `dashboard.isRefetching || progressQuery.isRefetching || dueCounts.isRefetching`.
- Pulling down triggers concurrent refetches for dashboard, progress, and due counts.

## Implementation Files

- `mobile/app/(app)/progress.tsx`: Update to bind UI elements to dynamic queries, calculate 4-week heatmap grid, plot 7-day SVG trend, and integrate pull-to-refresh.

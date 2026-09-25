import { useRef, useState, type ReactElement } from 'react'
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRightIcon } from '../../components/icons'
import { useDashboard, useProgress } from '../../hooks/progress'
import { useDueCounts } from '../../hooks/study'
import {
  computeAccuracyTrend,
  computeGoalMetrics,
  computeKeyMetrics,
  compute4WeekHeatmap,
  type TrendPoint,
} from '../../lib/progress-metrics'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from '../../stores/theme'

/**
 * Large circular gauge for Daily Review Goal matching design.
 */
function DailyGoalGauge({
  completed,
  total,
  percent,
  isDark,
}: {
  completed: number
  total: number
  percent: number
  isDark: boolean
}): ReactElement {
  const size = 110
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isDark ? 'rgba(255,255,255,0.1)' : '#E8F3EE'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#052E24"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '800',
            color: isDark ? '#FFFFFF' : '#052E24',
          }}
        >
          {completed}/{total}
        </Text>
      </View>
    </View>
  )
}

/**
 * Accuracy Trend Line Chart with dynamic points and empty state support.
 */
function AccuracyTrendChart({
  points,
  isDark,
}: {
  points: TrendPoint[]
  isDark: boolean
}): ReactElement {
  const width = 290
  const height = 90
  const stepX = width / Math.max(1, points.length - 1)
  const hasAnyData = points.some((p) => p.hasData)

  const minVal = 50
  const maxVal = 100

  // Compute SVG polyline path and dot coordinates
  const coords = points.map((p, i) => {
    const x = i * stepX
    const clampedVal = Math.max(minVal, Math.min(maxVal, p.val))
    const y = hasAnyData
      ? height - ((clampedVal - minVal) / (maxVal - minVal)) * (height - 24) - 12
      : height / 2
    return { x, y, hasData: p.hasData }
  })

  const pathData = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ')

  return (
    <View style={{ width: '100%', alignItems: 'center', marginTop: 10 }}>
      <Svg width={width} height={height}>
        <Path
          d={pathData}
          fill="none"
          stroke={hasAnyData ? '#317054' : isDark ? 'rgba(255,255,255,0.15)' : '#E0E7E4'}
          strokeWidth={2.5}
          strokeDasharray={hasAnyData ? undefined : '4 4'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, i) =>
          c.hasData ? (
            <Circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={3.5}
              fill="#317054"
              stroke={isDark ? '#111A17' : '#FFFFFF'}
              strokeWidth={1.5}
            />
          ) : null,
        )}
      </Svg>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          width: width,
          marginTop: 8,
        }}
      >
        {points.map((p, idx) => (
          <Text
            key={`${p.day}-${idx}`}
            style={{
              fontSize: 11,
              fontWeight: '500',
              color: isDark ? '#889591' : '#889591',
            }}
          >
            {p.day}
          </Text>
        ))}
      </View>
    </View>
  )
}

export default function ProgressScreen(): ReactElement {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isDark } = useTheme()
  const scrollViewRef = useRef<ScrollView>(null)
  const [reportY, setReportY] = useState(0)

  // Dynamic user data queries
  const dashboard = useDashboard()
  const progressQuery = useProgress('30d')
  const dueCounts = useDueCounts()
  const settings = useAuthStore((s) => s.settings)

  const isRefreshing =
    dashboard.isRefetching || progressQuery.isRefetching || dueCounts.isRefetching

  const handleRefresh = async (): Promise<void> => {
    await Promise.all([dashboard.refetch(), progressQuery.refetch(), dueCounts.refetch()])
  }

  // Derive all dynamic metrics via pure helpers
  const goalMetrics = computeGoalMetrics(dashboard.data?.today, settings?.dailyGoal)
  const keyMetrics = computeKeyMetrics(
    dueCounts.data?.totalMastered,
    dashboard.data?.totalDue ?? dueCounts.data?.totalDue,
    progressQuery.data?.totals,
  )
  const heatmapRows = compute4WeekHeatmap(progressQuery.data?.days)
  const trendResult = computeAccuracyTrend(progressQuery.data?.days ?? dashboard.data?.sparkline)

  const getHeatmapColor = (tier: number): string => {
    switch (tier) {
      case 3:
        return '#052E24'
      case 2:
        return '#317054'
      case 1:
        return '#6B9985'
      default:
        return isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE'
    }
  }

  const handleViewReport = (): void => {
    scrollViewRef.current?.scrollTo({ y: Math.max(0, reportY - 20), animated: true })
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: Math.max(insets.bottom + 96, 128),
        gap: 20,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void handleRefresh()
          }}
          tintColor="#317054"
        />
      }
    >
      {/* 1. Daily Goal Section */}
      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.3,
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          Daily Goal
        </Text>

        <View
          style={{
            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
            padding: 22,
            alignItems: 'center',
            shadowColor: '#052E24',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.2 : 0.04,
            shadowRadius: 10,
            elevation: 3,
            gap: 16,
          }}
        >
          <DailyGoalGauge
            completed={goalMetrics.todayReviews}
            total={goalMetrics.todayGoal}
            percent={goalMetrics.goalPercent}
            isDark={isDark}
          />

          <View style={{ alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: isDark ? '#FFFFFF' : '#111A17',
                letterSpacing: -0.3,
              }}
            >
              Daily Review Goal
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: isDark ? '#889591' : '#4C5854',
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              {goalMetrics.subtitle}
            </Text>
          </View>

          {/* Action Buttons Row */}
          <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Review Now"
              onPress={() => router.push('/study')}
              activeOpacity={0.85}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#317054',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Review Now</Text>
              <ArrowRightIcon color="#FFFFFF" size={16} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View Report"
              onPress={handleViewReport}
              activeOpacity={0.75}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 22,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#052E24',
                }}
              >
                View Report
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 2. Key Metrics Section */}
      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.3,
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          Key Metrics
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Metric 1: Cards Mastered */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              padding: 14,
              gap: 4,
            }}
          >
            <Text
              style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854', fontWeight: '500' }}
            >
              Cards Mastered
            </Text>
            <Text
              style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#FFFFFF' : '#111A17' }}
            >
              {keyMetrics.masteredCount} cards
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#317054', marginTop: 2 }}>
              Mastered cards
            </Text>
          </View>

          {/* Metric 2: Cards Due */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              padding: 14,
              gap: 4,
            }}
          >
            <Text
              style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854', fontWeight: '500' }}
            >
              Cards Due
            </Text>
            <Text
              style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#FFFFFF' : '#111A17' }}
            >
              {keyMetrics.dueCount} cards
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854', marginTop: 2 }}>
              {keyMetrics.dueSubtitle}
            </Text>
          </View>

          {/* Metric 3: Review Accuracy */}
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              padding: 14,
              gap: 4,
            }}
          >
            <Text
              style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854', fontWeight: '500' }}
            >
              Review Accuracy
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#317054' }}>
              {keyMetrics.accuracyText}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#317054', marginTop: 2 }}>
              {keyMetrics.accuracySubtitle}
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Activity Heatmap Section */}
      <View
        style={{ gap: 12 }}
        onLayout={(e) => {
          setReportY(e.nativeEvent.layout.y)
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.3,
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          Activity Heatmap
        </Text>

        <View
          style={{
            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
            padding: 18,
            gap: 14,
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FFFFFF' : '#111A17' }}
            >
              Past 4 weeks
            </Text>

            {/* Legend */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#052E24' }} />
              <Text style={{ fontSize: 9, color: isDark ? '#889591' : '#4C5854' }}>5+</Text>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#317054' }} />
              <Text style={{ fontSize: 9, color: isDark ? '#889591' : '#4C5854' }}>3-4</Text>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#6B9985' }} />
              <Text style={{ fontSize: 9, color: isDark ? '#889591' : '#4C5854' }}>1-2</Text>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8F3EE',
                }}
              />
              <Text style={{ fontSize: 9, color: isDark ? '#889591' : '#4C5854' }}>0</Text>
            </View>
          </View>

          {/* Days Column Header */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <Text
                key={day}
                style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: isDark ? '#889591' : '#889591',
                  width: 32,
                  textAlign: 'center',
                }}
              >
                {day}
              </Text>
            ))}
          </View>

          {/* Grid rows */}
          <View style={{ gap: 8 }}>
            {heatmapRows.map((row, rIdx) => (
              <View
                key={rIdx}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingHorizontal: 4,
                }}
              >
                {row.map((cell) => (
                  <View
                    key={cell.dayKey}
                    accessibilityLabel={`${cell.dayKey}: ${cell.count} cards reviewed`}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: getHeatmapColor(cell.tier),
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 4. Accuracy Trend Section */}
      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.3,
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          Accuracy Trend
        </Text>

        <View
          style={{
            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
            padding: 18,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FFFFFF' : '#111A17' }}
            >
              Average: {trendResult.averageAccuracyText}
            </Text>
            <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>Last 7 Days</Text>
          </View>

          <AccuracyTrendChart points={trendResult.points} isDark={isDark} />
        </View>
      </View>
    </ScrollView>
  )
}

import { type ReactElement } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowRightIcon } from '../../components/icons'
import { useDashboard, useProgress } from '../../hooks/progress'
import { useTheme } from '../../stores/theme'

/**
 * Large circular gauge for Daily Review Goal matching Image 2 ("15/20").
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
 * Accuracy Trend Line Chart matching Image 2.
 */
function AccuracyTrendChart({ isDark }: { isDark: boolean }): ReactElement {
  const width = 290
  const height = 90
  const points = [
    { day: 'Mon', val: 78 },
    { day: 'Tue', val: 86 },
    { day: 'Wed', val: 82 },
    { day: 'Thu', val: 94 },
    { day: 'Fri', val: 84 },
    { day: 'Sat', val: 88 },
    { day: 'Sun', val: 92 },
  ]

  // Compute SVG polyline path
  const minVal = 70
  const maxVal = 100
  const stepX = width / (points.length - 1)
  const pathData = points
    .map((p, i) => {
      const x = i * stepX
      const y = height - ((p.val - minVal) / (maxVal - minVal)) * (height - 20) - 10
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  return (
    <View style={{ width: '100%', alignItems: 'center', marginTop: 10 }}>
      <Svg width={width} height={height}>
        <Path
          d={pathData}
          fill="none"
          stroke="#317054"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          width: width,
          marginTop: 8,
        }}
      >
        {points.map((p) => (
          <Text
            key={p.day}
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
  const dashboard = useDashboard()
  const progressQuery = useProgress('30d')

  const todayReviews = dashboard.data?.today?.reviews ?? 15
  const todayGoal = dashboard.data?.today?.goal ?? 20
  const goalPercent =
    todayGoal > 0 ? Math.min(100, Math.round((todayReviews / todayGoal) * 100)) : 75

  const dueCount = dashboard.data?.totalDue ?? 18
  const calculatedAccuracy =
    progressQuery.data?.totals && progressQuery.data.totals.reviews > 0
      ? ((progressQuery.data.totals.correct / progressQuery.data.totals.reviews) * 100).toFixed(1)
      : '92.4'

  // 4-Week Activity Heatmap (4 rows x 7 days)
  // Palette: 5+ cards (#052E24), 3-4 cards (#317054), 1-2 cards (#6B9985), 1 card (#A6C2B5), No cards (#E8F3EE)
  const heatmapData = [
    ['#317054', '#A6C2B5', '#E8F3EE', '#052E24', '#E8F3EE', '#E8F3EE', '#6B9985'],
    ['#E8F3EE', '#E8F3EE', '#317054', '#6B9985', '#A6C2B5', '#052E24', '#E8F3EE'],
    ['#E8F3EE', '#A6C2B5', '#E8F3EE', '#E8F3EE', '#317054', '#6B9985', '#A6C2B5'],
    ['#6B9985', '#052E24', '#317054', '#A6C2B5', '#052E24', '#E8F3EE', '#E8F3EE'],
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: Math.max(insets.bottom + 96, 128),
        gap: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Daily Goal Section (Image 2) */}
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
            completed={todayReviews}
            total={todayGoal}
            percent={goalPercent}
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
              You've completed {goalPercent}% of today's review cards.
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
              onPress={() => {}}
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

      {/* 2. Key Metrics Section (Image 2) */}
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
              128 cards
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#317054', marginTop: 2 }}>
              +12 this week
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
              {dueCount} cards
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#889591' : '#4C5854', marginTop: 2 }}>
              Ready for review
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
              {calculatedAccuracy}%
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#317054', marginTop: 2 }}>
              +1.5% vs average
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Activity Heatmap Section (Image 2) */}
      <View style={{ gap: 12 }}>
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
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#E8F3EE' }} />
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
            {heatmapData.map((row, rIdx) => (
              <View
                key={rIdx}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingHorizontal: 4,
                }}
              >
                {row.map((color, cIdx) => (
                  <View
                    key={cIdx}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor:
                        isDark && color === '#E8F3EE' ? 'rgba(255,255,255,0.06)' : color,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 4. Accuracy Trend Section (Image 2) */}
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
              Average: 88%
            </Text>
            <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>Last 7 Days</Text>
          </View>

          <AccuracyTrendChart isDark={isDark} />
        </View>
      </View>
    </ScrollView>
  )
}

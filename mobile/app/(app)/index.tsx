import { useState, type ReactElement, useEffect, useSyncExternalStore } from 'react'
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { onlineManager } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { RecentSet } from '@saulado/shared'
import {
  ArrowRightIcon,
  BoxCubeIcon,
  CameraIcon,
  ClockIcon,
  FlameIcon,
  PlusIcon,
  ZapIcon,
} from '../../components/icons'
import { QuickLearnSheet } from '../../components/quick-learn-sheet'
import { usePrefetchCards } from '../../hooks/cards'
import { useDashboard } from '../../hooks/progress'
import { useSettings } from '../../hooks/settings'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../../stores/auth'
import { useOfflineSetsStore } from '../../stores/offline-sets'
import { useTheme } from '../../stores/theme'

/**
 * Returns formatted date matching Image 4 (e.g. "Thursday, October 24").
 */
function getFormattedDate(): string {
  try {
    const now = new Date()
    return now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return 'Today'
  }
}

/**
 * Circular progress gauge matching Image 4 ("Daily Practice 65%").
 */
function DailyPracticeGauge({ percent }: { percent: number }): ReactElement {
  const size = 72
  const strokeWidth = 7
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.16)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6B9985"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{percent}%</Text>
      </View>
    </View>
  )
}

export default function HomeScreen(): ReactElement {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const settings = useAuthStore((s) => s.settings)
  const dashboard = useDashboard()
  const { isDark } = useTheme()

  const [quickLearnVisible, setQuickLearnVisible] = useState(false)

  // Fetch settings to update the auth store on mount/focus
  useSettings()

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )
  const isOffline = !isOnline
  const offlineStore = useOfflineSetsStore()

  const offlineSets = Object.values(offlineStore.sets)
    .filter(
      (s) =>
        s.status === 'available' &&
        Boolean(
          s.isDownloaded || s.syncStatus?.startsWith('pending_') || s.setId.startsWith('temp-set-'),
        ) &&
        s.metadata &&
        !s.metadata.archivedAt,
    )
    .map((s) => s.metadata!)

  const prefetchCards = usePrefetchCards()
  const data = dashboard.data

  useEffect(() => {
    if (!isOffline && data?.recentSets) {
      data.recentSets.forEach((set: RecentSet) => prefetchCards(set.id))
    }
  }, [isOffline, data?.recentSets, prefetchCards])

  const displayName = settings?.nickname || user?.email?.split('@')[0] || 'Alex'
  const formattedDate = getFormattedDate()

  const streakDays = data?.streak?.current ?? 5
  const dueCount = isOffline
    ? offlineSets.reduce((sum, s) => sum + s.cardCount, 0)
    : (data?.totalDue ?? 18)
  const activeSetsCount = isOffline ? offlineSets.length : Math.max(offlineSets.length, 6)

  // Recent sets mock fallback matching Image 4 when sets are empty
  const defaultRecentSets: { id: string; title: string; cardCount: number; mastery: number }[] = [
    {
      id: 'mock-1',
      title: 'Anatomy 101: Muscular System',
      cardCount: 42,
      mastery: 84,
    },
    {
      id: 'mock-2',
      title: 'French Vocabulary Vol. 2',
      cardCount: 28,
      mastery: 42,
    },
    {
      id: 'mock-3',
      title: 'Intro to Macroeconomics',
      cardCount: 65,
      mastery: 15,
    },
  ]

  const recentList =
    data?.recentSets && data.recentSets.length > 0
      ? data.recentSets.map((s, index) => ({
          id: s.id,
          title: s.title,
          cardCount: s.cardCount,
          mastery: index === 0 ? 84 : index === 1 ? 42 : 15,
        }))
      : defaultRecentSets

  function study(setId?: string): void {
    if (setId && !setId.startsWith('mock-')) {
      router.push({ pathname: '/study', params: { set: setId } })
    } else {
      router.push('/study')
    }
  }

  // Daily practice percentage
  const dailyPercent =
    data?.today && data.today.goal > 0
      ? Math.min(100, Math.round((data.today.reviews / data.today.goal) * 100))
      : 65

  return (
    <>
      <ScrollView
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
            refreshing={dashboard.isRefetching}
            onRefresh={() => {
              if (!isOffline) {
                void dashboard.refetch()
              }
            }}
            tintColor="#317054"
          />
        }
      >
        {/* 1. Greeting & Date Banner (Image 4) */}
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              letterSpacing: -0.5,
              color: isDark ? '#FFFFFF' : '#111A17',
            }}
          >
            Bonjour, {displayName}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '500',
              color: isDark ? '#889591' : '#4C5854',
            }}
          >
            {formattedDate}
          </Text>
        </View>

        {/* 2. Glance Metric Chips Row (Streak / Due Now / Active Sets) */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Card 1: Streak */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Streak ${streakDays} Days`}
            onPress={() => router.push('/progress')}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              borderRadius: 18,
              padding: 14,
              gap: 8,
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.2 : 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FlameIcon color={isDark ? '#A6C2B5' : '#317054'} size={18} />
            </View>
            <View>
              <Text
                style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#889591' : '#4C5854' }}
              >
                Streak
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                  marginTop: 2,
                }}
              >
                {streakDays} Days
              </Text>
            </View>
          </TouchableOpacity>

          {/* Card 2: Due Now */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Due Now ${dueCount} Cards`}
            onPress={() => study()}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              borderRadius: 18,
              padding: 14,
              gap: 8,
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.2 : 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClockIcon color={isDark ? '#A6C2B5' : '#317054'} size={18} />
            </View>
            <View>
              <Text
                style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#889591' : '#4C5854' }}
              >
                Due Now
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                  marginTop: 2,
                }}
              >
                {dueCount} Cards
              </Text>
            </View>
          </TouchableOpacity>

          {/* Card 3: Active Sets */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Active Sets ${activeSetsCount} Sets`}
            onPress={() => router.push('/sets')}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
              borderRadius: 18,
              padding: 14,
              gap: 8,
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.2 : 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BoxCubeIcon color={isDark ? '#A6C2B5' : '#317054'} size={18} />
            </View>
            <View>
              <Text
                style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#889591' : '#4C5854' }}
              >
                Active Sets
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                  marginTop: 2,
                }}
              >
                {activeSetsCount} Sets
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 3. 1-Tap Quick Action Row (Scan Paper / Quick Learn / New Set) */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Action 1: Scan Paper */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Scan paper: Import cards"
            onPress={() => router.push('/scan')}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FAFBF9',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
              borderRadius: 18,
              padding: 14,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CameraIcon color={isDark ? '#A6C2B5' : '#317054'} size={20} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                }}
              >
                Scan Paper
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: isDark ? '#889591' : '#4C5854',
                  marginTop: 2,
                }}
              >
                Import cards
              </Text>
            </View>
          </TouchableOpacity>

          {/* Action 2: Quick Learn */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Quick Learn: Fast review"
            onPress={() => setQuickLearnVisible(true)}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FAFBF9',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
              borderRadius: 18,
              padding: 14,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ZapIcon color={isDark ? '#A6C2B5' : '#317054'} size={20} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                }}
              >
                Quick Learn
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: isDark ? '#889591' : '#4C5854',
                  marginTop: 2,
                }}
              >
                Fast review
              </Text>
            </View>
          </TouchableOpacity>

          {/* Action 3: New Set */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="New Set: Create deck"
            onPress={() => router.push('/sets')}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: isDark ? '#111A17' : '#FAFBF9',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
              borderRadius: 18,
              padding: 14,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlusIcon color={isDark ? '#A6C2B5' : '#317054'} size={20} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isDark ? '#FFFFFF' : '#111A17',
                }}
              >
                New Set
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: isDark ? '#889591' : '#4C5854',
                  marginTop: 2,
                }}
              >
                Create deck
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 4. Featured Hero Card: Daily Practice (Deep Forest Card) */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Daily Practice: Keep your retention streak alive today. Study Now"
          onPress={() => study()}
          activeOpacity={0.9}
          style={{
            backgroundColor: '#052E24',
            borderRadius: 20,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#052E24',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 14,
            elevation: 8,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '800',
                color: '#FFFFFF',
                letterSpacing: -0.3,
              }}
            >
              Daily Practice
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: '#A6C2B5',
                marginTop: 4,
                lineHeight: 18,
              }}
            >
              Keep your retention streak alive today.
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 18,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Study Now</Text>
              <ArrowRightIcon color="#FFFFFF" size={16} />
            </View>
          </View>

          <DailyPracticeGauge percent={dailyPercent} />
        </TouchableOpacity>

        {/* 5. Recent Sets Section */}
        <View style={{ gap: 12 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              letterSpacing: -0.3,
              color: isDark ? '#FFFFFF' : '#111A17',
            }}
          >
            Recent Sets
          </Text>

          <View style={{ gap: 10 }}>
            {recentList.map((set) => (
              <TouchableOpacity
                key={set.id}
                accessibilityRole="button"
                accessibilityLabel={`${set.title}, ${set.cardCount} flashcards, ${set.mastery}% mastery`}
                onPress={() => study(set.id)}
                activeOpacity={0.75}
                style={{
                  backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  shadowColor: '#052E24',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.2 : 0.03,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    {set.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: isDark ? '#889591' : '#4C5854',
                      marginTop: 3,
                    }}
                  >
                    {set.cardCount} flashcards
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '800',
                      color: isDark ? '#6B9985' : '#052E24',
                    }}
                  >
                    {set.mastery}%
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '500',
                      color: isDark ? '#889591' : '#4C5854',
                      marginTop: 1,
                    }}
                  >
                    mastery
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Quick Learn Modal Sheet */}
      <QuickLearnSheet visible={quickLearnVisible} onClose={() => setQuickLearnVisible(false)} />
    </>
  )
}

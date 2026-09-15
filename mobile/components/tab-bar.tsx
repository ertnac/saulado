import { useSyncExternalStore, type ReactElement } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useRouter, type Tabs } from 'expo-router'
import { onlineManager } from '@tanstack/react-query'
import { useTheme } from '../stores/theme'
import {
  FileTextIcon,
  FolderIcon,
  HomeIcon,
  LayersIcon,
  ScanQRIcon,
  TrendingUpIcon,
  type IconProps,
} from './icons'

export type BottomTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0]

/**
 * Redesigned Floating Bottom Navigation Pill Bar.
 *
 * Implements the unified 5-tab layout matching Image 5:
 * - Home (HomeIcon + Label)
 * - Sets (LayersIcon + Label)
 * - Scan (Center elevated circular Hero button with ScanQRIcon)
 * - Progress (TrendingUpIcon + Label)
 * - Files (FolderIcon + Label)
 *
 * Active tabs display a rich Deep Forest (#052E24) capsule pill with white icon & label.
 * Inactive tabs render muted sage/slate tones with consistent 1.5px stroke outline icons.
 */

interface Destination {
  name: string
  label: string
  icon: (props: IconProps) => ReactElement
}

const LEFT_DESTINATIONS: Destination[] = [
  { name: 'index', label: 'Home', icon: HomeIcon },
  { name: 'sets/index', label: 'Sets', icon: LayersIcon },
]

const RIGHT_DESTINATIONS: Destination[] = [
  { name: 'progress', label: 'Progress', icon: TrendingUpIcon },
  { name: 'files/index', label: 'Files', icon: FolderIcon },
]

export function TabBar({ state, navigation, insets }: BottomTabBarProps): ReactElement | null {
  const router = useRouter()
  const { isDark } = useTheme()

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )

  const active = state.routes[state.index]?.name ?? ''

  // Hide tab bar during immersion/study/camera flows
  if (
    active === 'study' ||
    active === 'scan' ||
    active === 'scan-review' ||
    active === 'files/bag-studio'
  ) {
    return null
  }

  const go = (name: string): void => {
    navigation.navigate(name)
  }

  const isTabActive = (tabName: string): boolean => {
    if (tabName === 'index') {
      return active === 'index' || active === ''
    }
    if (tabName === 'sets/index') {
      return active === 'sets/index' || active.startsWith('sets/')
    }
    if (tabName === 'files/index') {
      return active === 'files/index' || active.startsWith('files/')
    }
    if (tabName === 'progress') {
      return active === 'progress'
    }
    return active === tabName
  }

  const renderTabItem = ({ name, label, icon: Icon }: Destination): ReactElement => {
    const selected = isTabActive(name)
    const activeColor = '#ffffff'
    const inactiveColor = isDark ? '#889591' : '#4C5854'

    return (
      <TouchableOpacity
        key={name}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => go(name)}
        activeOpacity={0.75}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          height: 48,
          marginHorizontal: 2,
          borderRadius: 24,
          backgroundColor: selected ? '#052E24' : 'transparent',
          paddingVertical: 4,
        }}
      >
        <Icon color={selected ? activeColor : inactiveColor} size={20} />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 11,
            marginTop: 2,
            fontWeight: selected ? '600' : '500',
            color: selected ? activeColor : inactiveColor,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom, 16),
        left: 14,
        right: 14,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 64,
          borderRadius: 36,
          backgroundColor: isDark ? '#111A17' : '#FFFFFF',
          paddingHorizontal: 8,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
          shadowColor: '#052E24',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.3 : 0.09,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        {/* Left Tabs: Home & Sets */}
        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
          {LEFT_DESTINATIONS.map(renderTabItem)}
        </View>

        {/* Center Hero Button: Scan / Camera FAB */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              isOnline
                ? 'Scan a page with the camera or import documents'
                : 'Create cards from pasted text'
            }
            accessibilityState={{
              selected: isOnline ? active === 'scan' : active === 'scan-review',
            }}
            onPress={() => {
              if (isOnline) {
                go('scan')
              } else {
                router.push('/scan-review?mode=paste')
              }
            }}
            activeOpacity={0.85}
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: '#052E24',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: isDark ? '#111A17' : '#FFFFFF',
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28,
              shadowRadius: 10,
              elevation: 9,
            }}
          >
            {isOnline ? (
              <ScanQRIcon color="#ffffff" size={24} />
            ) : (
              <FileTextIcon color="#ffffff" size={24} />
            )}
          </TouchableOpacity>
        </View>

        {/* Right Tabs: Progress & Files */}
        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
          {RIGHT_DESTINATIONS.map(renderTabItem)}
        </View>
      </View>
    </View>
  )
}

import type { ReactElement } from 'react'
import { Pressable, View } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { useTokenColor } from '../stores/theme'
import { ChartIcon, HomeIcon, LayersIcon, ScanIcon, UserIcon, type IconProps } from './icons'

/**
 * Redesigned Floating Bottom Tab Bar.
 *
 * Implements a solo floating Scan button on the left, and a dark teal/forest green
 * pill-shaped floating bar on the right containing the other tab destinations:
 * - Home (HomeIcon)
 * - Sets (LayersIcon)
 * - Progress (ChartIcon)
 * - Account (UserIcon)
 *
 * Icons only inside the pill (no text labels, matching the premium reference layout).
 * Active tab shows a clean white dot directly underneath its icon.
 */

interface Destination {
  /** The route name in `app/(app)/`, which is what `navigate` takes. */
  name: string
  label: string
  icon: (props: IconProps) => ReactElement
}

const DESTINATIONS: Destination[] = [
  { name: 'index', label: 'Home', icon: HomeIcon },
  { name: 'sets/index', label: 'Sets', icon: LayersIcon },
  { name: 'progress', label: 'Progress', icon: ChartIcon },
  { name: 'account', label: 'Account', icon: UserIcon },
]

export function TabBar({ state, navigation, insets }: BottomTabBarProps): ReactElement | null {
  const accent = useTokenColor('--accent')
  const onAccent = useTokenColor('--accent-foreground')

  const active = state.routes[state.index]?.name ?? ''

  if (active === 'study' || active === 'scan' || active === 'scan-review') {
    return null
  }

  const go = (name: string): void => {
    navigation.navigate(name)
  }

  // Active check helper that handles sub-routes (e.g. nested set screens)
  const isTabActive = (tabName: string): boolean => {
    if (tabName === 'sets/index') {
      return active === 'sets/index' || active.startsWith('sets/')
    }
    return active === tabName
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom, 16),
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
      }}
    >
      {/* 
        1. SOLO FLOATING SCAN BUTTON (LEFT SIDE)
        Styled in theme's accent color (clay/orange). 56x56 circular container.
      */}
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan a page with the camera"
          accessibilityState={{ selected: active === 'scan' }}
          onPress={() => {
            go('scan')
          }}
          style={{
            backgroundColor: accent,
            width: 56,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 8,
          }}
          className="active:opacity-85 rounded-full"
        >
          <ScanIcon color={onAccent} size={24} />
        </Pressable>
      </View>

      {/* Spacer */}
      <View style={{ width: 12 }} />

      {/* 
        2. FLOATING DARK TEAL TAB PILL (RIGHT SIDE)
        Rounded-2xl bar containing Home, Sets, and Progress icons.
        Has a premium dark green/teal finish with semi-rounded corners.
      */}
      <View
        style={{
          flex: 1,
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
          elevation: 8,
        }}
        className="bg-[#052e24] dark:bg-[#031a14] rounded-2xl"
      >
        {DESTINATIONS.map(({ name, label, icon: Icon }) => {
          const selected = isTabActive(name)
          const tint = selected ? '#ffffff' : '#86a39b' // White when active, soft teal-gray when inactive

          return (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => {
                go(name)
              }}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                height: 48,
                width: 56,
              }}
              className="active:opacity-75"
            >
              <Icon color={tint} size={24} />

              {/* Dot indicator underneath the active icon */}
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: selected ? '#ffffff' : 'transparent',
                  marginTop: 4,
                }}
              />
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

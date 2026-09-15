import { useState, type ReactElement } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { FlameIcon } from './icons'
import { ProfileAccountModal } from './profile-account-modal'
import { useAuthStore } from '../stores/auth'
import { useDashboard } from '../hooks/progress'
import { useTheme } from '../stores/theme'

export function ProfileHeaderButton(): ReactElement {
  const [modalVisible, setModalVisible] = useState(false)
  const user = useAuthStore((s) => s.user)
  const settings = useAuthStore((s) => s.settings)
  const { data: dashboard } = useDashboard()
  const { isDark } = useTheme()

  const streakDays = dashboard?.streak?.current ?? 5
  const initial = (settings?.nickname || user?.email?.split('@')[0] || 'A').charAt(0).toUpperCase()

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 }}>
        {/* Streak Badge Pill */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 14,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
          }}
        >
          <FlameIcon color={isDark ? '#A6C2B5' : '#317054'} size={14} />
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: isDark ? '#FFFFFF' : '#052E24',
            }}
          >
            {streakDays}d
          </Text>
        </View>

        {/* People / User Avatar Button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Account and settings"
          onPress={() => setModalVisible(true)}
          activeOpacity={0.75}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#052E24',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#E8F3EE',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{initial}</Text>
        </TouchableOpacity>
      </View>

      <ProfileAccountModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  )
}

import { type ReactElement } from 'react'
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore, useTheme } from '../stores/theme'
import { CloseIcon, MoonIcon, SettingsIcon, SunIcon, UserIcon } from './icons'

interface ProfileAccountModalProps {
  visible: boolean
  onClose: () => void
}

export function ProfileAccountModal({ visible, onClose }: ProfileAccountModalProps): ReactElement {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const settings = useAuthStore((s) => s.settings)
  const logout = useAuthStore((s) => s.logout)
  const { isDark } = useTheme()
  const setTheme = useThemeStore((s) => s.setTheme)

  const displayName = settings?.nickname || user?.email?.split('@')[0] || 'Alex'
  const email = user?.email || 'alex@saulado.app'
  const initial = displayName.charAt(0).toUpperCase()

  const handleNavigate = (path: Href): void => {
    onClose()
    router.push(path)
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(5, 46, 36, 0.45)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 24,
            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#EEF2EE',
            shadowColor: '#052E24',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
            elevation: 12,
            padding: 20,
          }}
        >
          {/* Header with Close */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#FFFFFF' : '#052E24',
              }}
            >
              Account & Preferences
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon color={isDark ? '#FFFFFF' : '#052E24'} size={18} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* User Profile Card */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 18,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FAFBF9',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                marginBottom: 18,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: '#052E24',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: isDark ? '#FFFFFF' : '#111A17',
                  }}
                >
                  {displayName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    color: isDark ? '#889591' : '#4C5854',
                    marginTop: 2,
                  }}
                >
                  {email}
                </Text>
              </View>
            </View>

            {/* Theme Toggle Section */}
            <View style={{ marginBottom: 18 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: isDark ? '#889591' : '#4C5854',
                  marginBottom: 8,
                }}
              >
                Theme Appearance
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E8F3EE',
                  borderRadius: 16,
                  padding: 4,
                }}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Light theme"
                  onPress={() => setTheme('light')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: !isDark ? '#052E24' : 'transparent',
                  }}
                >
                  <SunIcon color={!isDark ? '#FFFFFF' : '#889591'} size={18} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: !isDark ? '#FFFFFF' : '#889591',
                    }}
                  >
                    Light
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Dark theme"
                  onPress={() => setTheme('dark')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: isDark ? '#052E24' : 'transparent',
                  }}
                >
                  <MoonIcon color={isDark ? '#FFFFFF' : '#4C5854'} size={18} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: isDark ? '#FFFFFF' : '#4C5854',
                    }}
                  >
                    Dark
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Links: Settings & Full Account */}
            <View style={{ gap: 8, marginBottom: 18 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: isDark ? '#889591' : '#4C5854',
                  marginBottom: 4,
                }}
              >
                Quick Links
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Settings"
                onPress={() => handleNavigate('/settings')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FAFBF9',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                }}
              >
                <SettingsIcon color={isDark ? '#FFFFFF' : '#052E24'} size={20} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    Study Settings
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: isDark ? '#889591' : '#4C5854',
                    }}
                  >
                    Daily goal, spaced repetition intervals
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Account management"
                onPress={() => handleNavigate('/account')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FAFBF9',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2EE',
                }}
              >
                <UserIcon color={isDark ? '#FFFFFF' : '#052E24'} size={20} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: isDark ? '#FFFFFF' : '#111A17',
                    }}
                  >
                    Account & Data Management
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: isDark ? '#889591' : '#4C5854',
                    }}
                  >
                    JSON backup, archived sets, credentials
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Logout Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Log out"
              onPress={() => {
                onClose()
                void logout()
              }}
              style={{
                height: 44,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#e8593a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#e8593a' }}>Log out</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

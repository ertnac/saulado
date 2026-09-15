import { type ReactElement } from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AnsweringType } from '@saulado/shared'
import { CardsIcon, ChevronRightIcon, ListIcon, PencilIcon } from './icons'
import { useTheme } from '../stores/theme'

interface StudyModeSheetProps {
  visible: boolean
  currentMode: AnsweringType
  onSelectMode: (mode: AnsweringType) => void
  onClose: () => void
}

export function StudyModeSheet({
  visible,
  currentMode,
  onSelectMode,
  onClose,
}: StudyModeSheetProps): ReactElement {
  const insets = useSafeAreaInsets()
  const { isDark } = useTheme()

  const modes: Array<{
    type: AnsweringType
    title: string
    subtitle: string
    renderIcon: (isActive: boolean) => ReactElement
  }> = [
    {
      type: 'identification',
      title: 'Identification',
      subtitle: 'Type the correct term based on clinical effects.',
      renderIcon: (isActive: boolean) => (
        <PencilIcon color={isActive ? '#FFFFFF' : isDark ? '#A6C2B5' : '#317054'} size={20} />
      ),
    },
    {
      type: 'multiple-choice',
      title: 'Multiple Choice',
      subtitle: 'Select the right classification out of 4 options.',
      renderIcon: (isActive: boolean) => (
        <ListIcon color={isActive ? '#FFFFFF' : isDark ? '#A6C2B5' : '#317054'} size={20} />
      ),
    },
    {
      type: 'flashcard',
      title: 'Smart Flashcards',
      subtitle: 'Classic card flip with active recall grading.',
      renderIcon: (isActive: boolean) => (
        <CardsIcon color={isActive ? '#FFFFFF' : isDark ? '#A6C2B5' : '#317054'} size={20} />
      ),
    },
  ]

  const handleSelect = (mode: AnsweringType): void => {
    onSelectMode(mode)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(5, 46, 36, 0.45)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss study mode picker"
        />

        <View
          style={{
            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom + 16, 28),
            borderTopWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
            elevation: 20,
          }}
        >
          {/* Top Drag Handle */}
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB',
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />

          {/* Header Info */}
          <View style={{ marginBottom: 18 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: isDark ? '#A6C2B5' : '#317054',
                marginBottom: 4,
              }}
            >
              In-Session Mode
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                letterSpacing: -0.3,
                color: isDark ? '#FFFFFF' : '#052E24',
                marginBottom: 4,
              }}
            >
              Switch study mode without leaving the quiz
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '500',
                color: isDark ? '#889591' : '#4C5854',
              }}
            >
              Keep your progress and continue from the same card.
            </Text>
          </View>

          {/* Mode Option Cards */}
          <View style={{ gap: 10 }}>
            {modes.map((item) => {
              const isActive = currentMode === item.type
              return (
                <TouchableOpacity
                  key={item.type}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${item.title}`}
                  accessibilityState={{ selected: isActive }}
                  activeOpacity={0.8}
                  onPress={() => handleSelect(item.type)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 18,
                    backgroundColor: isActive
                      ? isDark
                        ? 'rgba(49, 112, 84, 0.22)'
                        : '#E8F3EE'
                      : isDark
                        ? 'rgba(255, 255, 255, 0.03)'
                        : '#FFFFFF',
                    borderWidth: isActive ? 1.5 : 1,
                    borderColor: isActive
                      ? '#317054'
                      : isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : '#EEF2EE',
                    gap: 14,
                  }}
                >
                  {/* Icon Badge */}
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      backgroundColor: isActive
                        ? '#052E24'
                        : isDark
                          ? 'rgba(255, 255, 255, 0.06)'
                          : '#E8F3EE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.renderIcon(isActive)}
                  </View>

                  {/* Title & Subtitle */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: isDark ? '#FFFFFF' : '#111A17',
                      }}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '500',
                        color: isDark ? '#889591' : '#4C5854',
                      }}
                    >
                      {item.subtitle}
                    </Text>
                  </View>

                  {/* Active Pill Badge or Chevron */}
                  {isActive ? (
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: isDark ? '#317054' : '#052E24',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: '#FFFFFF',
                        }}
                      >
                        Active
                      </Text>
                    </View>
                  ) : (
                    <ChevronRightIcon color={isDark ? '#4C5854' : '#889591'} size={18} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>
    </Modal>
  )
}

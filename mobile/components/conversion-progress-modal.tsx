import type { ReactElement } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'
import { CheckIcon, DocumentIcon } from './icons'
import { useTheme } from '../stores/theme'

export interface ConversionProgressModalProps {
  visible: boolean
  step: 1 | 2 | 3
  title: string
  detail: string
  fileName?: string
}

export function ConversionProgressModal({
  visible,
  step,
  title,
  detail,
  fileName,
}: ConversionProgressModalProps): ReactElement | null {
  const { isDark } = useTheme()

  if (!visible) return null

  // Progress percentage bar fill
  const progressPercent = step === 1 ? '33%' : step === 2 ? '68%' : '100%'

  const steps = [
    {
      index: 1,
      name: 'Upload & Prepare',
      desc: 'Connect to secure conversion engine',
    },
    {
      index: 2,
      name: 'Vector PDF Conversion',
      desc: 'Preserve slide layout & selectable text',
    },
    {
      index: 3,
      name: 'Offline Storage',
      desc: 'Save into on-device study library',
    },
  ]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Prevent hardware back button dismissal while conversion is running
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0ECE5',
            },
          ]}
        >
          {/* Header Pill */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: isDark ? '#1C2B25' : '#E8F3EE' }]}>
              <Text style={[styles.badgeText, { color: isDark ? '#A6C2B5' : '#317054' }]}>
                AUTOMATIC STUDY CONVERTER
              </Text>
            </View>
          </View>

          {/* Heading */}
          <Text style={[styles.heading, { color: isDark ? '#FFFFFF' : '#052E24' }]}>
            Importing Document
          </Text>

          {/* File Name Pill */}
          {fileName ? (
            <View
              style={[
                styles.fileNameContainer,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F4F7F5' },
              ]}
            >
              <DocumentIcon color={isDark ? '#A6C2B5' : '#317054'} size={14} />
              <Text
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[styles.fileNameText, { color: isDark ? '#E0ECE5' : '#111A17' }]}
              >
                {fileName}
              </Text>
            </View>
          ) : null}

          {/* Progress Bar */}
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE' },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: progressPercent,
                  backgroundColor: '#317054',
                },
              ]}
            />
          </View>

          {/* 3 Steps Vertical Stepper */}
          <View style={styles.stepsContainer}>
            {steps.map((s, idx) => {
              const isCompleted = step > s.index
              const isActive = step === s.index
              const isPending = step < s.index

              return (
                <View key={s.index} style={styles.stepItem}>
                  {/* Step Left Node & Connector */}
                  <View style={styles.nodeColumn}>
                    <View
                      style={[
                        styles.nodeCircle,
                        isCompleted && styles.nodeCircleCompleted,
                        isActive && [
                          styles.nodeCircleActive,
                          {
                            backgroundColor: isDark ? '#1C2B25' : '#E8F3EE',
                            borderColor: '#317054',
                          },
                        ],
                        isPending && [
                          styles.nodeCirclePending,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F4F2',
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E0ECE5',
                          },
                        ],
                      ]}
                    >
                      {isCompleted ? (
                        <CheckIcon color="#FFFFFF" size={12} />
                      ) : isActive ? (
                        <ActivityIndicator size="small" color="#317054" />
                      ) : (
                        <Text
                          style={[styles.nodeIndexText, { color: isDark ? '#889591' : '#889591' }]}
                        >
                          {s.index}
                        </Text>
                      )}
                    </View>
                    {idx < steps.length - 1 && (
                      <View
                        style={[
                          styles.connectorLine,
                          {
                            backgroundColor:
                              step > s.index
                                ? '#317054'
                                : isDark
                                  ? 'rgba(255,255,255,0.1)'
                                  : '#E0ECE5',
                          },
                        ]}
                      />
                    )}
                  </View>

                  {/* Step Description */}
                  <View style={styles.stepContent}>
                    <Text
                      style={[
                        styles.stepTitle,
                        {
                          color: isActive
                            ? isDark
                              ? '#FFFFFF'
                              : '#052E24'
                            : isCompleted
                              ? '#317054'
                              : isDark
                                ? '#889591'
                                : '#889591',
                          fontWeight: isActive ? '700' : '600',
                        },
                      ]}
                    >
                      {s.name}
                    </Text>
                    <Text style={[styles.stepDesc, { color: isDark ? '#889591' : '#64746B' }]}>
                      {s.desc}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>

          {/* Current Status Callout */}
          <View
            style={[
              styles.callout,
              {
                backgroundColor: isDark ? '#16231E' : '#F0F7F4',
                borderColor: isDark ? 'rgba(49, 112, 84, 0.3)' : '#D0E3D9',
              },
            ]}
          >
            <Text style={[styles.calloutTitle, { color: isDark ? '#A6C2B5' : '#052E24' }]}>
              {title}
            </Text>
            <Text style={[styles.calloutDetail, { color: isDark ? '#889591' : '#4C5854' }]}>
              {detail}
            </Text>
            {step === 2 && (
              <Text style={[styles.calloutHint, { color: isDark ? '#7EAF98' : '#317054' }]}>
                Vector rendering preserves selectable text & crisp zoom. Please keep Saulado open.
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 46, 36, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  badgeRow: {
    alignItems: 'flex-start',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  fileNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  fileNameText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  stepsContainer: {
    gap: 4,
    marginVertical: 4,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 14,
  },
  nodeColumn: {
    alignItems: 'center',
    width: 26,
  },
  nodeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  nodeCircleCompleted: {
    backgroundColor: '#317054',
    borderColor: '#317054',
  },
  nodeCircleActive: {
    borderWidth: 2,
  },
  nodeCirclePending: {
    borderWidth: 1,
  },
  nodeIndexText: {
    fontSize: 11,
    fontWeight: '700',
  },
  connectorLine: {
    width: 2,
    height: 24,
    marginVertical: 2,
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 14,
  },
  stepTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
  },
  callout: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  calloutDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  calloutHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
})

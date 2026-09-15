import { type ReactElement, useEffect, useState } from 'react'
import { Pressable, Text, View, StyleSheet, TouchableOpacity } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import type { SessionCard } from '@saulado/shared'
import { CheckIcon, CloseIcon, RotateCwIcon, VolumeIcon } from './icons'
import { useTheme } from '../stores/theme'

interface FlashcardCardProps {
  card: SessionCard
  disabled: boolean
  onSubmit: (overrideValues?: Record<number, string>) => void
}

export function FlashcardCard({ card, disabled, onSubmit }: FlashcardCardProps): ReactElement {
  const flip = useSharedValue(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const { isDark } = useTheme()

  useEffect(() => {
    flip.value = 0
    setIsFlipped(false)
  }, [card.cardId, flip])

  const handleFlip = () => {
    if (disabled) return
    const nextVal = isFlipped ? 0 : 1
    flip.value = withTiming(nextVal, { duration: 420 })
    setIsFlipped(!isFlipped)
  }

  const handleRating = (isCorrect: boolean) => {
    if (disabled) return

    const overrideValues: Record<number, string> = {}
    if (isCorrect && card.blankAnswers) {
      for (let i = 0; i < card.blankCount; i++) {
        overrideValues[i] = card.blankAnswers[i] ?? ''
      }
    } else {
      for (let i = 0; i < card.blankCount; i++) {
        overrideValues[i] = ''
      }
    }

    onSubmit(overrideValues)
  }

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flip.value, [0, 0.5, 1], [0, 90, 90])
    const opacity = interpolate(flip.value, [0, 0.45, 0.5], [1, 1, 0])
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity,
    }
  })

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flip.value, [0, 0.5, 1], [-90, -90, 0])
    const opacity = interpolate(flip.value, [0, 0.5, 0.55], [0, 0, 1])
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      opacity,
    }
  })

  // Derive term and context
  const primaryAnswer = card.blankAnswers?.[0] || 'Concept Term'
  const contextSentence = card.segments
    .map((s) => (s.kind === 'text' ? s.text : '______'))
    .join('')
    .trim()

  const categoryTag = card.tags?.[0] ? card.tags[0].toUpperCase() : 'CONCEPT TERM'

  return (
    <View style={{ gap: 20, width: '100%' }}>
      <View style={styles.container}>
        {/* ── FRONT SIDE (Matching Image 3) ── */}
        <Animated.View
          style={[styles.face, frontAnimatedStyle]}
          pointerEvents={isFlipped ? 'none' : 'auto'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Card Front. Tap to flip."
            onPress={handleFlip}
            disabled={disabled}
            style={{
              flex: 1,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#EEF2EE',
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              padding: 24,
              justifyContent: 'space-between',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.2 : 0.04,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            {/* Header: Category Tag & Audio Icon */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: isDark ? '#A6C2B5' : '#317054',
                }}
              >
                {categoryTag}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Audio pronunciation"
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation()
                }}
              >
                <VolumeIcon color={isDark ? '#889591' : '#4C5854'} size={18} />
              </TouchableOpacity>
            </View>

            {/* Center Concept & Subtext */}
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: '800',
                  letterSpacing: -0.5,
                  textAlign: 'center',
                  color: isDark ? '#FFFFFF' : '#052E24',
                  marginBottom: 8,
                }}
              >
                {primaryAnswer}
              </Text>
              {contextSentence.length > 0 && (
                <Text
                  numberOfLines={3}
                  style={{
                    fontSize: 14,
                    fontWeight: '500',
                    textAlign: 'center',
                    color: isDark ? '#889591' : '#6B9985',
                    lineHeight: 20,
                    maxWidth: '90%',
                  }}
                >
                  {contextSentence}
                </Text>
              )}
            </View>

            {/* Bottom Affordance: TAP CARD TO FLIP */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <RotateCwIcon color={isDark ? '#A6C2B5' : '#317054'} size={14} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: isDark ? '#A6C2B5' : '#317054',
                }}
              >
                Tap Card to Flip
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* ── BACK SIDE (Revealed Answer) ── */}
        <Animated.View
          style={[styles.face, styles.backFace, backAnimatedStyle]}
          pointerEvents={isFlipped ? 'auto' : 'none'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Card Back. Tap to flip back."
            onPress={handleFlip}
            disabled={disabled}
            style={{
              flex: 1,
              borderRadius: 28,
              borderWidth: 1.5,
              borderColor: isDark ? '#317054' : '#6B9985',
              backgroundColor: isDark ? '#052E24' : '#F4FAF7',
              padding: 24,
              justifyContent: 'space-between',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.3 : 0.05,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            {/* Header: Answer Tag */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#317054',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckIcon color="#FFFFFF" size={12} />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: isDark ? '#A6C2B5' : '#317054',
                  }}
                >
                  Full Answer & Context
                </Text>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Audio pronunciation"
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation()
                }}
              >
                <VolumeIcon color={isDark ? '#A6C2B5' : '#4C5854'} size={18} />
              </TouchableOpacity>
            </View>

            {/* Center Answer Explanation */}
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>
              {card.blankAnswers && card.blankAnswers.length > 0
                ? card.blankAnswers.map((ans, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: '100%',
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 16,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                        marginBottom: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: '700',
                          color: isDark ? '#FFFFFF' : '#052E24',
                          textAlign: 'center',
                        }}
                      >
                        {ans}
                      </Text>
                    </View>
                  ))
                : null}

              {contextSentence.length > 0 && (
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '500',
                    textAlign: 'center',
                    color: isDark ? 'rgba(255,255,255,0.85)' : '#4C5854',
                    lineHeight: 22,
                    marginTop: 8,
                  }}
                >
                  {contextSentence}
                </Text>
              )}
            </View>

            {/* Bottom Flip Affordance */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <RotateCwIcon color={isDark ? '#A6C2B5' : '#317054'} size={14} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: isDark ? '#A6C2B5' : '#317054',
                }}
              >
                Tap to Flip Back
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>

      {/* ── FOOTER: RECALL RATING (Matching Image 3) ── */}
      <View style={{ gap: 10, marginTop: 4 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            textAlign: 'center',
            color: isDark ? '#889591' : '#4C5854',
          }}
        >
          Did you recall this card correctly?
        </Text>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Incorrect Button */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Mark Incorrect"
            disabled={disabled}
            activeOpacity={0.8}
            onPress={() => handleRating(false)}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: '#EF4444',
              backgroundColor: isDark ? '#111A17' : '#FFFFFF',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <CloseIcon color="#EF4444" size={16} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>Incorrect</Text>
          </TouchableOpacity>

          {/* Correct Button */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Mark Correct"
            disabled={disabled}
            activeOpacity={0.8}
            onPress={() => handleRating(true)}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 18,
              backgroundColor: '#052E24',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              shadowColor: '#052E24',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <CheckIcon color="#FFFFFF" size={16} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Correct</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    height: 320,
  },
  face: {
    width: '100%',
    height: 320,
  },
  backFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})

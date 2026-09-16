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

  const getAnswerForOrdinal = (ordinal: number): string => {
    if (card.blankAnswers && card.blankAnswers[ordinal]) {
      return card.blankAnswers[ordinal]
    }
    if (card.cardAnswers && card.cardAnswers[ordinal]) {
      return card.cardAnswers[ordinal].answerText
    }
    return ''
  }

  const handleRating = (isCorrect: boolean) => {
    if (disabled) return

    const overrideValues: Record<number, string> = {}
    for (let i = 0; i < card.blankCount; i++) {
      overrideValues[i] = isCorrect ? getAnswerForOrdinal(i) : ''
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

  const categoryTag = card.tags?.[0] ? card.tags[0].toUpperCase() : 'CONCEPT QUESTION'
  const conceptTag = card.tags?.[1] ? `#${card.tags[1]}` : null

  return (
    <View style={{ gap: 20, width: '100%' }}>
      <View style={styles.container}>
        {/* ── FRONT SIDE (The Question / Prompt Face) ── */}
        <Animated.View
          style={[styles.face, frontAnimatedStyle]}
          pointerEvents={isFlipped ? 'none' : 'auto'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Card Front: Question. Tap to reveal answer."
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
            {/* Header: Category Tag, Question Badge & Audio Icon */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: isDark ? 'rgba(49, 112, 84, 0.25)' : '#E8F3EE',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: isDark ? '#A6C2B5' : '#317054',
                    }}
                  >
                    Question
                  </Text>
                </View>
              </View>

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

            {/* Center: Question Prompt with Cloze Blanks */}
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 18 }}>
              <Text
                style={{
                  fontSize: 19,
                  fontWeight: '600',
                  lineHeight: 29,
                  color: isDark ? '#FFFFFF' : '#111A17',
                  textAlign: 'left',
                }}
              >
                {card.segments.map((segment, index) => {
                  if (segment.kind === 'text') {
                    return <Text key={`t-${index}`}>{segment.text}</Text>
                  }
                  return (
                    <Text
                      key={`b-${segment.ordinal}`}
                      style={{
                        fontWeight: '800',
                        color: isDark ? '#A6C2B5' : '#317054',
                        backgroundColor: isDark ? 'rgba(49, 112, 84, 0.35)' : '#E8F3EE',
                      }}
                    >
                      {' [ ? ] '}
                    </Text>
                  )
                })}
              </Text>

              {conceptTag && (
                <View style={{ flexDirection: 'row', marginTop: 14 }}>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#EEF2EE',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: isDark ? '#889591' : '#6B9985',
                      }}
                    >
                      {conceptTag}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Bottom Affordance: Tap Card to Reveal Answer */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderTopWidth: 1,
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#EEF2EE',
                paddingTop: 14,
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
                Tap Card to Reveal Answer
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* ── BACK SIDE (Revealed Answer Face) ── */}
        <Animated.View
          style={[styles.face, styles.backFace, backAnimatedStyle]}
          pointerEvents={isFlipped ? 'auto' : 'none'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Card Back: Revealed Answer. Tap to flip back."
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
                  Answer Revealed
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

            {/* Center: Revealed Answer Box(es) and Context Sentence */}
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 14, gap: 12 }}>
              {/* Answer Boxes */}
              <View style={{ gap: 8 }}>
                {Array.from({ length: card.blankCount }).map((_, idx) => {
                  const answer = getAnswerForOrdinal(idx)
                  return (
                    <View
                      key={idx}
                      style={{
                        width: '100%',
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 16,
                        backgroundColor: isDark ? 'rgba(49, 112, 84, 0.25)' : '#E8F3EE',
                        borderWidth: 1.5,
                        borderColor: isDark ? '#317054' : '#6B9985',
                        alignItems: 'center',
                      }}
                    >
                      {card.blankCount > 1 && (
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: isDark ? '#A6C2B5' : '#317054',
                            marginBottom: 3,
                          }}
                        >
                          Blank {idx + 1}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: '800',
                          letterSpacing: -0.3,
                          color: isDark ? '#FFFFFF' : '#052E24',
                          textAlign: 'center',
                        }}
                      >
                        {answer || 'Answer'}
                      </Text>
                    </View>
                  )
                })}
              </View>

              {/* Full Context Sentence with Highlighted Answer */}
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  fontWeight: '500',
                  color: isDark ? 'rgba(255, 255, 255, 0.85)' : '#4C5854',
                  textAlign: 'center',
                  marginTop: 4,
                }}
              >
                {card.segments.map((segment, index) => {
                  if (segment.kind === 'text') {
                    return <Text key={`bt-${index}`}>{segment.text}</Text>
                  }
                  const ans = getAnswerForOrdinal(segment.ordinal)
                  return (
                    <Text
                      key={`bb-${segment.ordinal}`}
                      style={{
                        fontWeight: '800',
                        color: isDark ? '#A6C2B5' : '#317054',
                        textDecorationLine: 'underline',
                      }}
                    >
                      {` ${ans || '___'} `}
                    </Text>
                  )
                })}
              </Text>
            </View>

            {/* Bottom Flip Affordance: Tap to Flip Back */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderTopWidth: 1,
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(49, 112, 84, 0.15)',
                paddingTop: 14,
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
    minHeight: 330,
  },
  face: {
    width: '100%',
    minHeight: 330,
  },
  backFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})

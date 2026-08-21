import { type ReactElement, useEffect, useState } from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import type { SessionCard } from '@saulado/shared'
import { Badge, LINE_HEIGHT, PARAGRAPH_FONT_SIZE, tokenize } from './study-card'
import { CheckIcon, CloseIcon, RotateCwIcon } from './icons'
import { useTokenColor } from '../stores/theme'

interface FlashcardCardProps {
  card: SessionCard
  disabled: boolean
  onSubmit: (overrideValues?: Record<number, string>) => void
}

export function FlashcardCard({ card, disabled, onSubmit }: FlashcardCardProps): ReactElement {
  const flip = useSharedValue(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const mutedColor = useTokenColor('--muted-foreground')
  const successColor = useTokenColor('--success')
  const dangerColor = useTokenColor('--danger')
  const primaryFg = useTokenColor('--primary-foreground')

  useEffect(() => {
    flip.value = 0
    setIsFlipped(false)
  }, [card.cardId, flip])

  const handleFlip = () => {
    if (disabled || isFlipped) return
    flip.value = withTiming(1, { duration: 420 })
    setIsFlipped(true)
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

  const meta = card.isNew || card.isLeech || card.tags.length > 0
  const tokens = tokenize(card.segments)

  return (
    <View style={styles.container}>
      {/* ── FRONT SIDE ── */}
      <Animated.View
        style={[styles.face, frontAnimatedStyle]}
        pointerEvents={isFlipped ? 'none' : 'auto'}
      >
        <Pressable
          className="flex-1 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm justify-between"
          onPress={handleFlip}
          disabled={disabled || isFlipped}
        >
          <View>
            {meta && (
              <View className="mb-4 flex-row flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                <View className="flex-row flex-wrap items-center gap-1.5">
                  {card.isNew && (
                    <Badge
                      text="✨ New"
                      className="bg-primary/15 border-primary/30"
                      textClassName="text-primary"
                    />
                  )}
                  {card.isLeech && (
                    <Badge
                      text="⚠️ Review"
                      className="bg-warning/15 border-warning/30"
                      textClassName="text-warning"
                    />
                  )}
                  {card.tags.map((tag) => (
                    <Badge
                      key={tag}
                      text={`#${tag}`}
                      className="bg-surface-muted border-border/80"
                      textClassName="text-foreground/80"
                    />
                  ))}
                </View>
                <View className="rounded-full bg-accent/15 px-2.5 py-0.5 border border-accent/30">
                  <Text className="text-[10px] font-bold text-accent-strong uppercase tracking-wider">
                    Question
                  </Text>
                </View>
              </View>
            )}

            <View className="flex-row flex-wrap items-center leading-loose py-2">
              {tokens.map((token, index) => {
                if (token.kind === 'break') {
                  return (
                    <View
                      key={`n${String(index)}`}
                      style={{ width: '100%', height: token.height }}
                    />
                  )
                }
                if (token.kind === 'word') {
                  return (
                    <Text
                      key={`t${String(index)}`}
                      style={{ fontSize: PARAGRAPH_FONT_SIZE, lineHeight: LINE_HEIGHT }}
                      className="text-foreground"
                    >
                      {token.text}
                    </Text>
                  )
                }
                return (
                  <View
                    key={`b${String(token.ordinal)}`}
                    className="mx-1 justify-center rounded-lg bg-surface-muted border border-border/80 px-2.5 py-0.5 shadow-xs"
                  >
                    <Text
                      style={{ fontSize: PARAGRAPH_FONT_SIZE - 1 }}
                      className="font-mono font-bold text-primary"
                    >
                      {'[ ? ]'}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

          <View className="mt-8 flex-row items-center justify-center gap-2 border-t border-border/40 pt-4">
            <RotateCwIcon color={mutedColor} size={15} />
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tap card to flip
            </Text>
          </View>
        </Pressable>
      </Animated.View>

      {/* ── BACK SIDE ── */}
      <Animated.View
        style={[styles.face, styles.backFace, backAnimatedStyle]}
        pointerEvents={isFlipped ? 'auto' : 'none'}
      >
        <View className="flex-1 rounded-3xl border border-border/80 bg-surface p-6 shadow-sm justify-between">
          <View>
            <View className="mb-4 flex-row items-center justify-between border-b border-border/40 pb-3">
              <View className="flex-row items-center gap-1.5">
                <View className="h-6 w-6 rounded-full bg-success/20 items-center justify-center">
                  <CheckIcon color={successColor} size={13} />
                </View>
                <Text className="text-xs font-bold uppercase tracking-wider text-success">
                  Answer
                </Text>
              </View>

              <View className="rounded-full bg-success/10 px-2.5 py-0.5 border border-success/30">
                <Text className="text-[11px] font-semibold text-success">Revealed</Text>
              </View>
            </View>

            <View className="items-center justify-center gap-3 py-6">
              {card.blankAnswers && card.blankAnswers.length > 0 ? (
                card.blankAnswers.map((answer, index) => (
                  <View
                    key={index}
                    className="w-full rounded-2xl bg-success/12 border border-success/25 px-5 py-4 items-center justify-center shadow-sm"
                  >
                    {card.blankCount > 1 && (
                      <Text className="text-[11px] font-bold text-success/80 uppercase tracking-widest mb-1">
                        Blank {index + 1}
                      </Text>
                    )}
                    <Text className="text-center text-xl font-bold text-success tracking-tight">
                      {answer}
                    </Text>
                  </View>
                ))
              ) : (
                <View className="p-4 items-center justify-center">
                  <Text className="text-center text-sm text-muted-foreground">
                    No answer data available for this card.
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View className="mt-4 flex-row items-center justify-between gap-3 border-t border-border/40 pt-4">
            <Pressable
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 py-3.5 flex-row gap-2 active:bg-danger/20"
              onPress={() => handleRating(false)}
            >
              <CloseIcon color={dangerColor} size={16} />
              <Text className="font-bold text-danger text-sm">Need Review</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-2xl bg-primary py-3.5 flex-row gap-2 active:bg-primary/90 shadow-sm"
              onPress={() => handleRating(true)}
            >
              <CheckIcon color={primaryFg} size={16} />
              <Text className="font-bold text-primary-foreground text-sm">Got It</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    minHeight: 280,
  },
  face: {
    width: '100%',
    minHeight: 280,
  },
  backFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})

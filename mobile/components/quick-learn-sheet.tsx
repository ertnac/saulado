import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import type { StudySet } from '@saulado/shared'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { flattenPages, useSets } from '../hooks/cards'
import { useTokenColor } from '../stores/theme'
import { Button } from './button'
import { ChevronLeftIcon, ChevronRightIcon, ZapIcon } from './icons'

/**
 * A bottom sheet that lets the user pick a set (or sub-set) to study.
 *
 * Two-step flow:
 * 1. All root sets are listed. Tapping a set with children drills into it.
 *    Tapping a leaf navigates straight to `/study?set=<id>`.
 * 2. The drill-down shows "Study all of <title>" at the top (which studies
 *    every card in the set and its subtree), followed by the sub-sets. Tapping
 *    a sub-set navigates to `/study?set=<subId>`.
 *
 * Built with `Modal` + `react-native-reanimated` rather than a third-party
 * bottom-sheet library. The drag-to-dismiss uses `PanResponder` from React
 * Native core, so no extra dependency is needed.
 */

const SCREEN_HEIGHT = Dimensions.get('window').height
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.55

/**
 * A row for a set in the picker.
 *
 * Different from the library's `SetRow` in two ways: no navigation on tap
 * (the sheet decides what tapping does), and the chevron is conditional — it
 * appears only when the set has children, signalling that the tap will drill
 * down rather than navigate away.
 */
function PickerRow({
  set,
  onTap,
}: {
  set: StudySet
  onTap: (set: StudySet) => void
}): ReactElement {
  const muted = useTokenColor('--muted-foreground')

  const own = `${String(set.cardCount)} ${set.cardCount === 1 ? 'card' : 'cards'}`
  const nested = set.subtreeCardCount - set.cardCount
  const children =
    set.childCount === 0
      ? ''
      : ` · ${String(set.childCount)} ${set.childCount === 1 ? 'sub-set' : 'sub-sets'}`

  const detail = nested <= 0 ? own + children : `${own} · ${String(nested)} in sub-sets${children}`

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${set.title}. ${detail}`}
      onPress={() => onTap(set)}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-foreground">{set.title}</Text>
        <Text className="text-sm text-muted-foreground">{detail}</Text>
      </View>
      {set.childCount > 0 && <ChevronRightIcon color={muted} size={18} />}
    </Pressable>
  )
}

export function QuickLearnSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}): ReactElement {
  const router = useRouter()
  const muted = useTokenColor('--muted-foreground')
  const foreground = useTokenColor('--foreground')
  const primary = useTokenColor('--primary')

  // ── Drill-down state ────────────────────────────────────────────────────
  const [parent, setParent] = useState<StudySet | null>(null)

  // Root sets (always fetched while sheet is visible) and children of the
  // drilled-into set.
  const rootSets = useSets({ parent: null })
  const childSets = useSets({ parent: parent?.id ?? null })

  const rootItems = flattenPages(rootSets.data)
  const childItems = flattenPages(childSets.data)

  // ── Animation ───────────────────────────────────────────────────────────
  const translateY = useSharedValue(SHEET_HEIGHT)
  const backdropOpacity = useSharedValue(0)

  const animatedSheet = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const animatedBackdrop = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const open = useCallback(() => {
    translateY.value = withTiming(0, { duration: 300 })
    backdropOpacity.value = withTiming(1, { duration: 250 })
  }, [translateY, backdropOpacity])

  const close = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, { duration: 250 })
    backdropOpacity.value = withTiming(0, { duration: 200 })
    // Delay the modal dismiss until the animation completes.
    setTimeout(() => {
      onClose()
      setParent(null)
    }, 250)
  }, [translateY, backdropOpacity, onClose])

  useEffect(() => {
    if (visible) open()
  }, [visible, open])

  // ── Swipe-to-dismiss via PanResponder ───────────────────────────────────
  // Using a ref so the responder is stable across renders. The shared values
  // it captures (`translateY`) are refs themselves, so they do not stale.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Claim the gesture only for a vertical drag — horizontal swipes and
      // taps inside the list stay untouched.
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 8,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) {
          translateY.value = g.dy
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 100 || g.vy > 0.8) {
          close()
        } else {
          translateY.value = withTiming(0, { duration: 250 })
        }
      },
    }),
  ).current

  // ── Navigation ──────────────────────────────────────────────────────────
  const study = (setId: string): void => {
    close()
    // Give the sheet time to animate out before navigating, so the user
    // sees the sheet close rather than having it vanish.
    setTimeout(() => {
      router.push(`/study?set=${setId}`)
    }, 300)
  }

  const handleTap = (set: StudySet): void => {
    if (set.childCount > 0) {
      // Drill down into this set
      setParent(set)
    } else {
      // Leaf set — go straight to study
      study(set.id)
    }
  }

  // ── Which data to show ──────────────────────────────────────────────────
  const isDrilled = parent !== null
  const sets = isDrilled ? childItems : rootItems
  const loading = isDrilled ? childSets.isPending : rootSets.isPending
  const error = isDrilled ? childSets.isError : rootSets.isError
  const refetch = isDrilled ? childSets.refetch : rootSets.refetch

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* Backdrop */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }, animatedBackdrop]}
        />
      </Pressable>

      {/* Sheet */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: SHEET_HEIGHT,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
          },
          animatedSheet,
        ]}
        className="bg-background"
      >
        {/* Drag handle — this is the swipe region */}
        <View {...panResponder.panHandlers} className="items-center pb-1 pt-3">
          <View className="h-1 w-10 rounded-full bg-border" />
        </View>

        {/* Header */}
        <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
          {isDrilled && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to all sets"
              onPress={() => setParent(null)}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
            >
              <ChevronLeftIcon color={foreground} size={20} />
            </Pressable>
          )}
          <View className="flex-1">
            <Text className="text-lg font-semibold text-foreground">
              {isDrilled ? parent.title : 'Quick Learn'}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {isDrilled ? 'Choose a scope to study' : 'Pick a set to start studying'}
            </Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-2 px-5 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* "Study all" option when drilled into a set */}
          {isDrilled && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Study all cards in ${parent.title}. ${String(parent.subtreeCardCount)} cards total.`}
              onPress={() => study(parent.id)}
              className="min-h-14 flex-row items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 active:opacity-70"
            >
              <ZapIcon color={primary} size={20} />
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-semibold text-foreground">
                  Study all of {parent.title}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {String(parent.subtreeCardCount)}{' '}
                  {parent.subtreeCardCount === 1 ? 'card' : 'cards'} total
                </Text>
              </View>
              <ChevronRightIcon color={muted} size={18} />
            </Pressable>
          )}

          {/* Sub-sets header when drilled */}
          {isDrilled && childItems.length > 0 && (
            <Text className="mt-2 text-sm font-medium text-muted-foreground">
              Or pick a sub-set
            </Text>
          )}

          {loading ? (
            <ActivityIndicator accessibilityLabel="Loading sets" className="mt-6" />
          ) : error ? (
            <View className="gap-3 rounded-xl border border-border bg-surface p-5">
              <Text className="text-sm text-warning">Could not load your sets.</Text>
              <Button
                label="Try again"
                variant="outline"
                className="self-start"
                onPress={() => {
                  void refetch()
                }}
              />
            </View>
          ) : sets.length === 0 ? (
            <Text className="mt-4 text-center text-sm text-muted-foreground">
              {isDrilled
                ? 'No sub-sets in this set.'
                : 'No sets yet. Create one on this screen first.'}
            </Text>
          ) : (
            sets.map((set) => <PickerRow key={set.id} set={set} onTap={handleTap} />)
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

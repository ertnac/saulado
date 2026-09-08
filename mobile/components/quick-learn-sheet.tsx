import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { onlineManager } from '@tanstack/react-query'
import type { StudySet } from '@saulado/shared'
import { flattenPages, useSets } from '../hooks/cards'
import { useOfflineSetsStore } from '../stores/offline-sets'
import { useTokenColor } from '../stores/theme'
import { Button } from './button'
import { BookOpenIcon, ChevronLeftIcon, ChevronRightIcon, ZapIcon } from './icons'

const SCREEN_HEIGHT = Dimensions.get('window').height
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.55

function PickerRow({
  set,
  onTap,
}: {
  set: StudySet
  onTap: (set: StudySet) => void
}): ReactElement {
  const primary = useTokenColor('--primary')
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
      className="min-h-16 flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5 active:opacity-75"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface-muted">
        <BookOpenIcon color={primary} size={20} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-base font-semibold text-foreground">
          {set.title}
        </Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
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

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )
  const isOffline = !isOnline
  const offlineStore = useOfflineSetsStore()

  const [parent, setParent] = useState<StudySet | null>(null)

  const rootSets = useSets({ parent: null })
  const childSets = useSets({ parent: parent?.id ?? null })

  const offlineRootSets: StudySet[] = Object.values(offlineStore.sets)
    .filter(
      (s) =>
        s.status === 'available' &&
        Boolean(
          s.isDownloaded || s.syncStatus?.startsWith('pending_') || s.setId.startsWith('temp-set-'),
        ) &&
        s.metadata &&
        !s.metadata.parentId &&
        !s.metadata.archivedAt,
    )
    .map((s) => s.metadata!)

  const offlineChildSets: StudySet[] = parent
    ? Object.values(offlineStore.sets)
        .filter(
          (s) =>
            s.status === 'available' &&
            Boolean(
              s.isDownloaded ||
              s.syncStatus?.startsWith('pending_') ||
              s.setId.startsWith('temp-set-'),
            ) &&
            s.metadata &&
            s.metadata.parentId === parent.id &&
            !s.metadata.archivedAt,
        )
        .map((s) => s.metadata!)
    : []

  const rootFromQuery = flattenPages(rootSets.data)
  const childFromQuery = flattenPages(childSets.data)

  const rootItems = isOffline
    ? offlineRootSets
    : rootFromQuery.length > 0
      ? rootFromQuery
      : offlineRootSets
  const childItems = isOffline
    ? offlineChildSets
    : childFromQuery.length > 0
      ? childFromQuery
      : offlineChildSets

  // ── React Native standard Animated ──────────────────────────────────────
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  const open = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [translateY, backdropOpacity])

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose()
      setParent(null)
    })
  }, [translateY, backdropOpacity, onClose])

  useEffect(() => {
    if (visible) {
      open()
    }
  }, [visible, open])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 8,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) {
          translateY.setValue(g.dy)
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 100 || g.vy > 0.8) {
          close()
        } else {
          Animated.timing(translateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start()
        }
      },
    }),
  ).current

  const study = (setId: string): void => {
    close()
    setTimeout(() => {
      router.push(`/study?set=${setId}`)
    }, 250)
  }

  const handleTap = (set: StudySet): void => {
    if (set.childCount > 0) {
      setParent(set)
    } else {
      study(set.id)
    }
  }

  const isDrilled = parent !== null
  const sets = isDrilled ? childItems : rootItems
  const loading = isOffline ? false : isDrilled ? childSets.isPending : rootSets.isPending
  const error = isOffline ? false : isDrilled ? childSets.isError : rootSets.isError
  const refetch = isDrilled ? childSets.refetch : rootSets.refetch

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }, { opacity: backdropOpacity }]}
        />
      </Pressable>

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
            transform: [{ translateY }],
          },
        ]}
        className="bg-background"
      >
        <View {...panResponder.panHandlers} className="items-center pb-1 pt-3">
          <View className="h-1 w-10 rounded-full bg-border" />
        </View>

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

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-2 px-5 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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

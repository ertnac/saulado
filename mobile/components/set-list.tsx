import { useState, useSyncExternalStore, type ReactElement } from 'react'
import { onlineManager } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SET_TITLE_MAX_LENGTH, type StudySet } from '@saulado/shared'
import {
  flattenPages,
  useAllSets,
  useArchiveSet,
  useCreateSet,
  useDeleteSet,
  useRenameSet,
  useSets,
} from '../hooks/cards'
import { useDueCounts } from '../hooks/study'
import {
  exportSingleSetAsJson,
  saveJsonToDevice,
  shareJsonPayload,
} from '../services/json-transfer'
import { useTokenColor } from '../stores/theme'
import { useOfflineSetsStore } from '../stores/offline-sets'
import { downloadSet, removeOfflineSet } from '../lib/offline/sets'
import { resolveEntityId } from '../lib/offline/id-remap'
import { Button } from './button'
import {
  ArchiveIcon,
  BookOpenIcon,
  ChevronRightIcon,
  CloudIcon,
  CloudOffIcon,
  DownloadIcon,
  EditIcon,
  FolderInputIcon,
  ShareIcon,
  TrashIcon,
} from './icons'
import { MoveSetModal } from './move-set-modal'

/**
 * A level of the set tree: the sets directly under `parent`, and one input to add
 * another.
 *
 * One component for both the library root and the sub-sets of an open set,
 * because they are the same list with a different `parentId` — the web splits
 * them across `SetsPage` and `SetDetailPage` only because those pages differ in
 * everything *else* on them.
 *
 * Creation is an inline input rather than the web's dialog. A modal to type one
 * field is a heavy gesture on a phone, and this form has exactly one field:
 * descriptions were removed from set creation deliberately, so there is nothing
 * left for a dialog to lay out.
 */

/**
 * The count line under a title.
 *
 * Nesting gives every set two numbers, and the subtree figure is printed only
 * when it differs — "12 cards · 12 in sub-sets" on a leaf is noise, and the
 * difference is what tells the user where the cards actually are.
 */
function countLabel(set: StudySet): string {
  const own = `${String(set.cardCount)} ${set.cardCount === 1 ? 'card' : 'cards'}`
  const nested = set.subtreeCardCount - set.cardCount
  const children =
    set.childCount === 0
      ? ''
      : ` · ${String(set.childCount)} ${set.childCount === 1 ? 'sub-set' : 'sub-sets'}`

  return nested <= 0 ? own + children : `${own} · ${String(nested)} in sub-sets${children}`
}

function SetRow({
  set,
  onPick,
}: {
  set: StudySet
  onPick?: (set: StudySet) => void
}): ReactElement {
  const router = useRouter()
  const deleteSet = useDeleteSet()
  const archiveSet = useArchiveSet()
  const renameSet = useRenameSet()
  const dueCounts = useDueCounts()

  const [menuVisible, setMenuVisible] = useState(false)
  const [renameVisible, setRenameVisible] = useState(false)
  const [moveVisible, setMoveVisible] = useState(false)
  const [newTitle, setNewTitle] = useState(set.title)

  const warning = useTokenColor('--warning')
  const muted = useTokenColor('--muted-foreground')
  const foreground = useTokenColor('--foreground')

  // Determine an icon color based on set.id to give subjects distinct identities
  // Primary (Forest), Accent (Coral), Highlight (Terracotta/Sand variation)
  const colorIndex = set.id.charCodeAt(set.id.length - 1) % 3

  let iconBgClass = 'bg-primary/10'
  let iconToken: '--primary' | '--accent' | '--success' = '--primary'
  if (colorIndex === 1) {
    iconBgClass = 'bg-accent/10'
    iconToken = '--accent'
  } else if (colorIndex === 2) {
    iconBgClass = 'bg-success/10'
    iconToken = '--success'
  }

  const iconColor = useTokenColor(iconToken)
  const onPrimary = useTokenColor('--primary-foreground')

  const countEntry = dueCounts.data?.counts.find((c) => c.studySetId === set.id)
  const totalCards = set.subtreeCardCount
  const masteredCards = countEntry?.mastered ?? 0
  const dueCards = countEntry?.due ?? 0
  const progressPercent = totalCards > 0 ? (masteredCards / totalCards) * 100 : 0

  const handleShare = (): void => {
    setMenuVisible(false)
    void exportSingleSetAsJson(set.id, { title: set.title, color: set.color })
      .then((json) => shareJsonPayload(`${set.title}.json`, json))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Could not build JSON for this set.'
        Alert.alert('Export Failed', message)
      })
  }

  const handleSaveToDevice = (): void => {
    setMenuVisible(false)
    void exportSingleSetAsJson(set.id, { title: set.title, color: set.color })
      .then((json) => saveJsonToDevice(`${set.title}.json`, json))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Could not save set to device.'
        Alert.alert('Save Failed', message)
      })
  }

  const handleDelete = (): void => {
    setMenuVisible(false)
    Alert.alert(
      'Delete Set?',
      `Are you sure you want to delete "${set.title}"? All cards in this set will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSet.mutate(set.id)
          },
        },
      ],
    )
  }

  const handleArchive = (): void => {
    setMenuVisible(false)
    archiveSet.mutate({ id: set.id, archive: true })
    Alert.alert(
      'Set Archived',
      `"${set.title}" has been moved to your Archived Sets in the Account tab.`,
    )
  }

  const handleRename = (): void => {
    if (!newTitle.trim()) return
    renameSet.mutate({ id: set.id, body: { title: newTitle.trim() } })
    setRenameVisible(false)
  }

  const offlineEntry = useOfflineSetsStore((state) => state.sets[set.id])
  const isAvailableOffline = Boolean(offlineEntry?.isDownloaded)
  const isDownloading = offlineEntry?.status === 'downloading'
  const isUnsynced =
    set.id.startsWith('temp-set-') ||
    offlineEntry?.syncStatus === 'pending_create' ||
    offlineEntry?.syncStatus === 'pending_update' ||
    offlineEntry?.syncStatus === 'pending_delete'

  const handleSaveOffline = (): void => {
    setMenuVisible(false)
    void downloadSet(set.id).catch(() => {
      Alert.alert('Download Failed', 'Could not save this set for offline use.')
    })
  }

  const handleRemoveOffline = (): void => {
    setMenuVisible(false)
    void removeOfflineSet(set.id)
  }

  return (
    <>
      <Pressable
        delayLongPress={500}
        onLongPress={() => {
          if (!onPick) setMenuVisible(true)
        }}
        accessibilityRole="button"
        accessibilityLabel={`${set.title}. ${countLabel(set)}. Long press for options.`}
        onPress={() => {
          if (onPick) {
            onPick(set)
            return
          }
          router.push(`/sets/${set.id}`)
        }}
        className={`min-h-16 gap-3 rounded-3xl border border-border bg-surface p-4 active:opacity-75 ${onPick ? 'opacity-90 border-dashed' : ''}`}
      >
        <View className="flex-row items-start gap-4">
          {/* Soft pastel subject icon container */}
          <View className={`h-14 w-14 items-center justify-center rounded-2xl ${iconBgClass}`}>
            <BookOpenIcon color={iconColor} size={24} />
          </View>

          <View className="min-w-0 flex-1 gap-1">
            <Text numberOfLines={1} className="text-lg font-bold text-foreground">
              {set.title}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-medium text-muted-foreground">{countLabel(set)}</Text>
              {isUnsynced ? (
                <View className="flex-row items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5">
                  <CloudOffIcon color="#d97706" size={12} />
                  <Text className="text-xs font-semibold text-amber-600">Unsynced</Text>
                </View>
              ) : isAvailableOffline ? (
                <View className="flex-row items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
                  <CloudIcon color={iconColor} size={12} />
                  <Text className="text-xs font-semibold text-primary">Offline</Text>
                </View>
              ) : null}
              {isDownloading && (
                <View className="flex-row items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5">
                  <ActivityIndicator size={12} color={warning} />
                  <Text className="text-xs font-semibold text-warning">Downloading...</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Progress track & Study Button Row */}
        {!onPick && (
          <View className="mt-1 flex-row items-center gap-4">
            <View className="flex-1 gap-1.5">
              <View className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                <View className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
              </View>
              <Text className="text-xs font-semibold text-primary">
                {progressPercent === 0 ? 'Not started' : `${Math.round(progressPercent)}% Mastered`}
              </Text>
            </View>

            {totalCards > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Study ${dueCards} due cards`}
                onPress={(e) => {
                  e.stopPropagation()
                  router.push(`/study?set=${set.id}`)
                }}
                className="flex-row items-center justify-center rounded-full bg-primary px-3 py-1.5 active:opacity-80"
              >
                <Text className="text-sm font-bold text-primary-foreground">
                  {dueCards > 0 ? `${dueCards} due` : 'Study'}
                </Text>
                <ChevronRightIcon color={onPrimary} size={16} />
              </Pressable>
            )}
          </View>
        )}
      </Pressable>

      {/* 0.5s Long-Press Custom Action Menu */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setMenuVisible(false)
        }}
      >
        <TouchableOpacity
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          className="flex-1 items-center justify-center p-5"
          activeOpacity={1}
          onPress={() => {
            setMenuVisible(false)
          }}
        >
          <View className="w-full max-w-xs overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-black/40">
            <View className="border-b border-border/50 p-4">
              <Text numberOfLines={1} className="text-base font-bold text-foreground">
                {set.title}
              </Text>
              <Text className="text-xs text-muted-foreground">{countLabel(set)}</Text>
            </View>

            {/* Offline Storage Option */}
            {isAvailableOffline ? (
              <TouchableOpacity
                onPress={handleRemoveOffline}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
              >
                <CloudOffIcon color={foreground} size={20} />
                <Text className="text-base font-semibold text-foreground">Remove Offline</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSaveOffline}
                disabled={isDownloading}
                className={`flex-row items-center gap-3 px-5 py-4 ${isDownloading ? 'opacity-50' : 'active:bg-surface-muted'}`}
              >
                <DownloadIcon color={foreground} size={20} />
                <Text className="text-base font-semibold text-foreground">
                  {isDownloading ? 'Downloading...' : 'Save Offline'}
                </Text>
              </TouchableOpacity>
            )}

            <View className="h-px bg-border/40" />

            {/* Option 1: Edit */}
            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false)
                setNewTitle(set.title)
                setRenameVisible(true)
              }}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <EditIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Edit</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 2: Move Set */}
            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false)
                setMoveVisible(true)
              }}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <FolderInputIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Move Set</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Save to Device */}
            <TouchableOpacity
              onPress={handleSaveToDevice}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <DownloadIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Save to Device</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 3: Share JSON */}
            <TouchableOpacity
              onPress={handleShare}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <ShareIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Share JSON</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 3: Archive */}
            <TouchableOpacity
              onPress={handleArchive}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <ArchiveIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Archive</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 4: Delete (Red) */}
            <TouchableOpacity
              onPress={handleDelete}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-warning/10"
            >
              <TrashIcon color={warning} size={20} />
              <Text className="text-base font-bold text-warning">Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Title Dialog */}
      <Modal
        visible={renameVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setRenameVisible(false)
        }}
      >
        <TouchableOpacity
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          className="flex-1 items-center justify-center p-5"
          activeOpacity={1}
          onPress={() => {
            setRenameVisible(false)
          }}
        >
          <View className="w-full max-w-sm gap-4 rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <Text className="text-lg font-bold text-foreground">Rename Set</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Set title"
              placeholderTextColor={muted}
              autoFocus
              maxLength={SET_TITLE_MAX_LENGTH}
              className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
            />
            <View className="flex-row justify-end gap-3 pt-2">
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setRenameVisible(false)
                }}
              />
              <Button
                label="Save"
                disabled={!newTitle.trim() || newTitle === set.title}
                onPress={handleRename}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Move Set Modal */}
      <MoveSetModal visible={moveVisible} set={set} onClose={() => setMoveVisible(false)} />
    </>
  )
}

export function SetList({
  parent,
  /** Copy for the empty state — the root library and an open set need different words. */
  emptyText,
  /**
   * Turns the list into a chooser: a row hands its set back instead of opening
   * it, and creating one selects it immediately.
   *
   * Exists for the scan flow, which can arrive with no destination — the tab-bar
   * scan button belongs to no set. Reusing this list rather than writing a picker
   * is what gives that step pagination, the create input and the error states for
   * free, and a user with no sets at all can make one without leaving the scan.
   */
  onPick,
}: {
  parent: string | null
  emptyText: string
  onPick?: (set: StudySet) => void
}): ReactElement {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sets = useSets({ parent })
  const allSetsQuery = useAllSets()
  const create = useCreateSet()

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )
  const isOffline = !isOnline

  const offlineStore = useOfflineSetsStore()

  const placeholder = useTokenColor('--muted-foreground')
  const trimmed = title.trim()

  const offlineSets = Object.values(offlineStore.sets)
    .filter(
      (entry) =>
        Boolean(
          entry.isDownloaded ||
          entry.syncStatus?.startsWith('pending_') ||
          entry.setId.startsWith('temp-set-'),
        ) &&
        entry.metadata &&
        (parent === null ? !entry.metadata.parentId : entry.metadata.parentId === parent),
    )
    .map((entry) => entry.metadata!)

  const setsFromQuery = flattenPages(sets.data)
  const itemsMap = new Map<string, StudySet>()
  if (!isOffline) {
    for (const s of setsFromQuery) {
      const canonicalId = resolveEntityId(s.id)
      if (!itemsMap.has(canonicalId)) {
        itemsMap.set(canonicalId, s.id === canonicalId ? s : { ...s, id: canonicalId })
      }
    }
  }
  for (const os of offlineSets) {
    const canonicalId = resolveEntityId(os.id)
    if (!itemsMap.has(canonicalId) && !itemsMap.has(os.id)) {
      itemsMap.set(canonicalId, os)
    }
  }

  // Fallback: If at the root (parent === null) and itemsMap is empty,
  // check allSetsQuery and all available offlineStore sets so sets are never lost
  if (parent === null && itemsMap.size === 0) {
    if (allSetsQuery.data && allSetsQuery.data.length > 0) {
      for (const s of allSetsQuery.data) {
        const canonicalId = resolveEntityId(s.id)
        if (!itemsMap.has(canonicalId)) {
          itemsMap.set(canonicalId, s.id === canonicalId ? s : { ...s, id: canonicalId })
        }
      }
    }
    for (const entry of Object.values(offlineStore.sets)) {
      if (entry.metadata) {
        const canonicalId = resolveEntityId(entry.metadata.id)
        if (!itemsMap.has(canonicalId) && !itemsMap.has(entry.metadata.id)) {
          itemsMap.set(canonicalId, entry.metadata)
        }
      }
    }
  }

  // When offline, strictly exclude any non-downloaded / non-pending sets
  const items = isOffline
    ? Array.from(itemsMap.values()).filter((s) => {
        if (s.id.startsWith('temp-set-')) return true
        const entry = offlineStore.sets[s.id]
        return Boolean(entry?.isDownloaded || entry?.syncStatus?.startsWith('pending_'))
      })
    : Array.from(itemsMap.values())

  const submit = (): void => {
    if (trimmed.length === 0 || create.isPending) return
    const textToCreate = trimmed
    setError(null)
    setTitle('')

    create.mutate(
      { title: textToCreate, parentId: parent },
      {
        onSuccess: (data) => {
          if (onPick) onPick(data.set)
        },
        onError: (cause: Error) => {
          setTitle(textToCreate)
          setError(cause.message)
        },
      },
    )
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border bg-surface/50 p-3 pl-4">
        <TextInput
          value={title}
          onChangeText={setTitle}
          accessibilityLabel={parent === null ? 'New set title' : 'New sub-set title'}
          placeholder={parent === null ? '+ Add Subject Deck' : '+ Add Sub-set'}
          placeholderTextColor={placeholder}
          maxLength={SET_TITLE_MAX_LENGTH}
          returnKeyType="done"
          onSubmitEditing={submit}
          className="h-12 flex-1 text-base font-medium text-foreground"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create set"
          accessibilityState={{ disabled: trimmed.length === 0 || create.isPending }}
          disabled={trimmed.length === 0 || create.isPending}
          onPress={submit}
          className={`h-11 px-5 items-center justify-center rounded-full bg-primary ${
            trimmed.length === 0 || create.isPending ? 'opacity-50' : 'active:opacity-80'
          }`}
        >
          <Text className="text-sm font-bold text-primary-foreground">Create</Text>
        </Pressable>
      </View>

      {error !== null && (
        <Text accessibilityRole="alert" className="text-sm text-warning px-2">
          {error}
        </Text>
      )}

      {!isOffline && sets.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading sets" />
      ) : !isOffline && sets.isError ? (
        <View className="gap-3 rounded-xl border border-border bg-surface p-5">
          <Text className="text-sm text-warning">Could not load your sets.</Text>
          <Button
            label="Try again"
            variant="outline"
            className="self-start"
            onPress={() => {
              void sets.refetch()
            }}
          />
        </View>
      ) : items.length === 0 ? (
        <Text className="text-sm text-muted-foreground">{emptyText}</Text>
      ) : (
        // A plain map, not a `FlatList`: this is inside a ScrollView on both
        // screens, and a virtualised list nested in one scrolls against its
        // parent. Pagination caps it at a screenful at a time anyway.
        <View className="gap-2">
          {items.map((set) => (
            <SetRow key={set.id} set={set} onPick={onPick} />
          ))}
        </View>
      )}

      {sets.hasNextPage === true && (
        <Button
          label={sets.isFetchingNextPage ? 'Loading…' : 'Load more'}
          variant="outline"
          disabled={sets.isFetchingNextPage}
          className="self-start"
          onPress={() => {
            void sets.fetchNextPage()
          }}
        />
      )}
    </View>
  )
}

import { useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  RefreshControl,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { cardLabel, SET_TITLE_MAX_LENGTH, type StudyCardSummary } from '@saulado/shared'
import { Button } from '../../../components/button'
import { CardComposer } from '../../../components/card-composer'
import {
  ArchiveIcon,
  ChevronLeftIcon,
  EditIcon,
  MoreVerticalIcon,
  ShareIcon,
  TrashIcon,
} from '../../../components/icons'
import { SetList } from '../../../components/set-list'
import {
  flattenPages,
  useArchiveSet,
  useCards,
  useDeleteCard,
  useDeleteSet,
  useRenameSet,
  useSet,
} from '../../../hooks/cards'
import { useDueCounts } from '../../../hooks/study'
import { exportSingleSetAsJson, shareJsonPayload } from '../../../services/json-transfer'
import { useTokenColor } from '../../../stores/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * One set: what is in it, what is under it, and the composer for adding to it.
 *
 * The composer sits **above** the card list and is always mounted. Writing a card
 * used to be a route of its own, which meant the set you were writing against
 * disappeared the moment you started; here the list you are adding to stays on
 * screen and stays the thing you are looking at.
 */

/** One card in the list, with its delete button. */
function CardRow({
  card,
  onEdit,
  onDelete,
}: {
  card: StudyCardSummary
  onEdit: () => void
  onDelete: () => void
}): ReactElement {
  const warning = useTokenColor('--warning')
  const blanks = `${String(card.answerCount)} ${card.answerCount === 1 ? 'blank' : 'blanks'}`

  return (
    <View className="flex-row items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm shadow-black/5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit: ${card.paragraph}`}
        onPress={onEdit}
        className="flex-1 gap-1"
      >
        <Text numberOfLines={2} className="text-base font-semibold text-foreground">
          {cardLabel(card.paragraph)}
        </Text>
        <Text className="text-xs font-bold uppercase tracking-wider text-primary">{blanks}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete card: ${cardLabel(card.paragraph)}`}
        hitSlop={8}
        onPress={onDelete}
        className="rounded-full p-2 active:bg-warning/10"
      >
        <TrashIcon color={warning} size={18} />
      </Pressable>
    </View>
  )
}

export default function SetDetailScreen(): ReactElement {
  const { setId } = useLocalSearchParams<{ setId?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [editing, setEditing] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const [renameVisible, setRenameVisible] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const warning = useTokenColor('--warning')
  const foreground = useTokenColor('--foreground')
  const muted = useTokenColor('--muted-foreground')

  const set = useSet(setId)
  const dueCounts = useDueCounts()
  const countEntry = dueCounts.data?.counts.find((c) => c.studySetId === setId)
  const masteredCount = countEntry?.mastered ?? 0
  const parent = useSet(set.data?.set.parentId ?? undefined)
  const cards = useCards(setId)
  const remove = useDeleteCard(setId ?? '')
  const deleteSet = useDeleteSet()
  const archiveSet = useArchiveSet()
  const renameSet = useRenameSet()

  const items = flattenPages(cards.data)
  const title = set.data?.set.title

  const confirmDelete = (card: StudyCardSummary): void => {
    const blanks = `${String(card.answerCount)} ${card.answerCount === 1 ? 'blank' : 'blanks'}`

    Alert.alert(
      'Delete this card?',
      `“${cardLabel(card.paragraph)}” and its ${blanks} will be removed. This cannot be undone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (editing === card.id) setEditing(null)
            remove.mutate(card.id)
          },
        },
      ],
    )
  }

  const handleDeleteSet = (): void => {
    if (!setId) return
    setMenuVisible(false)
    Alert.alert(
      'Delete Set?',
      `Are you sure you want to delete "${title ?? 'this set'}"? All cards will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSet.mutate(setId, {
              onSuccess: () => {
                router.replace('/sets')
              },
            })
          },
        },
      ],
    )
  }

  const handleArchiveSet = (): void => {
    if (!setId) return
    setMenuVisible(false)
    archiveSet.mutate(
      { id: setId, archive: true },
      {
        onSuccess: () => {
          Alert.alert(
            'Set Archived',
            `"${title ?? 'Set'}" has been moved to your Archived Sets in the Account tab.`,
          )
          router.replace('/sets')
        },
      },
    )
  }

  const handleShareSet = (): void => {
    if (!setId) return
    setMenuVisible(false)
    void exportSingleSetAsJson(setId)
      .then((json) => shareJsonPayload(`${title ?? 'set'}.json`, json))
      .catch(() => {
        Alert.alert('Export Failed', 'Could not build JSON for this set.')
      })
  }

  const handleRenameSet = (): void => {
    if (!setId || !newTitle.trim()) return
    renameSet.mutate({ id: setId, body: { title: newTitle.trim() } })
    setRenameVisible(false)
  }

  const [composerSession, setComposerSession] = useState(0)

  const handlePullToCreate = (): void => {
    setEditing(null)
    setComposerSession((s) => s + 1)
    setComposerOpen(true)
  }

  const handleOpenCreate = (): void => {
    setEditing(null)
    setComposerSession((s) => s + 1)
    setComposerOpen(true)
  }

  const handleEditCard = (cardId: string): void => {
    setEditing(cardId)
    setComposerSession((s) => s + 1)
    setComposerOpen(true)
  }

  const handleCloseComposer = (): void => {
    setComposerOpen(false)
    setEditing(null)
  }

  if (setId === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-5">
        <Text className="text-sm text-muted-foreground">No set was given.</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 p-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 96, 128) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handlePullToCreate}
            title="Pull down to create card"
            tintColor={warning}
            titleColor={warning}
          />
        }
      >
        <View className="gap-3">
          {parent.data !== undefined && (
            <Pressable
              onPress={() => router.push(`/sets/${parent.data.set.id}`)}
              className="flex-row items-center gap-1 self-start rounded-full bg-surface-muted px-3 py-1.5 active:opacity-70"
            >
              <ChevronLeftIcon color={muted} size={16} />
              <Text className="text-sm font-bold text-muted-foreground">
                {parent.data.set.title}
              </Text>
            </Pressable>
          )}

          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-3xl font-extrabold tracking-tight text-foreground">
              {title ?? (set.isError ? 'Set unavailable' : '…')}
            </Text>
            {set.data && (
              <TouchableOpacity
                onPress={() => {
                  setNewTitle(title ?? '')
                  setMenuVisible(true)
                }}
                className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
              >
                <MoreVerticalIcon color={foreground} size={20} />
              </TouchableOpacity>
            )}
          </View>

          {set.data && (
            <View className="mt-2 flex-row rounded-2xl border border-border bg-surface shadow-sm shadow-black/5 overflow-hidden">
              <View className="flex-1 items-center border-r border-border p-4">
                <Text className="text-2xl font-black text-foreground">
                  {set.data.set.cardCount}
                </Text>
                <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Cards
                </Text>
              </View>
              <View className="flex-1 items-center p-4">
                <Text className="text-2xl font-black text-primary">{masteredCount}</Text>
                <Text className="text-xs font-bold uppercase tracking-wider text-primary">
                  Mastered
                </Text>
              </View>
            </View>
          )}

          {set.isError && (
            <Text className="text-sm font-medium text-warning">
              Could not load this set. Its cards may still be listed below.
            </Text>
          )}
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label={items.length === 0 ? 'No cards to study' : 'Study this set'}
              size="lg"
              disabled={items.length === 0}
              onPress={() => {
                router.push(`/study?set=${setId}`)
              }}
            />
          </View>
          <Button label="+ Card" variant="outline" size="lg" onPress={handleOpenCreate} />
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground">
              Cards
              {items.length > 0 && (
                <Text className="font-normal text-muted-foreground">{`  ${String(items.length)}`}</Text>
              )}
            </Text>
            {items.length > 0 && (
              <TouchableOpacity onPress={() => router.push(`/scan?setId=${setId}`)}>
                <Text className="text-sm font-medium text-primary">Scan Note</Text>
              </TouchableOpacity>
            )}
          </View>

          {cards.isPending ? (
            <ActivityIndicator accessibilityLabel="Loading cards" />
          ) : cards.isError ? (
            <View className="gap-3 rounded-xl border border-border bg-surface p-5">
              <Text className="text-sm text-warning">Could not load the cards in this set.</Text>
              <Button
                label="Try again"
                variant="outline"
                className="self-start"
                onPress={() => {
                  void cards.refetch()
                }}
              />
            </View>
          ) : items.length === 0 ? (
            <View className="gap-3">
              <Text className="text-sm text-muted-foreground">
                No cards yet. Pull down the screen or tap "+ Card" to create your first flashcard!
              </Text>
              <Button
                label="Read a page with the camera"
                variant="outline"
                className="mt-2"
                onPress={() => {
                  router.push(`/scan?setId=${setId}`)
                }}
              />
            </View>
          ) : (
            <View className="gap-2">
              {items.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  onEdit={() => {
                    handleEditCard(card.id)
                  }}
                  onDelete={() => {
                    confirmDelete(card)
                  }}
                />
              ))}
            </View>
          )}

          {cards.hasNextPage === true && (
            <Button
              label={cards.isFetchingNextPage ? 'Loading…' : 'Load more'}
              variant="outline"
              disabled={cards.isFetchingNextPage}
              className="self-start"
              onPress={() => {
                void cards.fetchNextPage()
              }}
            />
          )}
        </View>

        <View className="gap-3">
          <Text className="text-base font-semibold text-foreground">Sub-sets</Text>
          <SetList
            parent={setId}
            emptyText="No sub-sets. Split a big subject into topics if the card list gets long."
          />
        </View>
      </ScrollView>

      <Modal
        visible={composerOpen || editing !== null}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={handleCloseComposer}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 bg-background pt-4"
        >
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-4">
            <Text className="text-lg font-bold text-foreground">
              {editing ? 'Edit Card' : 'Create Card'}
            </Text>
            <TouchableOpacity onPress={handleCloseComposer}>
              <Text className="font-medium text-primary">Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerClassName="p-4 pb-20" keyboardShouldPersistTaps="always">
            <CardComposer
              key={`${editing ?? 'new'}-${String(composerSession)}`}
              setId={setId}
              cardId={editing ?? undefined}
              onClose={handleCloseComposer}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* 3-Dots Action Menu Modal */}
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
                {title}
              </Text>
              <Text className="text-xs text-muted-foreground">Set Actions</Text>
            </View>

            {/* Option 1: Edit */}
            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false)
                setRenameVisible(true)
              }}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <EditIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Edit Set</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 2: Share JSON */}
            <TouchableOpacity
              onPress={handleShareSet}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <ShareIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Share JSON</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 3: Archive */}
            <TouchableOpacity
              onPress={handleArchiveSet}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-surface-muted"
            >
              <ArchiveIcon color={foreground} size={20} />
              <Text className="text-base font-semibold text-foreground">Archive Set</Text>
            </TouchableOpacity>

            <View className="h-px bg-border/40" />

            {/* Option 4: Delete (Red) */}
            <TouchableOpacity
              onPress={handleDeleteSet}
              className="flex-row items-center gap-3 px-5 py-4 active:bg-warning/10"
            >
              <TrashIcon color={warning} size={20} />
              <Text className="text-base font-bold text-warning">Delete Set</Text>
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
                disabled={!newTitle.trim() || newTitle === title}
                onPress={handleRenameSet}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

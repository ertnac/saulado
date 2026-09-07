import { useEffect, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  SET_TITLE_MAX_LENGTH,
  cardLabel,
  type StudyCardSummary,
  type StudySet,
} from '@saulado/shared'
import { useAllSets, useCreateSet, useMoveCard } from '../hooks/cards'
import { useTokenColor } from '../stores/theme'
import {
  BookOpenIcon,
  ChevronRightIcon,
  FolderInputIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from './icons'

export interface MoveCardModalProps {
  visible: boolean
  card: StudyCardSummary | null
  currentSetId: string
  onClose: () => void
}

export function MoveCardModal({
  visible,
  card,
  currentSetId,
  onClose,
}: MoveCardModalProps): ReactElement {
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const allSetsQuery = useAllSets()
  const moveCard = useMoveCard()
  const createSet = useCreateSet()

  const muted = useTokenColor('--muted-foreground')
  const primary = useTokenColor('--primary')

  const sets = allSetsQuery.data ?? []
  const effectiveSourceSetId = card?.studySetId || currentSetId

  useEffect(() => {
    if (visible) {
      setQuery('')
      setIsCreating(false)
      setNewTitle('')
      void allSetsQuery.refetch()
    }
  }, [visible])

  const filteredSets = sets.filter((s) =>
    s.title.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const handleSelectSet = (targetSet: StudySet): void => {
    if (!card) return
    if (targetSet.id === effectiveSourceSetId) return

    moveCard.mutate(
      {
        cardId: card.id,
        sourceSetId: effectiveSourceSetId,
        targetSetId: targetSet.id,
      },
      {
        onSuccess: () => {
          onClose()
        },
        onError: (err) => {
          Alert.alert('Move Failed', err.message || 'Could not move card to that set.')
        },
      },
    )
  }

  const handleCreateAndMove = async (titleToCreate?: string): Promise<void> => {
    const title = (titleToCreate || newTitle).trim()
    if (!card || !title) return

    try {
      const res = await createSet.mutateAsync({ title })
      if (res?.set?.id) {
        await moveCard.mutateAsync({
          cardId: card.id,
          sourceSetId: effectiveSourceSetId,
          targetSetId: res.set.id,
        })
        onClose()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create new set.'
      Alert.alert('Failed to Create Set', msg)
    }
  }

  const isPending = moveCard.isPending || createSet.isPending

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        className="flex-1 items-center justify-center p-5"
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          className="w-full max-w-sm max-h-[85%] overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl"
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border/60 p-4">
            <View className="flex-row items-center gap-2">
              <FolderInputIcon color={primary} size={20} />
              <Text className="text-lg font-bold text-foreground">Move Flashcard</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <XIcon color={muted} size={20} />
            </TouchableOpacity>
          </View>

          {/* Card preview snippet */}
          {card && (
            <View className="border-b border-border/40 bg-surface-muted/50 px-4 py-2.5">
              <Text numberOfLines={2} className="text-xs text-muted-foreground">
                Card:{' '}
                <Text className="font-semibold text-foreground">{cardLabel(card.paragraph)}</Text>
              </Text>
            </View>
          )}

          {/* Inline Create Form */}
          {isCreating ? (
            <View className="border-b border-border bg-surface-muted/30 p-4 gap-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Create New Set & Move Here
              </Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="New study set title..."
                placeholderTextColor={muted}
                maxLength={SET_TITLE_MAX_LENGTH}
                autoFocus
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground"
              />
              <View className="flex-row justify-end gap-2">
                <TouchableOpacity
                  disabled={isPending}
                  onPress={() => setIsCreating(false)}
                  className="rounded-xl px-3 py-2"
                >
                  <Text className="text-xs font-semibold text-muted-foreground">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isPending || !newTitle.trim()}
                  onPress={() => void handleCreateAndMove()}
                  className={`flex-row items-center gap-1.5 rounded-xl bg-primary px-4 py-2 ${
                    isPending || !newTitle.trim() ? 'opacity-50' : ''
                  }`}
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <FolderPlusIcon color="#ffffff" size={14} />
                  )}
                  <Text className="text-xs font-bold text-primary-foreground">Create & Move</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Search bar */
            <View className="p-4 pb-2">
              <View className="flex-row items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <SearchIcon color={muted} size={16} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search destination set..."
                  placeholderTextColor={muted}
                  className="flex-1 text-sm text-foreground"
                  autoCapitalize="none"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <XIcon color={muted} size={14} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Sets list */}
          <ScrollView className="max-h-80 px-4 py-2" keyboardShouldPersistTaps="handled">
            {allSetsQuery.isLoading ? (
              <View className="py-8 items-center justify-center">
                <ActivityIndicator size="small" color={primary} />
                <Text className="mt-2 text-xs text-muted-foreground">Loading study sets...</Text>
              </View>
            ) : filteredSets.length === 0 ? (
              <View className="py-6 items-center justify-center px-4 gap-3">
                <FolderPlusIcon color={primary} size={36} />
                <Text className="text-center font-bold text-foreground">
                  {sets.length === 0
                    ? 'No other study sets found'
                    : `No study sets matching "${query}"`}
                </Text>
                <Text className="text-center text-xs text-muted-foreground">
                  {sets.length === 0
                    ? 'Create a new study set to move this card into.'
                    : 'Create a new study set with this name or clear your search.'}
                </Text>

                <View className="flex-row gap-2 mt-1">
                  {query.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setQuery('')}
                      className="rounded-xl border border-border bg-surface px-3 py-2"
                    >
                      <Text className="text-xs font-semibold text-foreground">Clear Search</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    disabled={isPending}
                    onPress={() => {
                      if (query.trim()) {
                        void handleCreateAndMove(query.trim())
                      } else {
                        setIsCreating(true)
                      }
                    }}
                    className="flex-row items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2"
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <PlusIcon color="#ffffff" size={14} />
                    )}
                    <Text className="text-xs font-bold text-primary-foreground">
                      {query.trim() ? `+ Create "${query.trim()}"` : '+ Create New Set'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="gap-2 pb-4">
                {/* Sets */}
                {filteredSets.map((s) => {
                  const isCurrent = s.id === effectiveSourceSetId
                  const isPendingThis =
                    moveCard.isPending && moveCard.variables?.targetSetId === s.id

                  return (
                    <Pressable
                      key={s.id}
                      disabled={isCurrent || isPending}
                      onPress={() => handleSelectSet(s)}
                      className={`flex-row items-center justify-between rounded-2xl border p-3 ${
                        isCurrent
                          ? 'border-border/40 bg-surface-muted/60 opacity-60'
                          : 'border-border bg-surface active:bg-surface-muted'
                      }`}
                    >
                      <View className="flex-1 flex-row items-center gap-3">
                        <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                          <BookOpenIcon color={primary} size={18} />
                        </View>
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            className={`text-sm font-semibold ${
                              isCurrent ? 'text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {s.title}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {s.cardCount} {s.cardCount === 1 ? 'card' : 'cards'}
                            {s.parentId ? ' · sub-set' : ''}
                          </Text>
                        </View>
                      </View>

                      {isPendingThis ? (
                        <ActivityIndicator size="small" color={primary} />
                      ) : isCurrent ? (
                        <View className="rounded-full bg-border/40 px-2 py-0.5">
                          <Text className="text-[10px] font-bold text-muted-foreground">
                            Current Set
                          </Text>
                        </View>
                      ) : (
                        <ChevronRightIcon color={muted} size={16} />
                      )}
                    </Pressable>
                  )
                })}

                {/* Quick Add Set button at bottom of list */}
                {!isCreating && (
                  <TouchableOpacity
                    onPress={() => {
                      setNewTitle(query.trim())
                      setIsCreating(true)
                    }}
                    className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 active:bg-surface-muted"
                  >
                    <FolderPlusIcon color={primary} size={16} />
                    <Text className="text-xs font-bold text-primary">+ Create New Set & Move</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

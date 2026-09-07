import { useEffect, useMemo, useState, type ReactElement } from 'react'
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
import { SET_DEPTH_MAX, SET_TITLE_MAX_LENGTH, type StudySet } from '@saulado/shared'
import { useAllSets, useCreateSet, useMoveSet } from '../hooks/cards'
import { useTokenColor } from '../stores/theme'
import {
  BookOpenIcon,
  ChevronRightIcon,
  FolderInputIcon,
  FolderPlusIcon,
  HomeIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from './icons'

export interface MoveSetModalProps {
  visible: boolean
  set: StudySet | null
  onClose: () => void
}

export function MoveSetModal({ visible, set, onClose }: MoveSetModalProps): ReactElement {
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const allSetsQuery = useAllSets()
  const moveSet = useMoveSet()
  const createSet = useCreateSet()

  const muted = useTokenColor('--muted-foreground')
  const primary = useTokenColor('--primary')

  const sets = allSetsQuery.data ?? []

  useEffect(() => {
    if (visible) {
      setQuery('')
      setIsCreating(false)
      setNewTitle('')
      void allSetsQuery.refetch()
    }
  }, [visible])

  // Tree calculations matching backend assertPlacement
  const { descendantIds, movingSetHeight, parentMap } = useMemo(() => {
    const childrenMap = new Map<string | null, string[]>()
    const pMap = new Map<string, string | null>()

    for (const s of sets) {
      pMap.set(s.id, s.parentId ?? null)
      const p = s.parentId ?? null
      const list = childrenMap.get(p) ?? []
      list.push(s.id)
      childrenMap.set(p, list)
    }

    if (!set) {
      return {
        descendantIds: new Set<string>(),
        movingSetHeight: 1,
        parentMap: pMap,
      }
    }

    // Descendants of the moving set (cannot move into self or own subtree)
    const desc = new Set<string>()
    const queue = [set.id]
    while (queue.length > 0) {
      const curr = queue.shift()!
      const kids = childrenMap.get(curr) ?? []
      for (const kid of kids) {
        if (!desc.has(kid)) {
          desc.add(kid)
          queue.push(kid)
        }
      }
    }

    // Height of moving set (tallest branch below it, leaf = 1)
    let height = 0
    let frontier = [set.id]
    const visited = new Set<string>()
    while (frontier.length > 0) {
      height++
      const next: string[] = []
      for (const id of frontier) {
        if (visited.has(id)) continue
        visited.add(id)
        const kids = childrenMap.get(id) ?? []
        next.push(...kids)
      }
      frontier = next
    }

    return {
      descendantIds: desc,
      movingSetHeight: Math.max(1, height),
      parentMap: pMap,
    }
  }, [sets, set])

  const getTargetDepth = (targetId: string | null): number => {
    let depth = 0
    let curr = targetId
    const visited = new Set<string>()
    while (curr !== null && !visited.has(curr)) {
      visited.add(curr)
      depth++
      curr = parentMap.get(curr) ?? null
    }
    return depth
  }

  const handleMoveTo = (newParentId: string | null): void => {
    if (!set) return
    if (set.parentId === newParentId) return

    moveSet.mutate(
      { id: set.id, parentId: newParentId },
      {
        onSuccess: () => {
          onClose()
        },
        onError: (err) => {
          Alert.alert('Move Failed', err.message || 'Could not move set.')
        },
      },
    )
  }

  const handleCreateParentAndMove = async (titleToCreate?: string): Promise<void> => {
    const title = (titleToCreate || newTitle).trim()
    if (!set || !title) return

    try {
      // 1. Create the new parent set at root level
      const res = await createSet.mutateAsync({ title })
      if (res?.set?.id) {
        // 2. Move this set inside the newly created set
        await moveSet.mutateAsync({ id: set.id, parentId: res.set.id })
        onClose()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create parent set.'
      Alert.alert('Failed to Create Set', msg)
    }
  }

  const filteredSets = sets.filter(
    (s) => s.id !== set?.id && s.title.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const isAlreadyRoot = set ? set.parentId === null : true
  const isPending = moveSet.isPending || createSet.isPending
  const isMovingToRoot = moveSet.isPending && moveSet.variables?.parentId === null

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
              <Text className="text-lg font-bold text-foreground">Move Study Set</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <XIcon color={muted} size={20} />
            </TouchableOpacity>
          </View>

          {/* Set title preview */}
          {set && (
            <View className="border-b border-border/40 bg-surface-muted/50 px-4 py-2.5">
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                Moving Set: <Text className="font-bold text-foreground">{set.title}</Text>
              </Text>
            </View>
          )}

          {/* Inline Create Parent Set Form */}
          {isCreating && (
            <View className="border-b border-border bg-surface-muted/30 p-4 gap-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Create New Parent Set
              </Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Parent set title..."
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
                  onPress={() => void handleCreateParentAndMove()}
                  className={`flex-row items-center gap-1.5 rounded-xl bg-primary px-4 py-2 ${
                    isPending || !newTitle.trim() ? 'opacity-50' : ''
                  }`}
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <FolderPlusIcon color="#ffffff" size={14} />
                  )}
                  <Text className="text-xs font-bold text-primary-foreground">Create & Nest</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView className="max-h-[380px] p-4" keyboardShouldPersistTaps="handled">
            {/* Option 1: Move to Root Level */}
            <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Top Level Destination
            </Text>
            <Pressable
              disabled={isAlreadyRoot || isPending}
              onPress={() => handleMoveTo(null)}
              className={`mb-4 flex-row items-center justify-between rounded-2xl border p-3.5 ${
                isAlreadyRoot
                  ? 'border-border/40 bg-surface-muted/60 opacity-60'
                  : 'border-border bg-surface active:bg-surface-muted'
              }`}
            >
              <View className="flex-1 flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <HomeIcon color={primary} size={20} />
                </View>
                <View className="flex-1">
                  <Text
                    className={`text-base font-bold ${
                      isAlreadyRoot ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    Root Library
                  </Text>
                  <Text className="text-xs text-muted-foreground">Top-level set (no parent)</Text>
                </View>
              </View>

              {isMovingToRoot ? (
                <ActivityIndicator size="small" color={primary} />
              ) : isAlreadyRoot ? (
                <View className="rounded-full bg-border/50 px-2.5 py-0.5">
                  <Text className="text-[10px] font-bold text-muted-foreground">Current Level</Text>
                </View>
              ) : (
                <ChevronRightIcon color={muted} size={16} />
              )}
            </Pressable>

            {/* Section 2: Nest inside another set */}
            <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Or Move Inside Another Set
            </Text>

            {/* Search bar */}
            {!isCreating && (
              <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <SearchIcon color={muted} size={16} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search parent sets..."
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
            )}

            {/* Sets list */}
            {allSetsQuery.isLoading ? (
              <View className="py-6 items-center justify-center">
                <ActivityIndicator size="small" color={primary} />
                <Text className="mt-2 text-xs text-muted-foreground">Loading parent sets...</Text>
              </View>
            ) : filteredSets.length === 0 ? (
              <View className="py-6 items-center justify-center px-4 gap-3">
                <FolderPlusIcon color={primary} size={36} />
                <Text className="text-center font-bold text-foreground">
                  {sets.length <= 1
                    ? 'No other sets available to nest inside'
                    : `No study sets matching "${query}"`}
                </Text>
                <Text className="text-center text-xs text-muted-foreground">
                  {sets.length <= 1
                    ? 'Create a new parent set to move this set into.'
                    : 'Create a new parent set with this name or clear your search.'}
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
                        void handleCreateParentAndMove(query.trim())
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
                      {query.trim() ? `+ Create "${query.trim()}"` : '+ Create Parent Set'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="gap-2 pb-6">
                {filteredSets.map((target) => {
                  const isCurrentParent = set?.parentId === target.id
                  const isDescendant = descendantIds.has(target.id)
                  const targetDepth = getTargetDepth(target.id)
                  const wouldExceedDepth = targetDepth + movingSetHeight > SET_DEPTH_MAX

                  let disabledReason = ''
                  if (isCurrentParent) disabledReason = 'Current parent'
                  else if (isDescendant) disabledReason = 'Sub-set of this'
                  else if (wouldExceedDepth) disabledReason = 'Depth limit (max 3)'

                  const isDisabled = Boolean(disabledReason) || isPending
                  const isPendingThis =
                    moveSet.isPending && moveSet.variables?.parentId === target.id

                  return (
                    <Pressable
                      key={target.id}
                      disabled={isDisabled}
                      onPress={() => handleMoveTo(target.id)}
                      className={`flex-row items-center justify-between rounded-2xl border p-3 ${
                        isDisabled
                          ? 'border-border/40 bg-surface-muted/50 opacity-50'
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
                              isDisabled ? 'text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {target.title}
                          </Text>
                          <Text className="text-xs text-muted-foreground">
                            {target.cardCount} {target.cardCount === 1 ? 'card' : 'cards'}
                            {target.parentId ? ' · sub-set' : ''}
                          </Text>
                        </View>
                      </View>

                      {isPendingThis ? (
                        <ActivityIndicator size="small" color={primary} />
                      ) : disabledReason ? (
                        <View className="rounded-full bg-border/40 px-2 py-0.5">
                          <Text className="text-[10px] font-semibold text-muted-foreground">
                            {disabledReason}
                          </Text>
                        </View>
                      ) : (
                        <ChevronRightIcon color={muted} size={16} />
                      )}
                    </Pressable>
                  )
                })}

                {/* Quick Add Parent Set button at bottom of list */}
                {!isCreating && (
                  <TouchableOpacity
                    onPress={() => {
                      setNewTitle(query.trim())
                      setIsCreating(true)
                    }}
                    className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 active:bg-surface-muted"
                  >
                    <FolderPlusIcon color={primary} size={16} />
                    <Text className="text-xs font-bold text-primary">+ Create New Parent Set</Text>
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

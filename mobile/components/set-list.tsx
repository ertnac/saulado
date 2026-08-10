import { useState, type ReactElement } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SET_TITLE_MAX_LENGTH, type StudySet } from '@saulado/shared'
import { flattenPages, useCreateSet, useSets } from '../hooks/cards'
import { useTokenColor } from '../stores/theme'
import { Button } from './button'
import { ChevronRightIcon, PlusIcon } from './icons'

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
  const muted = useTokenColor('--muted-foreground')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${set.title}. ${countLabel(set)}`}
      onPress={() => {
        if (onPick) {
          onPick(set)
          return
        }
        router.push(`/sets/${set.id}`)
      }}
      className="min-h-14 flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-foreground">{set.title}</Text>
        <Text className="text-sm text-muted-foreground">{countLabel(set)}</Text>
      </View>
      <ChevronRightIcon color={muted} size={18} />
    </Pressable>
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
  const create = useCreateSet()

  const placeholder = useTokenColor('--muted-foreground')
  const onPrimary = useTokenColor('--primary-foreground')
  const items = flattenPages(sets.data)
  const trimmed = title.trim()

  const submit = (): void => {
    if (trimmed.length === 0 || create.isPending) return
    setError(null)

    create.mutate(
      { title: trimmed, parentId: parent },
      {
        onSuccess: (data) => {
          setTitle('')
          // In pick mode the new set *is* the choice — typing a title and then
          // hunting for the row that just appeared is a step with no decision in
          // it.
          if (onPick) onPick(data.set)
        },
        // The depth cap and the duplicate-title rule are both server-side, so the
        // message has to come from there rather than be guessed at here.
        onError: (cause: Error) => {
          setError(cause.message)
        },
      },
    )
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={title}
          onChangeText={setTitle}
          accessibilityLabel={parent === null ? 'New set title' : 'New sub-set title'}
          placeholder={parent === null ? 'New set' : 'New sub-set'}
          placeholderTextColor={placeholder}
          maxLength={SET_TITLE_MAX_LENGTH}
          returnKeyType="done"
          onSubmitEditing={submit}
          className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-base text-foreground"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create set"
          accessibilityState={{ disabled: trimmed.length === 0 || create.isPending }}
          disabled={trimmed.length === 0 || create.isPending}
          onPress={submit}
          className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${
            trimmed.length === 0 || create.isPending ? 'opacity-50' : ''
          }`}
        >
          <PlusIcon color={onPrimary} size={20} />
        </Pressable>
      </View>

      {error !== null && (
        <Text accessibilityRole="alert" className="text-sm text-warning">
          {error}
        </Text>
      )}

      {sets.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading sets" />
      ) : sets.isError ? (
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

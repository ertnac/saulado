import { useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { cardLabel, type StudyCardSummary } from '@saulado/shared'
import { Button } from '../../../components/button'
import { CardComposer } from '../../../components/card-composer'
import { TrashIcon } from '../../../components/icons'
import { SetList } from '../../../components/set-list'
import { flattenPages, useCards, useDeleteCard, useSet } from '../../../hooks/cards'
import { useTokenColor } from '../../../stores/theme'

/**
 * One set: what is in it, what is under it, and the composer for adding to it.
 *
 * The composer sits **above** the card list and is always mounted. Writing a card
 * used to be a route of its own, which meant the set you were writing against
 * disappeared the moment you started; here the list you are adding to stays on
 * screen and stays the thing you are looking at.
 *
 * Cards have no title. Rows print `cardLabel(paragraph)` — the first line of the
 * paragraph, truncated on a word boundary — because a title was a second thing to
 * write that said less than the text itself.
 *
 * Only one ancestor in the breadcrumb, where the web shows two. A phone header is
 * one line wide and `SET_DEPTH_MAX` is 3, so the parent is the useful half of the
 * trail and the grandparent is what gets truncated away anyway.
 */

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
    <View className="min-h-14 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${cardLabel(card.paragraph)}. ${blanks}. Tap to edit.`}
        onPress={onEdit}
        className="flex-1 gap-0.5 active:opacity-70"
      >
        <Text numberOfLines={2} className="text-base text-foreground">
          {cardLabel(card.paragraph)}
        </Text>
        <Text className="text-sm text-muted-foreground">{blanks}</Text>
      </Pressable>

      {/* 44×44 despite the 18pt glyph — saulado-ux §7, and this one deletes. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete card: ${cardLabel(card.paragraph)}`}
        onPress={onDelete}
        className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
      >
        <TrashIcon color={warning} size={18} />
      </Pressable>
    </View>
  )
}

export default function SetDetailScreen(): ReactElement {
  const { setId } = useLocalSearchParams<{ setId?: string }>()
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)

  const set = useSet(setId)
  // `undefined` rather than `null` when there is no parent: `useSet` treats
  // `undefined` as "do not fetch", and a root set has no ancestor to ask for.
  const parent = useSet(set.data?.set.parentId ?? undefined)
  const cards = useCards(setId)
  // The screen renders nothing but a message without a `setId`, but hooks run
  // before that branch, so the mutation takes a placeholder it can never fire on.
  const remove = useDeleteCard(setId ?? '')

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
            // Editing the card that just went is the one way to end up with a
            // composer pointed at nothing.
            if (editing === card.id) setEditing(null)
            remove.mutate(card.id)
          },
        },
      ],
    )
  }

  if (setId === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-5">
        <Text className="text-sm text-muted-foreground">No set was given.</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-8"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="gap-1">
          {parent.data !== undefined && (
            <Text className="text-sm text-muted-foreground">in {parent.data.set.title}</Text>
          )}
          <Text className="text-2xl font-semibold text-foreground">
            {title ?? (set.isError ? 'Set unavailable' : '…')}
          </Text>
          {set.isError && (
            <Text className="text-sm text-warning">
              Could not load this set. Its cards may still be listed below.
            </Text>
          )}
        </View>

        <Button
          label="Study this set"
          size="lg"
          onPress={() => {
            router.push(`/study?set=${setId}`)
          }}
        />

        <View className="gap-3">
          <Text className="text-base font-semibold text-foreground">
            {editing === null ? 'Write a card' : 'Edit card'}
          </Text>
          {/*
            Keyed by what it is editing so switching cards remounts the draft.
            Without it, card B opens holding card A's paragraph and blanks.
          */}
          <CardComposer
            key={editing ?? 'new'}
            setId={setId}
            cardId={editing ?? undefined}
            onClose={() => {
              setEditing(null)
            }}
          />
        </View>

        <View className="gap-3">
          <Text className="text-base font-semibold text-foreground">
            Cards
            {items.length > 0 && (
              <Text className="font-normal text-muted-foreground">{`  ${String(items.length)}`}</Text>
            )}
          </Text>

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
            <Text className="text-sm text-muted-foreground">
              No cards yet. Paste a paragraph above, switch to Highlight, and tap the words worth
              recalling.
            </Text>
          ) : (
            <View className="gap-2">
              {items.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  onEdit={() => {
                    setEditing(card.id)
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
    </KeyboardAvoidingView>
  )
}

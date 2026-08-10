import { useState, type ReactElement } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { AnswerInput, DraftAnswer, StudyCard } from '@saulado/shared'
import { useCard, useCreateCard, useUpdateCard } from '../hooks/cards'
import { useCardDraft } from '../hooks/useCardDraft'
import { useFormErrors } from '../hooks/useFormErrors'
import {
  clearDraft,
  useCardDraftPersistence,
  useRestoredDraft,
  type CardDraftSnapshot,
} from '../lib/card-draft-store'
import { useTokenColor } from '../stores/theme'
import { useImportQueue, type ImportedCard } from '../stores/import-queue'
import { Button } from './button'
import { HighlightEditor } from './highlight-editor'
import { AlertIcon } from './icons'

/**
 * Writing a card without leaving the set — a port of
 * `frontend/src/features/cards/CardComposer.tsx`.
 *
 * It mounts inline above the card list rather than on a route of its own. Card
 * creation as a page transition meant the set you were reading disappeared, you
 * wrote one card, and you were bounced back; adding five cards was five round
 * trips, and the set's existing cards — the context you are writing *against* —
 * were never on screen while you wrote.
 *
 * Two consequences follow, both deliberate and both carried over:
 *
 * **Saving a new card keeps the composer open.** It empties and stays put.
 * Collapsing after one save rebuilds exactly the friction this removes.
 *
 * **Tags are preserved, not edited.** There is no tag input on mobile yet, so
 * whatever the card already carries rides through a save untouched. Sending an
 * empty array instead would silently strip tags the user set on the web, and
 * they would only find out in the tag filter.
 */

/** Offsets and alternatives only — the server derives every `answerText`. */
function toAnswerInputs(answers: readonly DraftAnswer[]): AnswerInput[] {
  return answers.map((answer) => ({
    startOffset: answer.startOffset,
    endOffset: answer.endOffset,
    ...(answer.altAnswers.length > 0 ? { altAnswers: answer.altAnswers } : {}),
  }))
}

interface ComposerProps {
  setId: string
  /** Absent means create. */
  card?: StudyCard
  scope: string
  /** A draft recovered from storage, already resolved. Null when there was none. */
  restored: CardDraftSnapshot | null
  /** The scanned card this composer is showing, if it came from an import. */
  imported?: ImportedCard & { index: number; total: number }
  /** Collapse the composer: Cancel, or a successful save when editing. */
  onClose: () => void
}

function Composer({
  setId,
  card,
  scope,
  restored,
  imported,
  onClose,
}: ComposerProps): ReactElement {
  const editing = card !== undefined
  const advance = useImportQueue((state) => state.advance)
  const clearQueue = useImportQueue((state) => state.clear)

  // Seeded through the initializer rather than a `reset` in an effect — a reset
  // landing after mount races the user's typing and discards it. Every value is
  // already resolved by the time this component exists, which is the whole point
  // of the gate in `CardComposer` below.
  //
  // An imported card wins over a restored draft: it is the thing the user is
  // looking at, and its answers are offsets into *its* paragraph, so pairing
  // them with any other one puts every blank over the wrong words.
  const seed = imported ?? restored ?? card
  const draft = useCardDraft({
    paragraph: seed?.paragraph,
    answers: seed?.answers,
    // A draft that arrives with blanks already placed opens on the surface that
    // shows them. Landing on the text input would render a paragraph with no
    // visible highlights, which reads as the work having been thrown away.
    mode: seed !== undefined && seed.answers.length > 0 ? 'highlight' : 'compose',
  })
  const [tags] = useState<string[]>(card?.tags ?? restored?.tags ?? [])
  const [added, setAdded] = useState(0)

  const { errors, setFromError, clear } = useFormErrors()
  const create = useCreateCard(setId)
  const update = useUpdateCard(card?.id ?? '')
  const warning = useTokenColor('--warning')

  const pending = create.isPending || update.isPending
  // The committed paragraph, not `draftText`: an uncommitted edit is not what
  // would be sent, and enabling Save on it would store the committed text while
  // the user is looking at something else.
  const ready = draft.paragraph.trim().length > 0

  /**
   * Disabled while a save is in flight, not only after it succeeds.
   *
   * The debounce writes 500ms after the last keystroke, so a timer queued just
   * before Save would otherwise fire once the composer has cleared and reset —
   * restoring the paragraph of a card that now exists. Flipping `enabled`
   * cancels the pending timer through the effect's own cleanup.
   *
   * Off entirely while importing. The scope key is `set:${setId}:new` for every
   * new card, so a queue of scanned cards would all write to one key and
   * overwrite each other — and the survivor would then be restored into the
   * user's own next card as if they had written it.
   */
  useCardDraftPersistence(
    scope,
    { paragraph: draft.paragraph, answers: draft.answers, tags },
    !editing && !pending && imported === undefined,
  )

  const submit = async (): Promise<void> => {
    clear()
    // `paragraph` and `answers` always travel together: the offsets index into
    // this paragraph and nothing else.
    const body = { paragraph: draft.paragraph, answers: toAnswerInputs(draft.answers), tags }

    try {
      if (editing) {
        await update.mutateAsync(body)
        clearDraft(scope)
        onClose()
        return
      }

      await create.mutateAsync(body)
      clearDraft(scope)

      if (imported !== undefined) {
        // The parent remounts this on the new index, so there is nothing to
        // reset — resetting here would clear the draft the next card seeds from.
        advance()
        return
      }

      // Emptied rather than collapsed.
      draft.reset({ paragraph: '' })
      setAdded((count) => count + 1)
    } catch (error) {
      setFromError(error)
    }
  }

  const fieldError = errors.fields.answers ?? errors.fields.paragraph

  return (
    <View
      accessibilityLabel={editing ? 'Edit card' : 'New card'}
      className="gap-5 rounded-xl border border-border bg-surface p-5"
    >
      {imported !== undefined && (
        <Text className="text-sm font-medium text-muted-foreground">
          {`From your scan — card ${String(imported.index + 1)} of ${String(imported.total)}`}
        </Text>
      )}

      {(errors.general !== null || fieldError !== undefined) && (
        <View accessibilityRole="alert" className="flex-row items-start gap-1.5">
          <AlertIcon color={warning} size={16} />
          <Text className="flex-1 text-sm text-warning">{errors.general ?? fieldError}</Text>
        </View>
      )}

      <HighlightEditor draft={draft} />

      <View className="gap-3">
        <Button
          label={pending ? 'Saving…' : editing ? 'Save card' : 'Add card'}
          size="lg"
          loading={pending}
          disabled={!ready}
          onPress={() => {
            void submit()
          }}
        />

        {imported === undefined ? (
          <Button
            label={editing ? 'Cancel' : 'Done'}
            variant="ghost"
            disabled={pending}
            onPress={onClose}
          />
        ) : (
          <>
            {/*
              Skip appears here as well as in the scan review, and that is not
              redundancy: there it drops a question before any blanks are placed,
              here it drops a card the user has looked at properly. Without it
              they back out of the whole scan to discard one.
            */}
            <Button label="Skip this one" variant="ghost" disabled={pending} onPress={advance} />
            <Button
              label="Stop importing"
              variant="ghost"
              disabled={pending}
              onPress={clearQueue}
            />
          </>
        )}

        {draft.answers.length === 0 && (
          <Text className="text-sm text-muted-foreground">
            A card with no blanks is still worth saving — you can highlight later.
          </Text>
        )}
      </View>

      {/*
        The only feedback that a save landed, since the composer does not move.
        Polite rather than assertive: it is a confirmation, not something to act
        on, and it fires while the user is typing the next card.
      */}
      {added > 0 && (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          {`${String(added)} ${added === 1 ? 'card' : 'cards'} added. Write another, or press Done.`}
        </Text>
      )}
    </View>
  )
}

/**
 * Resolves everything the draft has to be seeded with, then mounts the composer.
 *
 * Both sources are asynchronous — the stored draft is an `AsyncStorage` read, and
 * an edited card may not be in the query cache — and `useCardDraft` takes its
 * initial state once, at mount. So the editor cannot exist until both have
 * settled: mounting first and seeding later means a `reset()` landing on top of
 * whatever the user has already typed.
 *
 * `useRestoredDraft` returning `undefined` is "still reading", distinct from
 * `null`, "nothing stored". That third value is the whole reason this gate can be
 * written without a flash of an empty box over a draft that exists.
 *
 * An import queue skips the gate entirely: its card is already in memory, and
 * there is nothing to restore because the import does not persist.
 */
export function CardComposer({
  setId,
  cardId,
  onClose,
}: {
  setId: string
  /** Absent means create. */
  cardId?: string
  onClose: () => void
}): ReactElement {
  const editing = cardId !== undefined
  const scope = editing ? `card:${cardId}` : `set:${setId}:new`
  // Only the create flow persists, so only it has anything to restore.
  const restored = useRestoredDraft(scope, !editing)
  const card = useCard(cardId)
  const queue = useImportQueue()

  // Scoped to the set it was scanned into: backing out to a different set would
  // otherwise find the queue waiting there and file the cards under it.
  const queued = editing || queue.setId !== setId ? undefined : queue.cards[queue.index]
  const imported =
    queued === undefined ? undefined : { ...queued, index: queue.index, total: queue.cards.length }

  if (imported === undefined && (restored === undefined || (editing && card.isPending))) {
    return (
      <View className="items-center rounded-xl border border-border bg-surface p-8">
        <ActivityIndicator accessibilityLabel="Loading the editor" />
      </View>
    )
  }

  if (editing && card.data === undefined) {
    return (
      <View className="gap-3 rounded-xl border border-border bg-surface p-5">
        <Text className="text-sm text-warning">That card could not be loaded.</Text>
        <Button label="Close" variant="outline" onPress={onClose} className="self-start" />
      </View>
    )
  }

  return (
    <Composer
      // Remounts on a switch between cards — without it the second card would
      // inherit the first's draft state, blanks included. The queue index is part
      // of the key for the same reason: advancing has to rebuild the draft.
      key={imported === undefined ? (cardId ?? 'new') : `import:${String(imported.index)}`}
      setId={setId}
      card={card.data?.card}
      scope={scope}
      restored={restored ?? null}
      imported={imported}
      onClose={onClose}
    />
  )
}

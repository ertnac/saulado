import { useEffect, useState, type ReactElement } from 'react'
import type { AnswerInput, DraftAnswer, StudyCard } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertIcon } from '@/components/ui/icons'
import { useFormErrors } from '@/hooks/useFormErrors'
import { HighlightEditor } from './HighlightEditor'
import { TagInput } from './TagInput'
import { useCardDraft } from './useCardDraft'
import { clearDraft, readDraft, useCardDraftPersistence } from './useCardDraftPersistence'
import { useCard, useCreateCard, useTags, useUpdateCard } from './queries'

/**
 * Writing a card without leaving the set.
 *
 * This replaces the `/sets/:setId/cards/new` and `/cards/:cardId` routes. Card
 * creation used to be a page transition: the set you were reading disappeared,
 * you wrote one card, and you were bounced back. Adding five cards meant five
 * round trips, and the set's existing cards — the context you are writing
 * *against* — were never on screen while you wrote.
 *
 * So the editor mounts inline instead, above the list in create mode and in the
 * row itself when editing. Two consequences follow, and both are deliberate:
 *
 * **Saving a new card keeps the composer open.** It resets to an empty
 * paragraph and stays where it is. Collapsing after one save would rebuild
 * exactly the friction this removes.
 *
 * **Only one composer may be open at a time.** `HighlightEditor` labels its
 * textarea with a fixed `id`, and two mounted at once would be two elements
 * sharing it — a label pointing at whichever the browser found first. The set
 * page enforces this by holding a single "which composer is open" value rather
 * than a flag per row.
 */

/** Offsets and alternatives only — the server derives every `answerText`. */
function toAnswerInputs(answers: readonly DraftAnswer[]): AnswerInput[] {
  return answers.map((answer) => ({
    startOffset: answer.startOffset,
    endOffset: answer.endOffset,
    ...(answer.altAnswers.length > 0 ? { altAnswers: answer.altAnswers } : {}),
  }))
}

/**
 * The id `HighlightEditor` puts on its textarea.
 *
 * Read here rather than passed as a prop because the editor is deliberately
 * untouched by this change — it already takes the draft as props, which is what
 * made it mountable inline in the first place.
 */
const PARAGRAPH_FIELD_ID = 'card-paragraph'

interface ComposerProps {
  setId: string
  /** Absent means create. */
  card?: StudyCard
  /** Collapse the composer: Cancel, or a successful save when editing. */
  onClose: () => void
}

function Composer({ setId, card, onClose }: ComposerProps): ReactElement {
  const editing = card !== undefined
  // Scoped per card, and per set for new ones: two half-written cards in
  // different sets are two drafts, and one key would have them overwrite each
  // other. Restoring only applies to create — reopening a saved card should show
  // what is stored, not a week-old draft of it.
  const scope = editing ? `card:${card.id}` : `set:${setId}:new`
  const restored = useState(() => (editing ? null : readDraft(scope)))[0]

  const draft = useCardDraft({
    paragraph: restored?.paragraph ?? card?.paragraph,
    answers: restored?.answers ?? card?.answers,
  })
  const [tags, setTags] = useState<string[]>(restored?.tags ?? card?.tags ?? [])
  const [added, setAdded] = useState(0)

  const { errors, setFromError, clear } = useFormErrors()
  const allTags = useTags()
  const create = useCreateCard(setId)
  const update = useUpdateCard(card?.id ?? '')

  const pending = create.isPending || update.isPending
  // The paragraph, not `draftText`: an uncommitted edit is not what would be
  // sent, and enabling Save on it would store the committed text while the user
  // is looking at something else. The blank cap needs no term here —
  // `useCardDraft` slices at `ANSWERS_MAX_PER_CARD` when it renumbers.
  const ready = draft.paragraph.trim().length > 0

  /**
   * Disabled while a save is in flight, not only after it succeeds.
   *
   * The debounce writes 500ms after the last keystroke, so a timer queued just
   * before Save would otherwise fire once the composer has already cleared and
   * reset — restoring the paragraph of a card that now exists. Flipping
   * `enabled` cancels the pending timer through the effect's own cleanup.
   */
  useCardDraftPersistence(
    scope,
    { paragraph: draft.paragraph, answers: draft.answers, tags },
    !editing && !pending,
  )

  /**
   * Focus the paragraph on mount.
   *
   * The composer is opened by a click somewhere else on the page — the "Add a
   * card" affordance, or a row's Edit button — so without this the caret is
   * still on a button the user has just made disappear.
   */
  useEffect(() => {
    const node = document.getElementById(PARAGRAPH_FIELD_ID)
    if (node instanceof HTMLTextAreaElement) node.focus()
  }, [])

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
      // Emptied rather than collapsed. Tags are cleared with it: they described
      // the card that was just saved, and carrying them silently onto the next
      // one is a mistake the user only notices later, in the tag filter.
      draft.reset({ paragraph: '' })
      setTags([])
      setAdded((count) => count + 1)
    } catch (error) {
      setFromError(error)
    }
  }

  return (
    <Card as="section" aria-label={editing ? 'Edit card' : 'New card'} className="space-y-5 p-5">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {errors.general && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-warning">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
            {errors.general}
          </p>
        )}

        <HighlightEditor draft={draft} />

        {/*
          Surfaced here rather than beside the editor: a rejected answer range is
          reported against `answers`, and the editor has no field to attach it to.
        */}
        {(errors.fields.answers ?? errors.fields.paragraph) && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-warning">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
            {errors.fields.answers ?? errors.fields.paragraph}
          </p>
        )}

        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={allTags.data?.tags.map((entry) => entry.tag)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || !ready}>
            {pending ? 'Saving…' : editing ? 'Save card' : 'Add card'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {editing ? 'Cancel' : 'Done'}
          </Button>
          {draft.answers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              A card with no blanks is still worth saving — you can highlight later.
            </p>
          )}
        </div>

        {/*
          The only feedback that a save landed, since the composer does not move.
          Polite rather than assertive: it is a confirmation, not something the
          user has to act on, and it fires while they are typing the next card.
        */}
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {added > 0 &&
            `${String(added)} ${added === 1 ? 'card' : 'cards'} added. Write another, or press Done.`}
        </p>
      </form>
    </Card>
  )
}

interface CardComposerProps {
  setId: string
  /** Editing an existing card. Absent means create. */
  cardId?: string
  /** Collapse the composer. */
  onClose: () => void
}

/**
 * The composer, with the fetch an edit needs in front of it.
 *
 * Split in two for the same reason the old editor page was. {@link useCardDraft}
 * seeds its state from `useState` initializers, which only run on the first
 * render, so a composer mounted while the card is still loading would initialize
 * empty and need a `reset` once the fetch lands. That reset races the user: type
 * during the fetch and the edit is discarded. Gating on the data means the inner
 * component mounts with the paragraph already in hand.
 *
 * The list carries `StudyCardSummary`, which has no `answers`, so seeding from
 * the row would render a paragraph with every highlight missing — and saving it
 * would then persist that as the truth.
 */
export function CardComposer({ setId, cardId, onClose }: CardComposerProps): ReactElement {
  const card = useCard(cardId)

  if (cardId === undefined) return <Composer setId={setId} onClose={onClose} />

  if (card.isError) {
    return (
      <Card role="alert" tone="danger" className="p-5">
        <p className="text-sm">That card could not be loaded. It may have been deleted.</p>
        <Button className="mt-3" variant="soft" size="sm" onClick={onClose}>
          Close
        </Button>
      </Card>
    )
  }

  // `data` rather than `isPending`, so the success branch narrows.
  if (card.data === undefined) {
    return (
      <Card className="space-y-3 p-5" aria-busy="true">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full" />
      </Card>
    )
  }

  // Keyed by id so switching from one row's Edit to another's remounts the
  // draft. Without it the second card opens showing the first one's paragraph.
  return <Composer key={card.data.card.id} setId={setId} card={card.data.card} onClose={onClose} />
}

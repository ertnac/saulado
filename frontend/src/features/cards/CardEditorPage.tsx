import { useState, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CARD_TITLE_MAX_LENGTH,
  type AnswerInput,
  type StudyCard,
  type DraftAnswer,
} from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertIcon } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { useFormErrors } from '@/hooks/useFormErrors'
import { HighlightEditor } from './HighlightEditor'
import { TagInput } from './TagInput'
import { useCardDraft } from './useCardDraft'
import { clearDraft, readDraft, useCardDraftPersistence } from './useCardDraftPersistence'
import { useCard, useCreateCard, useTags, useUpdateCard } from './queries'

/**
 * Create and edit a card — one editor, two entry routes.
 *
 * Split in two on purpose. {@link useCardDraft} seeds its state from `useState`
 * initializers, which only run on the first render, so an editor mounted while the
 * card is still loading would initialize empty and need a `reset` once the fetch
 * lands. That reset races the user: type during the fetch and the edit is
 * discarded. Gating on the data instead means the inner component mounts with the
 * paragraph already in hand.
 */

// ── Inner editor ────────────────────────────────────────────────────────────

interface CardEditorProps {
  setId: string
  /** Absent means create. */
  card?: StudyCard
}

/** Offsets and alternatives only — the server derives every `answerText`. */
function toAnswerInputs(answers: readonly DraftAnswer[]): AnswerInput[] {
  return answers.map((answer) => ({
    startOffset: answer.startOffset,
    endOffset: answer.endOffset,
    ...(answer.altAnswers.length > 0 ? { altAnswers: answer.altAnswers } : {}),
  }))
}

function CardEditor({ setId, card }: CardEditorProps): ReactElement {
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
  const [title, setTitle] = useState(restored?.title ?? card?.title ?? '')
  const [tags, setTags] = useState<string[]>(restored?.tags ?? card?.tags ?? [])
  const [saved, setSaved] = useState(false)

  const navigate = useNavigate()
  const { errors, setFromError, clear } = useFormErrors()
  const allTags = useTags()
  const create = useCreateCard(setId)
  const update = useUpdateCard(card?.id ?? '')

  const pending = create.isPending || update.isPending
  const trimmed = title.trim()
  // The paragraph, not `draftText`: an uncommitted edit is not what would be sent,
  // and enabling Save on it would store the committed text while the user is
  // looking at something else.
  const ready = trimmed.length > 0 && draft.paragraph.trim().length > 0 && !saved

  useCardDraftPersistence(
    scope,
    { paragraph: draft.paragraph, answers: draft.answers, title, tags },
    !editing && !saved,
  )

  const submit = async (): Promise<void> => {
    clear()
    const answers = toAnswerInputs(draft.answers)

    try {
      if (editing) {
        // `paragraph` and `answers` always travel together: the offsets index into
        // this paragraph and nothing else.
        await update.mutateAsync({ title: trimmed, paragraph: draft.paragraph, answers, tags })
      } else {
        await create.mutateAsync({ title: trimmed, paragraph: draft.paragraph, answers, tags })
      }

      // Cleared and disabled before navigating, or a queued debounce writes the
      // draft back after the card it came from already exists.
      setSaved(true)
      clearDraft(scope)
      void navigate(`/sets/${setId}`)
    } catch (error) {
      setFromError(error)
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <PageHeader
        title={editing ? 'Edit card' : 'New card'}
        description="Write the paragraph, then highlight the words worth recalling."
        className="mb-0"
      />

      {errors.general && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-warning">
          <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
          {errors.general}
        </p>
      )}

      <FormField
        label="Title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
        }}
        maxLength={CARD_TITLE_MAX_LENGTH}
        error={errors.fields.title}
        autoComplete="off"
        placeholder="The parts of a computer"
      />

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
          {pending ? 'Saving…' : editing ? 'Save card' : 'Create card'}
        </Button>
        <Link className={buttonClass({ variant: 'ghost' })} to={`/sets/${setId}`}>
          Cancel
        </Link>
        {draft.answers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            A card with no blanks is still worth saving — you can highlight later.
          </p>
        )}
      </div>
    </form>
  )
}
// ── Routes ──────────────────────────────────────────────────────────────────

/** `/sets/:setId/cards/new` — nothing to fetch, so the editor mounts directly. */
export function NewCardPage(): ReactElement {
  const { setId } = useParams<{ setId: string }>()

  if (setId === undefined) return <NotFound />

  return <CardEditor setId={setId} />
}

/** `/cards/:cardId` — the editor waits for the card it is editing. */
export function EditCardPage(): ReactElement {
  const { cardId } = useParams<{ cardId: string }>()
  const card = useCard(cardId)

  // Error and a missing param first, then "no data yet" as the loading condition.
  // Testing `data` rather than `isPending` is what makes the success branch
  // narrow, and it also covers the disabled-query case: `useCard(undefined)` stays
  // pending forever, which as an `isPending` check would be a permanent skeleton.
  if (card.isError || cardId === undefined) return <NotFound />

  if (card.data === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // Keyed by id so navigating between two cards remounts the editor. Without it
  // the draft state persists and the second card opens showing the first card's
  // paragraph — the same trap `SetDialog` is keyed against.
  const { card: loaded } = card.data

  return <CardEditor key={loaded.id} setId={loaded.studySetId} card={loaded} />
}

function NotFound(): ReactElement {
  return (
    <Card role="alert" tone="danger" className="p-5">
      <p className="text-sm">That card could not be loaded. It may have been deleted.</p>
      <Link className={buttonClass({ variant: 'soft', size: 'sm', className: 'mt-3' })} to="/sets">
        Back to your sets
      </Link>
    </Card>
  )
}

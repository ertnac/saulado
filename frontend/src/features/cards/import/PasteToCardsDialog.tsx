import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AnswerRange } from '@saulado/shared'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'
import { PasteTextEditor } from './PasteTextEditor'
import { useCreateSet, useSets } from '../queries'

export interface PasteToCardsDialogProps {
  open: boolean
  onClose: () => void
  onImport?: (questions: { text: string; answers: AnswerRange[] }[]) => void
  targetSetId?: string
}

export function PasteToCardsDialog({
  open,
  onClose,
  onImport,
  targetSetId,
}: PasteToCardsDialogProps): ReactElement {
  const navigate = useNavigate()
  const setsQuery = useSets()
  const createSetMutation = useCreateSet()

  const [step, setStep] = useState<'editor' | 'select-set'>('editor')
  const [cardsToCreate, setCardsToCreate] = useState<{ text: string; answers: AnswerRange[] }[]>([])
  const [selectedSetId, setSelectedSetId] = useState<string>(targetSetId ?? 'new')
  const [newSetName, setNewSetName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleClose = (): void => {
    setStep('editor')
    setCardsToCreate([])
    onClose()
  }

  const handleCommitCards = (cards: { text: string; answers: AnswerRange[] }[]): void => {
    if (cards.length === 0) {
      toast.error('Highlight at least one word to create flashcard blanks.')
      return
    }

    if (onImport) {
      onImport(cards)
      handleClose()
      return
    }

    if (targetSetId) {
      void saveCardsToSet(targetSetId, cards)
      return
    }

    setCardsToCreate(cards)
    setStep('select-set')
  }

  const saveCardsToSet = async (
    setId: string,
    cards: { text: string; answers: AnswerRange[] }[],
  ): Promise<void> => {
    setIsSubmitting(true)
    try {
      let finalSetId = setId
      if (finalSetId === 'new') {
        const created = await createSetMutation.mutateAsync({
          title: newSetName.trim() || 'Pasted Notes Set',
        })
        finalSetId = created.set.id
      }

      const { createCard } = await import('@/services/cards')
      for (const card of cards) {
        await createCard(finalSetId, {
          paragraph: card.text,
          answers: card.answers,
        })
      }

      toast.success(`Created ${cards.length} card${cards.length === 1 ? '' : 's'}!`)
      handleClose()
      void navigate(`/sets/${finalSetId}`)
    } catch (error) {
      console.warn('[paste-to-cards] failed to save cards:', error)
      toast.error('Failed to create flashcards. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const existingSets = setsQuery.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={step === 'editor' ? 'Paste Notes to Cards' : 'Select Target Study Set'}
      description={
        step === 'editor'
          ? 'Paste or type notes, then highlight words to create cloze flashcard blanks.'
          : 'Choose which study set will receive these new flashcards.'
      }
    >
      {step === 'editor' && (
        <div className="mt-2 -mx-6 -mb-6">
          <PasteTextEditor
            onCommitCards={handleCommitCards}
            onCancel={handleClose}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {step === 'select-set' && (
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label htmlFor="target-set-select" className="text-sm font-medium text-foreground">
              Save to Study Set
            </label>
            <select
              id="target-set-select"
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="new">+ Create New Study Set</option>
              {existingSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.cardCount} cards)
                </option>
              ))}
            </select>
          </div>

          {selectedSetId === 'new' && (
            <div className="space-y-2">
              <label htmlFor="new-set-name-input" className="text-sm font-medium text-foreground">
                New Set Title
              </label>
              <input
                id="new-set-name-input"
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="e.g. Biology Notes"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            Ready to add <strong>{cardsToCreate.length}</strong> new flashcard
            {cardsToCreate.length === 1 ? '' : 's'}.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep('editor')} disabled={isSubmitting}>
              Back
            </Button>
            <Button
              variant="default"
              onClick={() => {
                void saveCardsToSet(selectedSetId, cardsToCreate)
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Save Flashcards'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

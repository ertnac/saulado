import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AnswerRange } from '@saulado/shared'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/stores/toast'
import { OcrReviewEditor } from '../cards/import/OcrReviewEditor'
import { useCreateSet, useSets } from '../cards/queries'

export interface MakeCardsDialogProps {
  open: boolean
  onClose: () => void
  documentName: string
  extractedText: string
}

export function MakeCardsDialog({
  open,
  onClose,
  documentName,
  extractedText,
}: MakeCardsDialogProps): ReactElement {
  const navigate = useNavigate()
  const setsQuery = useSets()
  const createSetMutation = useCreateSet()

  const [step, setStep] = useState<'review' | 'select-set'>('review')
  const [cardsToCreate, setCardsToCreate] = useState<{ text: string; answers: AnswerRange[] }[]>([])
  const [selectedSetId, setSelectedSetId] = useState<string>('new')
  const [newSetName, setNewSetName] = useState(documentName.replace(/\.[^/.]+$/, ''))
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Hand-off cards from editor
  const handleCommitCards = (cards: { text: string; answers: AnswerRange[] }[]) => {
    if (cards.length === 0) {
      toast.error('No valid cards with blanks were found.')
      return
    }
    setCardsToCreate(cards)
    setStep('select-set')
  }

  // Create cards in chosen set
  const handleSaveToSet = async () => {
    if (cardsToCreate.length === 0) return
    setIsSubmitting(true)

    try {
      let targetSetId = selectedSetId

      if (targetSetId === 'new') {
        const created = await createSetMutation.mutateAsync({
          title: newSetName.trim() || documentName,
        })
        targetSetId = created.set.id
      }

      // Sequential card creation
      const { createCard } = await import('@/services/cards')
      for (const card of cardsToCreate) {
        await createCard(targetSetId, {
          paragraph: card.text,
          answers: card.answers,
        })
      }

      toast.success(`Created ${cardsToCreate.length} card${cardsToCreate.length === 1 ? '' : 's'}!`)
      onClose()
      void navigate(`/sets/${targetSetId}`)
    } catch (error) {
      console.warn('[make-cards] failed to save cards:', error)
      toast.error('Failed to create flashcards. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const existingSets = setsQuery.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={step === 'review' ? 'Highlight & Create Flashcards' : 'Select Target Set'}
      description={
        step === 'review'
          ? 'Review extracted document text. Click words to turn them into cloze blanks.'
          : 'Choose where to add your new flashcards.'
      }
    >
      {step === 'review' && (
        <div className="mt-2 -mx-6 -mb-6">
          <OcrReviewEditor
            initialText={extractedText}
            onCommitCards={handleCommitCards}
            onCancel={onClose}
          />
        </div>
      )}

      {step === 'select-set' && (
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Save to Study Set</label>
            <select
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="new">+ Create New Set</option>
              {existingSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.cardCount} cards)
                </option>
              ))}
            </select>
          </div>

          {selectedSetId === 'new' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">New Set Title</label>
              <input
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
            <Button variant="ghost" onClick={() => setStep('review')} disabled={isSubmitting}>
              Back
            </Button>
            <Button
              variant="default"
              onClick={() => {
                void handleSaveToSet()
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

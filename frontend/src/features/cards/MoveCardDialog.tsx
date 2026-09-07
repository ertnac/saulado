import { useState, type ReactElement } from 'react'
import { cardLabel, type StudyCardSummary } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAllSets, useCreateSet, useUpdateCard } from './queries'

interface MoveCardDialogProps {
  open: boolean
  onClose: () => void
  card: StudyCardSummary | null
  currentSetId: string
}

export function MoveCardDialog({
  open,
  onClose,
  card,
  currentSetId,
}: MoveCardDialogProps): ReactElement | null {
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const allSets = useAllSets()
  const updateCard = useUpdateCard(card?.id ?? '')
  const createSet = useCreateSet()

  if (!card) return null

  const sets = allSets.data ?? []
  const effectiveSourceSetId = card.studySetId || currentSetId

  const filteredSets = sets.filter((s) =>
    s.title.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const handleMoveTo = async (targetSetId: string): Promise<void> => {
    if (targetSetId === effectiveSourceSetId) return
    await updateCard.mutateAsync({ studySetId: targetSetId })
    onClose()
  }

  const handleCreateAndMove = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title) return
    const res = await createSet.mutateAsync({ title })
    if (res?.set?.id) {
      await updateCard.mutateAsync({ studySetId: res.set.id })
      onClose()
    }
  }

  const pending = updateCard.isPending || createSet.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move card to study set"
      description={`Card: "${cardLabel(card.paragraph)}"`}
    >
      <div className="space-y-4">
        {creating ? (
          <div className="space-y-3 rounded-2xl border p-4 bg-muted/30">
            <h4 className="text-sm font-semibold">Create new study set & move</h4>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Set title..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreating(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => void handleCreateAndMove()}
                disabled={pending || !newTitle.trim()}
              >
                {pending ? 'Moving…' : 'Create & Move'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search destination sets..."
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewTitle(search)
                setCreating(true)
              }}
            >
              + New set
            </Button>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {allSets.isLoading ? (
            <p className="text-center py-6 text-sm text-muted-foreground">Loading sets…</p>
          ) : filteredSets.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                {sets.length === 0
                  ? 'No other study sets found. Create another study set first.'
                  : `No study sets matching "${search}".`}
              </p>
              {!creating && (
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    setNewTitle(search.trim())
                    setCreating(true)
                  }}
                >
                  Create "{search || 'New Set'}" & Move
                </Button>
              )}
            </div>
          ) : (
            filteredSets.map((s) => {
              const isCurrent = s.id === effectiveSourceSetId
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={isCurrent || pending}
                  onClick={() => void handleMoveTo(s.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                    isCurrent
                      ? 'opacity-50 cursor-not-allowed bg-muted/40 border-muted'
                      : 'hover:bg-muted/30 cursor-pointer border-border active:bg-muted/50'
                  }`}
                >
                  <div>
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.cardCount} {s.cardCount === 1 ? 'card' : 'cards'}
                      {s.parentId ? ' · sub-set' : ''}
                    </p>
                  </div>
                  {isCurrent ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Current
                    </span>
                  ) : (
                    <span className="text-xs text-primary font-medium">Move here →</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}

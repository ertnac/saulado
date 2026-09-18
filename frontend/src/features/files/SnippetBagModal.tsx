import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, ConfirmDialog } from '@/components/ui/dialog'
import { DocumentIcon, PencilIcon, ShoppingBagIcon, TrashIcon } from '@/components/ui/icons'
import { useSnippetBagStore, type BaggedSnippet } from '@/stores/snippet-bag'
import { toast } from '@/stores/toast'

export interface SnippetBagModalProps {
  open: boolean
  onClose: () => void
  onOpenSplitView?: (fileId: string, snippetId?: string) => void
}

export function SnippetBagModal({
  open,
  onClose,
  onOpenSplitView,
}: SnippetBagModalProps): ReactElement | null {
  const navigate = useNavigate()
  const snippets = useSnippetBagStore((s) => s.snippets)
  const removeSnippet = useSnippetBagStore((s) => s.removeSnippet)
  const updateSnippetText = useSnippetBagStore((s) => s.updateSnippetText)
  const clearBag = useSnippetBagStore((s) => s.clearBag)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const handleStartEdit = (id: string, text: string) => {
    setEditingId(id)
    setEditText(text)
  }

  const handleSaveEdit = (id: string) => {
    if (editText.trim().length === 0) {
      toast.error('Snippet text cannot be completely empty.')
      return
    }
    updateSnippetText(id, editText.trim())
    setEditingId(null)
    setEditText('')
    toast.success('Snippet updated.')
  }

  const handleClearAll = () => {
    clearBag()
    setClearConfirmOpen(false)
    toast.info('Study bag cleared.')
  }

  const handleProceedToCreateCards = () => {
    if (snippets.length === 0) return
    onClose()
    // Open the first snippet's document in split mode
    const firstSnippet = snippets[0]
    if (firstSnippet) {
      if (onOpenSplitView) {
        onOpenSplitView(firstSnippet.fileId, firstSnippet.id)
      } else {
        void navigate(`/files/${firstSnippet.fileId}?split=true&snippetId=${firstSnippet.id}`)
      }
    }
  }

  const handleOpenSnippetInSplit = (snippet: BaggedSnippet) => {
    onClose()
    if (onOpenSplitView) {
      onOpenSplitView(snippet.fileId, snippet.id)
    } else {
      void navigate(`/files/${snippet.fileId}?split=true&snippetId=${snippet.id}`)
    }
  }

  if (!open) return null

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Study Bag"
        description="Curated words & paragraphs from your documents ready for flashcard conversion."
      >
        <div className="space-y-4 max-h-[70vh] flex flex-col -mx-6 -mb-6 px-6 pb-6">
          {/* Top Info Strip */}
          <div className="flex items-center justify-between border-b border-border/70 pb-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingBagIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-semibold text-foreground">
                {snippets.length} {snippets.length === 1 ? 'saved note' : 'saved notes'}
              </span>
            </div>

            {snippets.length > 0 && (
              <button
                type="button"
                onClick={() => setClearConfirmOpen(true)}
                className="text-xs font-medium text-danger hover:underline transition-all"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Body Content */}
          {snippets.length === 0 ? (
            <Card tone="dashed" className="p-8 text-center space-y-3 my-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground">
                <ShoppingBagIcon className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Your Study Bag is Empty</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Open any document in the File Repository, then select words or paragraphs to bag
                them into your study cart or create cloze flashcards.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose()
                  void navigate('/files')
                }}
                className="mt-2"
              >
                Go to File Repository
              </Button>
            </Card>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
              <p className="text-xs text-muted-foreground">
                Review and curate your bagged notes. You can edit text or launch Split View to turn
                them into cards:
              </p>

              {snippets.map((snippet, index) => {
                const isEditing = editingId === snippet.id
                const wordsCount = snippet.text.trim().split(/\s+/).filter(Boolean).length

                return (
                  <Card
                    key={snippet.id}
                    className="p-4 bg-surface border border-border/70 space-y-3 transition-all hover:border-primary/40 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <DocumentIcon className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-xs font-bold text-foreground truncate">
                          {snippet.fileName}
                        </span>
                        {snippet.pageNumber && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary shrink-0">
                            Page {snippet.pageNumber}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          #{index + 1} · {wordsCount} {wordsCount === 1 ? 'word' : 'words'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSnippet(snippet.id)}
                          title="Remove from bag"
                          className="p-1 text-muted-foreground hover:text-danger transition-colors rounded"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-primary bg-background p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSaveEdit(snippet.id)}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-line bg-surface-muted/30 p-2.5 rounded-lg border border-border/40 font-mono">
                          {snippet.text}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenSnippetInSplit(snippet)}
                            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                          >
                            <span>🔀 Create Card in Split View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(snippet.id, snippet.text)}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <PencilIcon className="h-3 w-3" />
                            <span>Edit note</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          {/* Footer Checkout Action */}
          {snippets.length > 0 && (
            <div className="border-t border-border/70 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {snippets.length} item{snippets.length === 1 ? '' : 's'} ready for conversion
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button variant="ghost" size="sm" onClick={onClose} className="flex-1 sm:flex-none">
                  Close
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleProceedToCreateCards}
                  className="flex-1 sm:flex-none font-semibold"
                >
                  Proceed to Card Studio ({snippets.length}) →
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Clear Confirmation */}
      <ConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Clear Study Bag?"
        description="Are you sure you want to remove all saved snippets from your study bag? This cannot be undone."
        confirmLabel="Clear Bag"
        onConfirm={handleClearAll}
      />
    </>
  )
}

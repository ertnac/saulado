import { useState, type ReactElement } from 'react'
import { getSeedDecks, type ParsedImportSet } from '@saulado/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SparklesIcon } from '@/components/ui/icons'
import { setKeys, cardKeys } from '@/features/cards/queries'
import { setAccentClass } from '@/features/cards/colors'
import { importSetsAndCards } from '@/services/transfer/json-import'
import { toast } from '@/stores/toast'
import { cn } from '@/lib/utils'

export interface SeedDecksDialogProps {
  open: boolean
  onClose: () => void
}

export function SeedDecksDialog({ open, onClose }: SeedDecksDialogProps): ReactElement {
  const queryClient = useQueryClient()
  const seedData = getSeedDecks()

  const [importing, setImporting] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [expandedSetTitle, setExpandedSetTitle] = useState<string | null>(null)

  const handleImport = async (setsToImport: ParsedImportSet[]): Promise<void> => {
    setImporting(true)
    setProgressPercent(0)
    setProgressText('Preparing starter decks…')

    try {
      const payload = {
        sets: setsToImport,
        totalCards: setsToImport.reduce((sum, s) => sum + s.cards.length, 0),
      }

      const result = await importSetsAndCards(payload, (current, total, msg) => {
        setProgressPercent(Math.round((current / total) * 100))
        setProgressText(msg)
      })

      await queryClient.invalidateQueries({ queryKey: setKeys.all })
      await queryClient.invalidateQueries({ queryKey: cardKeys.all })

      toast.success(
        `Imported ${result.importedSets} starter ${result.importedSets === 1 ? 'deck' : 'decks'} (${result.importedCards} cards)!`,
      )
      onClose()
    } catch (err) {
      toast.error('Failed to import starter decks. Please try again.')
      console.error(err)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!importing) onClose()
      }}
      title="Starter Study Decks"
      description="Jumpstart your learning with pre-built, high-yield cloze flashcards across foundational subjects."
    >
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {importing ? (
          <div className="space-y-4 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <SparklesIcon className="h-6 w-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">Importing Starter Decks…</h4>
              <p className="text-xs text-muted-foreground">{progressText}</p>
            </div>
            <div className="mx-auto w-full max-w-xs space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {progressPercent}% completed
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-primary/10 p-4 border border-primary/20">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground">All Starter Decks Bundle</p>
                <p className="text-xs text-muted-foreground">
                  3 decks · {seedData.totalCards} cards total
                </p>
              </div>
              <Button
                variant="accent"
                onClick={() => {
                  void handleImport(seedData.sets)
                }}
              >
                <SparklesIcon className="mr-1.5 h-4 w-4" />
                Import All (30 Cards)
              </Button>
            </div>

            <div className="space-y-3 pt-1">
              {seedData.sets.map((set) => {
                const isExpanded = expandedSetTitle === set.title
                return (
                  <Card
                    key={set.title}
                    className={cn(
                      'p-4 transition-all border-l-4 space-y-3',
                      setAccentClass(set.color ?? 'slate'),
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-semibold text-foreground">{set.title}</h4>
                          <Badge tone="muted" className="text-xs">
                            {set.cards.length} cards
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedSetTitle(isExpanded ? null : set.title)}
                        >
                          {isExpanded ? 'Hide Preview' : 'Preview Cards'}
                        </Button>
                        <Button
                          variant="soft"
                          size="sm"
                          onClick={() => {
                            void handleImport([set])
                          }}
                        >
                          Import Deck
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 space-y-2 rounded-lg bg-surface-muted/50 p-3 text-xs border border-border/50">
                        <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                          Sample Cards ({set.cards.length}):
                        </p>
                        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {set.cards.map((c, i) => (
                            <li
                              key={i}
                              className="rounded bg-background p-2 text-foreground border border-border/40"
                            >
                              <span className="font-semibold text-muted-foreground mr-1.5">
                                {i + 1}.
                              </span>
                              {c.paragraph}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>

      <DialogActions>
        <Button variant="ghost" disabled={importing} onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

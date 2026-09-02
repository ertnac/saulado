import { useMemo, useState, type ReactElement } from 'react'
import type { StudySet } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { setAccentClass } from '@/features/cards/colors'
import { cardCountLabel } from '@/features/cards/counts'
import { flattenPages, useDeleteSet, useSets, useUpdateSet } from '@/features/cards/queries'
import { Section } from './SettingsControls'
import { cn } from '@/lib/utils'

export function ArchivedSetsSection(): ReactElement {
  const archivedSets = useSets({ archived: true })
  const updateSet = useUpdateSet()
  const deleteSet = useDeleteSet()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletingSets, setDeletingSets] = useState<StudySet[] | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const items = useMemo(() => flattenPages(archivedSets.data), [archivedSets.data])

  const allSelected = items.length > 0 && selectedIds.size === items.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((s) => s.id)))
    }
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleRestoreSingle = (set: StudySet): void => {
    updateSet.mutate({ id: set.id, body: { archived: false } })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(set.id)
      return next
    })
  }

  const handleBulkRestore = async (): Promise<void> => {
    if (selectedIds.size === 0 || isProcessing) return
    setIsProcessing(true)

    try {
      const idsToRestore = Array.from(selectedIds)
      for (const id of idsToRestore) {
        await updateSet.mutateAsync({ id, body: { archived: false } })
      }
      setSelectedIds(new Set())
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkDeleteConfirm = async (): Promise<void> => {
    if (!deletingSets || deletingSets.length === 0 || isProcessing) return
    setIsProcessing(true)

    try {
      for (const s of deletingSets) {
        await deleteSet.mutateAsync(s.id)
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        deletingSets.forEach((s) => next.delete(s.id))
        return next
      })
      setDeletingSets(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const selectedSets = useMemo(
    () => items.filter((s) => selectedIds.has(s.id)),
    [items, selectedIds],
  )

  return (
    <Section title="Archived Sets">
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {items.length === 1 ? '1 archived set' : `${items.length} archived sets`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sets you archive are kept here. You can restore them to your active library or
              permanently delete them.
            </p>
          </div>
        </div>

        {archivedSets.isPending ? (
          <div className="space-y-2.5" aria-busy="true">
            {[0, 1].map((key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 p-6 text-center">
            <p className="text-sm font-medium text-foreground">No archived sets</p>
            <p className="text-xs text-muted-foreground mt-1">
              When you archive a set from the Sets page, it will be safely stored here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* ── Bulk Action Controls ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted/60 p-3 border border-border/60">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleSelectAll}
                  aria-label="Select all archived sets"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                />
                <span>
                  {selectedIds.size > 0
                    ? `${selectedIds.size} of ${items.length} selected`
                    : 'Select all'}
                </span>
              </label>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedIds.size === 0 || isProcessing}
                  onClick={() => {
                    void handleBulkRestore()
                  }}
                >
                  {isProcessing ? 'Restoring…' : `Restore (${selectedIds.size})`}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selectedIds.size === 0 || isProcessing}
                  onClick={() => setDeletingSets(selectedSets)}
                  className="text-danger hover:bg-danger/10"
                >
                  Delete Permanently ({selectedIds.size})
                </Button>
              </div>
            </div>

            {/* ── Archived Sets List ── */}
            <ul className="space-y-2.5">
              {items.map((set) => {
                const isChecked = selectedIds.has(set.id)
                return (
                  <li
                    key={set.id}
                    className={cn(
                      'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 transition-colors border-l-4',
                      setAccentClass(set.color),
                      isChecked
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-surface hover:bg-surface-muted/30',
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(set.id)}
                        aria-label={`Select ${set.title}`}
                        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                      />

                      <div className="min-w-0 space-y-0.5">
                        <h4 className="text-sm font-semibold text-foreground truncate">
                          {set.title}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {cardCountLabel(set)}
                          {set.archivedAt && (
                            <span> · Archived {new Date(set.archivedAt).toLocaleDateString()}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <Button
                        variant="soft"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => handleRestoreSingle(set)}
                      >
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => setDeletingSets([set])}
                        className="text-danger hover:bg-danger/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Card>

      {/* ── Confirm Delete Dialog (Single or Bulk) ── */}
      <ConfirmDialog
        open={deletingSets !== null}
        onClose={() => setDeletingSets(null)}
        pending={isProcessing || deleteSet.isPending}
        title={
          deletingSets && deletingSets.length > 1
            ? `Permanently delete ${deletingSets.length} sets?`
            : 'Permanently delete this set?'
        }
        description={
          deletingSets
            ? deletingSets.length === 1
              ? `“${deletingSets[0]?.title}” and its ${deletingSets[0]?.subtreeCardCount} cards will be permanently removed. This cannot be undone.`
              : `${deletingSets.length} sets and a total of ${deletingSets.reduce(
                  (sum, s) => sum + s.subtreeCardCount,
                  0,
                )} cards will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmLabel={
          deletingSets && deletingSets.length > 1
            ? `Delete ${deletingSets.length} sets`
            : 'Delete set'
        }
        onConfirm={() => {
          void handleBulkDeleteConfirm()
        }}
      />
    </Section>
  )
}

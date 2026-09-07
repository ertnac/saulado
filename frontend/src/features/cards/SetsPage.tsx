import { useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { SET_COLORS, type SetColor, type StudySet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Stagger, StaggerItem } from '@/components/motion/Stagger'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { segmentClass } from '@/components/ui/segmented'
import {
  CloseIcon,
  PlusIcon,
  SearchIcon,
  ShareIcon,
  SparklesIcon,
  UploadIcon,
  ZapIcon,
} from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDueCounts } from '@/features/study/queries'
import { cn } from '@/lib/utils'
import { setAccentClass, setColorClass } from './colors'
import { cardCountLabel, childCountLabel } from './counts'
import { SetDialog } from './SetDialog'
import { MoveSetDialog } from './MoveSetDialog'
import { UniversalImportDialog } from './transfer/UniversalImportDialog'
import { SeedDecksDialog } from './transfer/SeedDecksDialog'
import { QuickLearnDialog } from '@/features/study/QuickLearnDialog'
import { shareOrDownloadSetJson } from '@/services/transfer/json-export'
import { flattenPages, useCreateSet, useDeleteSet, useSets, useUpdateSet } from './queries'

export type SetSortOption = 'title-asc' | 'due-desc' | 'mastery-desc' | 'cards-desc' | 'recent'

const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'

interface SetCardProps {
  set: StudySet
  due: number
  newCards: number
  mastered: number
  onEdit: () => void
  onMove: () => void
  onArchive: () => void
  onDelete: () => void
}

function SetCard({
  set,
  due,
  newCards,
  mastered,
  onEdit,
  onMove,
  onArchive,
  onDelete,
}: SetCardProps): ReactElement {
  const [sharing, setSharing] = useState(false)
  const isArchived = set.archivedAt !== null
  const studiable = !isArchived && due + newCards > 0
  const children = childCountLabel(set)

  const totalCards = set.subtreeCardCount
  const masteryPercent =
    totalCards > 0 ? Math.min(100, Math.max(0, Math.round((mastered / totalCards) * 100))) : 0

  const handleShare = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setSharing(true)
    void shareOrDownloadSetJson(set.id, set.title).finally(() => {
      setSharing(false)
    })
  }

  return (
    <Card
      /*
        A `div` inside the `StaggerItem`'s `li` rather than being the `li` itself:
        the list item has to be the element the stagger and the reflow animate, and
        `Card` is not a motion component. `h-full` because the `li` is now the grid
        item, so the card has to fill the track it used to define.
      */
      interactive
      className={cn('relative flex h-full flex-col p-5 pb-2 border-l-4', setAccentClass(set.color))}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold leading-snug tracking-tight">
          <Link to={`/sets/${set.id}`} className="rounded after:absolute after:inset-0">
            {set.title}
          </Link>
        </h3>

        {isArchived ? (
          <Badge className="relative shrink-0">Archived</Badge>
        ) : studiable ? (
          <Link
            to={`/study?set=${set.id}`}
            className={buttonClass({
              variant: 'accent',
              className: 'relative shrink-0 px-4',
            })}
          >
            {due > 0 ? 'Study' : 'Learn'}
            <span className="tabular-nums">{due > 0 ? due : newCards}</span>
          </Link>
        ) : null}
      </div>

      <p className="mb-3 mt-1 text-sm tabular-nums text-muted-foreground">
        {cardCountLabel(set)}
        {children !== null && ` · ${children}`}
      </p>

      {/* ── Mastery Progress Bar ── */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Mastery</span>
          <span className="font-semibold text-foreground">
            {masteryPercent === 0 ? '0%' : `${masteryPercent}%`}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={masteryPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${set.title} mastery progress`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${masteryPercent}%` }}
          />
        </div>
      </div>

      {/* ── Management Footers ── */}
      <div className="relative -mx-5 mt-auto flex items-center gap-1 border-t border-border/60 px-2 pt-1">
        <Button variant="ghost" size="sm" className="h-11 px-2.5" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="h-11 px-2.5" onClick={onMove}>
          Move
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 px-2.5 text-muted-foreground hover:text-foreground"
          disabled={sharing}
          onClick={handleShare}
          title="Share or Export JSON"
        >
          <ShareIcon className="h-4 w-4 mr-1" />
          Share
        </Button>
        <Button variant="ghost" size="sm" className="h-11 px-2.5" onClick={onArchive}>
          {isArchived ? 'Restore' : 'Archive'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-11 px-2.5 text-danger"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </Card>
  )
}

function deleteWarning(set: StudySet): string {
  const cards = `${String(set.subtreeCardCount)} ${set.subtreeCardCount === 1 ? 'card' : 'cards'}`
  const tail = 'This cannot be undone — archive it instead if you only want it out of the way.'

  if (set.childCount === 0) return `“${set.title}” and its ${cards} will be removed. ${tail}`

  const children = `${String(set.childCount)} ${set.childCount === 1 ? 'sub-set' : 'sub-sets'}`

  return `“${set.title}”, its ${children} and everything inside them — ${cards} in total — will be removed. ${tail}`
}

export function SetsPage(): ReactElement {
  const [archived, setArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedColor, setSelectedColor] = useState<SetColor | 'all'>('all')
  const [sortBy, setSortBy] = useState<SetSortOption>('title-asc')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [seedDecksOpen, setSeedDecksOpen] = useState(false)
  const [quickLearnOpen, setQuickLearnOpen] = useState(false)
  const [quickLearnSetId, setQuickLearnSetId] = useState<string | null>(null)
  const [editing, setEditing] = useState<StudySet | null>(null)
  const [movingSet, setMovingSet] = useState<StudySet | null>(null)
  const [deleting, setDeleting] = useState<StudySet | null>(null)

  const sets = useSets({ archived })
  const create = useCreateSet()
  const update = useUpdateSet()
  const remove = useDeleteSet()
  const due = useDueCounts()

  const rawItems = flattenPages(sets.data)
  const counts = useMemo(
    () => new Map(due.data?.counts.map((entry) => [entry.studySetId, entry])),
    [due.data?.counts],
  )

  // Filter and sort items client-side
  const filteredAndSortedItems = useMemo(() => {
    let result = [...rawItems]

    // 1. Search filter by title
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter((s) => s.title.toLowerCase().includes(query))
    }

    // 2. Color filter
    if (selectedColor !== 'all') {
      result = result.filter((s) => s.color === selectedColor)
    }

    // 3. Sort
    result.sort((a, b) => {
      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title)
      }
      if (sortBy === 'cards-desc') {
        return b.subtreeCardCount - a.subtreeCardCount
      }
      if (sortBy === 'due-desc') {
        const dueA = counts.get(a.id)?.due ?? 0
        const dueB = counts.get(b.id)?.due ?? 0
        return dueB - dueA
      }
      if (sortBy === 'mastery-desc') {
        const countA = counts.get(a.id)
        const countB = counts.get(b.id)
        const masteryA = a.subtreeCardCount > 0 ? (countA?.mastered ?? 0) / a.subtreeCardCount : 0
        const masteryB = b.subtreeCardCount > 0 ? (countB?.mastered ?? 0) / b.subtreeCardCount : 0
        return masteryB - masteryA
      }
      if (sortBy === 'recent') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return 0
    })

    return result
  }, [rawItems, searchQuery, selectedColor, sortBy, counts])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your sets"
        description="A set groups cards on one subject. Open one to add cards or nest a sub-set inside it."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQuickLearnSetId(null)
                setQuickLearnOpen(true)
              }}
            >
              <ZapIcon />
              Quick Learn
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSeedDecksOpen(true)
              }}
            >
              <SparklesIcon />
              Starter Decks
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setImporting(true)
              }}
            >
              <UploadIcon />
              Import Deck
            </Button>
            <Button
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon />
              New set
            </Button>
          </div>
        }
      />

      {/* ── Search, Filter & Controls Bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Active vs Archived Segmented Control */}
        <div className="inline-flex gap-1 rounded-full bg-surface-muted p-1 self-start">
          <button
            type="button"
            aria-pressed={!archived}
            className={segmentClass(!archived)}
            onClick={() => {
              setArchived(false)
            }}
          >
            Active
          </button>
          <button
            type="button"
            aria-pressed={archived}
            className={segmentClass(archived)}
            onClick={() => {
              setArchived(true)
            }}
          >
            Archived
          </button>
        </div>

        {/* Search Box & Sort Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none h-4 w-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sets…"
              aria-label="Search sets by title"
              className={cn(
                'h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-8 text-xs text-foreground',
                'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
              )}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search query"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SetSortOption)}
            aria-label="Sort sets by"
            className={cn(
              'h-9 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground',
              'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            )}
          >
            <option value="title-asc">Alphabetical (A–Z)</option>
            <option value="due-desc">Most Due First</option>
            <option value="mastery-desc">Highest Mastery</option>
            <option value="cards-desc">Most Cards</option>
            <option value="recent">Recently Created</option>
          </select>
        </div>
      </div>

      {/* ── Color Filter Chips ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground mr-1">Color:</span>
        <button
          type="button"
          aria-pressed={selectedColor === 'all'}
          onClick={() => setSelectedColor('all')}
          className={cn(
            'inline-flex h-6.5 items-center justify-center rounded-full px-2.5 text-xs font-medium transition-colors',
            selectedColor === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-muted text-muted-foreground hover:text-foreground',
          )}
        >
          All
        </button>
        {SET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-pressed={selectedColor === color}
            onClick={() => setSelectedColor(selectedColor === color ? 'all' : color)}
            className={cn(
              'inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium capitalize transition-colors',
              selectedColor === color
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', setColorClass(color))} />
            {color}
          </button>
        ))}
      </div>

      {sets.isPending ? (
        <ul className={GRID} aria-busy="true">
          {[0, 1, 2].map((key) => (
            <Card as="li" key={key} className="border-l-4 border-l-border p-5 pb-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mb-4 mt-2 h-4 w-28" />
              <Skeleton className="mb-3 h-2 w-full rounded-full" />
              <div className="border-t border-border/60 pt-4">
                <Skeleton className="h-5 w-32" />
              </div>
            </Card>
          ))}
        </ul>
      ) : sets.isError ? (
        <Card role="alert" tone="danger" className="p-5">
          <p className="text-sm">Could not load your sets.</p>
          <Button
            className="mt-3"
            variant="soft"
            size="sm"
            onClick={() => {
              void sets.refetch()
            }}
          >
            Try again
          </Button>
        </Card>
      ) : rawItems.length === 0 ? (
        <Card tone="dashed" className="p-8 text-center">
          <p className="font-medium">{archived ? 'Nothing archived' : 'No sets yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {archived
              ? 'Sets you archive stay here until you restore or delete them.'
              : 'Start with one paragraph of your notes. Highlight the words worth recalling and Saulado keeps the sentence around them.'}
          </p>
          {!archived && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="accent"
                onClick={() => {
                  setSeedDecksOpen(true)
                }}
              >
                <SparklesIcon />
                Explore Starter Decks
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(true)
                }}
              >
                <PlusIcon />
                Create your first set
              </Button>
            </div>
          )}
        </Card>
      ) : filteredAndSortedItems.length === 0 ? (
        <Card tone="dashed" className="p-8 text-center">
          <p className="font-medium">No matching sets found</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            No sets match your search query &quot;{searchQuery}&quot; or chosen color filter.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchQuery('')
              setSelectedColor('all')
            }}
          >
            Clear filters
          </Button>
        </Card>
      ) : (
        <>
          <Stagger as="ul" count={filteredAndSortedItems.length} className={GRID}>
            {filteredAndSortedItems.map((set) => {
              const entry = counts.get(set.id)
              return (
                /*
                  `layout` so a filter or sort change slides the surviving cards to
                  their new places instead of teleporting them. Deliberately no
                  `AnimatePresence`: an exit animation keeps a removed card mounted
                  while it plays, and a card is removed by deleting it — which
                  several tests assert is immediate. Same call the spec makes for
                  Dialog, for the same reason.
                */
                <StaggerItem as="li" layout key={set.id}>
                  <SetCard
                    set={set}
                    due={entry?.due ?? 0}
                    newCards={entry?.newCards ?? 0}
                    mastered={entry?.mastered ?? 0}
                    onEdit={() => {
                      setEditing(set)
                    }}
                    onMove={() => {
                      setMovingSet(set)
                    }}
                    onArchive={() => {
                      update.mutate({ id: set.id, body: { archived: set.archivedAt === null } })
                    }}
                    onDelete={() => {
                      setDeleting(set)
                    }}
                  />
                </StaggerItem>
              )
            })}
          </Stagger>

          {sets.hasNextPage && (
            <Button
              variant="soft"
              disabled={sets.isFetchingNextPage}
              onClick={() => {
                void sets.fetchNextPage()
              }}
            >
              {sets.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}

      {creating && (
        <SetDialog
          open
          onClose={() => {
            setCreating(false)
          }}
          pending={create.isPending}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
          }}
        />
      )}

      {editing && (
        <SetDialog
          key={editing.id}
          open
          set={editing}
          onClose={() => {
            setEditing(null)
          }}
          pending={update.isPending}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: editing.id, body: values })
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null)
        }}
        pending={remove.isPending}
        title="Delete this set?"
        description={deleting ? deleteWarning(deleting) : ''}
        confirmLabel="Delete set"
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSettled: () => {
              setDeleting(null)
            },
          })
        }}
      />

      <UniversalImportDialog
        open={importing}
        onClose={() => {
          setImporting(false)
        }}
      />

      <SeedDecksDialog
        open={seedDecksOpen}
        onClose={() => {
          setSeedDecksOpen(false)
        }}
      />

      <QuickLearnDialog
        open={quickLearnOpen}
        onClose={() => {
          setQuickLearnOpen(false)
          setQuickLearnSetId(null)
        }}
        initialSetId={quickLearnSetId}
      />

      <MoveSetDialog open={movingSet !== null} onClose={() => setMovingSet(null)} set={movingSet} />
    </div>
  )
}

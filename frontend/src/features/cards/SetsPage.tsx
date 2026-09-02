import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { StudySet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { segmentClass } from '@/components/ui/segmented'
import { PlusIcon, UploadIcon } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDueCounts } from '@/features/study/queries'
import { cn } from '@/lib/utils'
import { setAccentClass } from './colors'
import { cardCountLabel, childCountLabel } from './counts'
import { SetDialog } from './SetDialog'
import { UniversalImportDialog } from './transfer/UniversalImportDialog'
import { flattenPages, useCreateSet, useDeleteSet, useSets, useUpdateSet } from './queries'

/**
 * The library — every set the user owns.
 *
 * Roots only. Sets nest now, so a child is reached through its parent's page,
 * and a flat list of every depth would show each child twice — once under its
 * parent and once on its own.
 *
 * Archived sets are behind a toggle rather than mixed in with a badge: archiving
 * exists to get a set out of the way, and a list that still shows it has not done
 * the one thing it was asked to do.
 */

/**
 * The library grid.
 *
 * A grid rather than the stack this used to be: full-width rows turn a set into
 * a bar of text with three quarters of the line empty, and twelve of them read
 * as a table nobody can scan. Tiles give the title, the count and the study pill
 * a shape, and the same class string drives the skeleton so the two cannot drift.
 *
 * Two columns from `sm`, three from `xl`. Not four — the titles are user-written
 * and a fourth column truncates most of them.
 */
const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'

function SetCard({
  set,
  due,
  newCards,
  onEdit,
  onArchive,
  onDelete,
}: {
  set: StudySet
  due: number
  newCards: number
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}): ReactElement {
  // `archivedAt` is a timestamp, not a flag — archive is reversible and the API
  // records *when*, so the button label is derived rather than read off a boolean.
  const isArchived = set.archivedAt !== null
  const studiable = !isArchived && due + newCards > 0
  const children = childCountLabel(set)

  return (
    <Card
      as="li"
      interactive
      className={cn(
        // `relative` anchors the stretched title link below. `flex flex-col` plus
        // `mt-auto` on the footer keeps every footer in a grid row on one line —
        // tiles of different title lengths otherwise stagger their controls.
        'relative flex flex-col p-5 pb-2',
        // The colour stripe survives the move off bordered cards: it is the only
        // per-set identifier, and eight background tints would be eight contrast
        // problems in two themes (see ./colors).
        'border-l-4',
        setAccentClass(set.color),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold leading-snug tracking-tight">
          {/*
            The title's link is stretched over the whole tile with an `::after`
            overlay, so the card behaves like the single object it looks like
            rather than a bar with a small text target in one corner. Everything
            that must stay clickable through it is `relative` — the pill below
            and the footer — which puts them above an overlay that has no z-index
            of its own.
          */}
          <Link to={`/sets/${set.id}`} className="rounded after:absolute after:inset-0">
            {set.title}
          </Link>
        </h3>

        {/*
          The count *is* the button. A "Study 12" control under a "12 due" badge
          is the same number printed twice and a second thing to aim at.

          `accent` despite the badge note reserving it for one pill per group:
          across a grid this is exactly what makes the pill worth having. Most
          sets are caught up or empty and render none, so the clay pills are the
          page's map of where the work is rather than a decoration every tile
          gets. Archived sets show their state instead — the queue skips them, so
          a study link would open on "nothing due".
        */}
        {isArchived ? (
          <Badge className="relative shrink-0">Archived</Badge>
        ) : studiable ? (
          <Link
            to={`/study?set=${set.id}`}
            className={buttonClass({
              variant: 'accent',
              // `md`, not `sm`: this is the tile's primary control and `sm` is
              // 36px tall, under the 44px touch minimum (saulado-ux §7).
              className: 'relative shrink-0 px-4',
            })}
          >
            {due > 0 ? 'Study' : 'Learn'}
            <span className="tabular-nums">{due > 0 ? due : newCards}</span>
          </Link>
        ) : null}
      </div>

      {/*
        Where the description used to be. The counts say something the user
        cannot see from the title — including how many cards live in sub-sets,
        which is what studying this set will actually sweep in. Joined on one
        line rather than split across two badges, matching the child rows on the
        set page.
      */}
      <p className="mb-4 mt-1 text-sm tabular-nums text-muted-foreground">
        {cardCountLabel(set)}
        {children !== null && ` · ${children}`}
      </p>

      {/*
        Management, not study. Held below a hairline and in `ghost` so the tile
        reads title → count → the one pill, instead of four controls of equal
        weight. `h-11` restores the 44px touch target `sm` gives up (saulado-ux §7).
      */}
      <div className="relative -mx-5 mt-auto flex items-center gap-1 border-t border-border/60 px-2 pt-1">
        <Button variant="ghost" size="sm" className="h-11 px-3" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="h-11 px-3" onClick={onArchive}>
          {isArchived ? 'Restore' : 'Archive'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-11 px-3 text-danger"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </Card>
  )
}

/**
 * What deleting a set actually takes.
 *
 * Nesting made this the one genuinely destructive edge in the library: the
 * `parent_id` FK cascades, so deleting a subject removes every topic under it
 * and every card in those. `childCount` is *direct* children only, which is why
 * the copy says "everything inside them" rather than naming a number that would
 * undercount a three-level tree.
 *
 * The card figure is `subtreeCardCount`, not `cardCount` — the total being
 * destroyed, not the subset that happens to sit at this level.
 */
function deleteWarning(set: StudySet): string {
  const cards = `${String(set.subtreeCardCount)} ${set.subtreeCardCount === 1 ? 'card' : 'cards'}`
  const tail = 'This cannot be undone — archive it instead if you only want it out of the way.'

  if (set.childCount === 0) return `“${set.title}” and its ${cards} will be removed. ${tail}`

  const children = `${String(set.childCount)} ${set.childCount === 1 ? 'sub-set' : 'sub-sets'}`

  return `“${set.title}”, its ${children} and everything inside them — ${cards} in total — will be removed. ${tail}`
}

export function SetsPage(): ReactElement {
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState<StudySet | null>(null)
  const [deleting, setDeleting] = useState<StudySet | null>(null)

  const sets = useSets({ archived })
  const create = useCreateSet()
  const update = useUpdateSet()
  const remove = useDeleteSet()
  const due = useDueCounts()

  const items = flattenPages(sets.data)
  // A set absent from `counts` has nothing waiting — the endpoint only returns
  // rows with something due or new, so a missing set is a zero, not unknown.
  const counts = new Map(due.data?.counts.map((entry) => [entry.studySetId, entry]))

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

      {/*
        Styled as a segmented control but still two `aria-pressed` buttons. The
        pair is a filter over two different result sets rather than one value
        with two options, and swapping working toggle semantics for radio
        semantics purely to reuse a component would be a downgrade.
      */}
      <div className="inline-flex gap-1 rounded-full bg-surface-muted p-1">
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

      {sets.isPending ? (
        // Shaped like the tiles it stands in for, down to the grid and the
        // footer rule, so nothing shifts when the real list arrives (saulado-ux §5).
        <ul className={GRID} aria-busy="true">
          {[0, 1, 2].map((key) => (
            <Card as="li" key={key} className="border-l-4 border-l-border p-5 pb-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mb-4 mt-2 h-4 w-28" />
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
      ) : items.length === 0 ? (
        <Card tone="dashed" className="p-8 text-center">
          <p className="font-medium">{archived ? 'Nothing archived' : 'No sets yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {archived
              ? 'Sets you archive stay here until you restore or delete them.'
              : 'Start with one paragraph of your notes. Highlight the words worth recalling and Saulado keeps the sentence around them.'}
          </p>
          {!archived && (
            <Button
              className="mt-5"
              onClick={() => {
                setCreating(true)
              }}
            >
              <PlusIcon />
              Create your first set
            </Button>
          )}
        </Card>
      ) : (
        <>
          <ul className={GRID}>
            {items.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                due={counts.get(set.id)?.due ?? 0}
                newCards={counts.get(set.id)?.newCards ?? 0}
                onEdit={() => {
                  setEditing(set)
                }}
                onArchive={() => {
                  update.mutate({ id: set.id, body: { archived: set.archivedAt === null } })
                }}
                onDelete={() => {
                  setDeleting(set)
                }}
              />
            ))}
          </ul>

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

      {/*
        Keyed by set id: without it, editing one set and then another reuses the
        mounted form and shows the first set's title.
      */}
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
    </div>
  )
}

import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { StudySet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { segmentClass } from '@/components/ui/segmented'
import { PlusIcon } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDueCounts } from '@/features/study/queries'
import { cn } from '@/lib/utils'
import { setAccentClass } from './colors'
import { SetDialog } from './SetDialog'
import { flattenPages, useCreateSet, useDeleteSet, useSets, useUpdateSet } from './queries'

/**
 * The library — every set the user owns.
 *
 * Archived sets are behind a toggle rather than mixed in with a badge: archiving
 * exists to get a set out of the way, and a list that still shows it has not done
 * the one thing it was asked to do.
 */

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

  return (
    <Card
      as="li"
      className={cn(
        'flex flex-col gap-3 border-l-4 p-5',
        // The colour stripe survives the move off bordered cards: it is the only
        // per-set identifier, and eight background tints would be eight contrast
        // problems in two themes (see ./colors).
        setAccentClass(set.color),
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium">
            {/*
              The whole title is the link, not a separate "Open" button — the
              title is what the user is reaching for, and a 44px row of text is
              already a better touch target than an icon beside it.
            */}
            <Link
              to={`/sets/${set.id}`}
              className="rounded hover:underline focus-visible:underline"
            >
              {set.title}
            </Link>
          </h3>
          {set.description && (
            <p className="mt-1 text-sm text-muted-foreground">{set.description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isArchived && <Badge>Archived</Badge>}
          <p className="text-sm tabular-nums text-muted-foreground">
            {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/*
          Study leads, and only appears when there is something to study — a
          "Study (0)" button teaches the user that the button lies. Archived sets
          never get one: the queue skips them, so it would open on "nothing due".
        */}
        {studiable && (
          <Link className={buttonClass({ size: 'sm' })} to={`/study?set=${set.id}`}>
            Study{' '}
            <span className="tabular-nums opacity-80">
              {due > 0 ? due : `${String(newCards)} new`}
            </span>
          </Link>
        )}
        <Button variant="soft" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onArchive}>
          {isArchived ? 'Restore' : 'Archive'}
        </Button>
        <Button variant="ghost" size="sm" className="text-danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  )
}

export function SetsPage(): ReactElement {
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
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
        description="A set groups cards on one subject."
        actions={
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <PlusIcon />
            New set
          </Button>
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
        // Shaped like the cards it stands in for, so nothing shifts when the real
        // list arrives (saulado-ux §5).
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <Card as="li" key={key} className="p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-4 w-72" />
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
          <ul className="space-y-3">
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
        description={
          deleting
            ? `“${deleting.title}” and its ${String(deleting.cardCount)} ${
                deleting.cardCount === 1 ? 'card' : 'cards'
              } will be removed. This cannot be undone — archive it instead if you only want it out of the way.`
            : ''
        }
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
    </div>
  )
}

import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { StudySet } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
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
  onEdit,
  onArchive,
  onDelete,
}: {
  set: StudySet
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}): ReactElement {
  // `archivedAt` is a timestamp, not a flag — archive is reversible and the API
  // records *when*, so the button label is derived rather than read off a boolean.
  const isArchived = set.archivedAt !== null

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-l-4 border-border bg-background p-4',
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

        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onArchive}>
          {isArchived ? 'Restore' : 'Archive'}
        </Button>
        <Button variant="ghost" size="sm" className="text-warning" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
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

  const items = flattenPages(sets.data)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your sets</h1>
          <p className="mt-1 text-sm text-muted-foreground">A set groups cards on one subject.</p>
        </div>

        <Button
          onClick={() => {
            setCreating(true)
          }}
        >
          New set
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <Button
          variant={archived ? 'ghost' : 'outline'}
          size="sm"
          aria-pressed={!archived}
          onClick={() => {
            setArchived(false)
          }}
        >
          Active
        </Button>
        <Button
          variant={archived ? 'outline' : 'ghost'}
          size="sm"
          aria-pressed={archived}
          onClick={() => {
            setArchived(true)
          }}
        >
          Archived
        </Button>
      </div>

      {sets.isPending ? (
        // Shaped like the cards it stands in for, so nothing shifts when the real
        // list arrives (saulado-ux §5).
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <li key={key} className="rounded-lg border border-border p-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-4 w-72" />
            </li>
          ))}
        </ul>
      ) : sets.isError ? (
        <div role="alert" className="rounded-lg border border-warning p-5">
          <p className="text-sm">Could not load your sets.</p>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            onClick={() => {
              void sets.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">{archived ? 'Nothing archived' : 'No sets yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {archived
              ? 'Sets you archive stay here until you restore or delete them.'
              : 'Start with one paragraph of your notes. Highlight the words worth recalling and Saulado keeps the sentence around them.'}
          </p>
          {!archived && (
            <Button
              className="mt-4"
              onClick={() => {
                setCreating(true)
              }}
            >
              Create your first set
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((set) => (
              <SetCard
                key={set.id}
                set={set}
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
              variant="outline"
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

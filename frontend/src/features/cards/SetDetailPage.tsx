import { useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { StudyCardSummary } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { SetDialog } from './SetDialog'
import { flattenPages, useCards, useDeleteCard, useSet, useTags, useUpdateSet } from './queries'

/**
 * One set and the cards in it.
 *
 * The rows show the paragraph rather than the blanked form. A list is for finding
 * a card, and every blanked row starts "The ____ is…" — the words the cloze
 * removes are exactly the ones that would tell them apart.
 */

function CardRow({
  card,
  onDelete,
}: {
  card: StudyCardSummary
  onDelete: () => void
}): ReactElement {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium">
          <Link
            to={`/cards/${card.id}`}
            className="rounded hover:underline focus-visible:underline"
          >
            {card.title}
          </Link>
        </h3>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {card.answerCount} {card.answerCount === 1 ? 'blank' : 'blanks'}
        </p>
      </div>

      {/*
        Clamped rather than truncated in JS: a slice at 140 characters cuts
        mid-word and mid-grapheme, and the browser already knows where the line
        ends at this width.
      */}
      <p className="line-clamp-2 text-sm text-muted-foreground">{card.paragraph}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-1.5">
          {card.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {tag}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="text-warning" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  )
}

export function SetDetailPage(): ReactElement {
  const { setId } = useParams<{ setId: string }>()
  const [tags, setTags] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<StudyCardSummary | null>(null)

  const set = useSet(setId)
  const cards = useCards(setId, tags)
  const allTags = useTags()
  const update = useUpdateSet()
  const remove = useDeleteCard(setId ?? '')

  const items = flattenPages(cards.data)
  const filtering = tags.length > 0
  // Pulled out of `set.data` once: TypeScript drops narrowing on a property access
  // inside a callback, so `set.data.set.id` in the dialog's async `onSubmit` would
  // not compile even directly under a `set.data &&` guard.
  const current = set.data?.set

  const toggleTag = (tag: string): void => {
    setTags((selected) =>
      selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag],
    )
  }

  if (set.isError) {
    return (
      <div role="alert" className="rounded-lg border border-warning p-5">
        <p className="text-sm">That set could not be loaded. It may have been deleted.</p>
        <Link
          className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-3' })}
          to="/sets"
        >
          Back to your sets
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {current ? (
            <h1 className="text-2xl font-semibold tracking-tight">{current.title}</h1>
          ) : (
            <Skeleton className="h-8 w-56" />
          )}
          {current?.description && (
            <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            disabled={current === undefined}
            onClick={() => {
              setEditing(true)
            }}
          >
            Edit set
          </Button>
          <Link className={buttonClass()} to={`/sets/${setId ?? ''}/cards/new`}>
            New card
          </Link>
        </div>
      </header>
      {allTags.data && allTags.data.tags.length > 0 && (
        <div className="space-y-1.5">
          <p id="tag-filter-label" className="text-sm font-medium">
            Filter by tag
          </p>
          {/*
            `group` + `aria-pressed` rather than checkboxes: these are toggles
            that filter immediately, and a checkbox implies a form to submit.
          */}
          <div
            role="group"
            aria-labelledby="tag-filter-label"
            className="flex flex-wrap items-center gap-1.5"
          >
            {allTags.data.tags.map(({ tag, count }) => {
              const active = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    toggleTag(tag)
                  }}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-border text-foreground',
                  )}
                >
                  {tag} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              )
            })}

            {filtering && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTags([])
                }}
              >
                Clear
              </Button>
            )}
          </div>
          {/*
            Says "all of", because the API matches with `hasEvery` — two chips
            narrow the list rather than widening it, which is the opposite of what
            most filter bars do and worth stating outright.
          */}
          {tags.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Showing cards with all of: {tags.join(', ')}.
            </p>
          )}
        </div>
      )}

      {cards.isPending ? (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <li key={key} className="rounded-lg border border-border p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1.5 h-4 w-2/3" />
            </li>
          ))}
        </ul>
      ) : cards.isError ? (
        <div role="alert" className="rounded-lg border border-warning p-5">
          <p className="text-sm">Could not load the cards in this set.</p>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            onClick={() => {
              void cards.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">{filtering ? 'No matching cards' : 'No cards yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {filtering
              ? 'No card in this set carries every tag you picked.'
              : 'Paste a paragraph, highlight the words worth recalling, and Saulado keeps the sentence around them.'}
          </p>
          {/* Clearing the filter is the fix when filtering; creating one is not. */}
          {filtering ? (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setTags([])
              }}
            >
              Clear filter
            </Button>
          ) : (
            <Link
              className={buttonClass({ className: 'mt-4' })}
              to={`/sets/${setId ?? ''}/cards/new`}
            >
              Add your first card
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onDelete={() => {
                  setDeleting(card)
                }}
              />
            ))}
          </ul>

          {cards.hasNextPage && (
            <Button
              variant="outline"
              disabled={cards.isFetchingNextPage}
              onClick={() => {
                void cards.fetchNextPage()
              }}
            >
              {cards.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}

      {editing && current && (
        <SetDialog
          open
          set={current}
          onClose={() => {
            setEditing(false)
          }}
          pending={update.isPending}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: current.id, body: values })
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null)
        }}
        pending={remove.isPending}
        title="Delete this card?"
        description={
          deleting
            ? `“${deleting.title}” and its ${String(deleting.answerCount)} ${
                deleting.answerCount === 1 ? 'blank' : 'blanks'
              } will be removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete card"
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

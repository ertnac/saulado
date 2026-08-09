import { lazy, Suspense, useState, type ReactElement, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { cardLabel, type AnswerRange, type StudyCardSummary, type StudySet } from '@saulado/shared'
import { Button, buttonClass } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRightIcon, ImageIcon, PlusIcon } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDueCounts } from '@/features/study/queries'
import { cn } from '@/lib/utils'
import { CardComposer } from './CardComposer'
import { setAccentClass } from './colors'
import { cardCountLabel, childCountLabel } from './counts'
import { CARD_PARAM } from './links'
import { SetDialog } from './SetDialog'
import {
  flattenPages,
  useCards,
  useCreateSet,
  useDeleteCard,
  useSet,
  useSets,
  useTags,
  useUpdateSet,
} from './queries'

/**
 * One set: what is inside it, and where you write more.
 *
 * This page absorbed two routes. Cards used to be created at
 * `/sets/:setId/cards/new` and edited at `/cards/:cardId`, so writing three
 * cards meant three page transitions away from the set you were reading —
 * away from the cards you were writing *against*. Both are now a
 * `CardComposer` mounted here, the new-card one above the list and the edit
 * one inside the row it belongs to.
 *
 * **Only one composer is mounted at a time**, which is why `composing` is a
 * single value rather than a flag per row: `HighlightEditor` labels its
 * textarea with a fixed `id`, and two of them would be two elements sharing it.
 *
 * The rows print `cardLabel(paragraph)`. Cards have no title any more, and the
 * paragraph is not repeated underneath the label — they would be the same
 * opening sentence twice.
 */

/**
 * Which composer is open. `null` collapses both.
 *
 * `inRow` says *where* an edit composer renders. A row's Edit button expands it
 * in place among the cards; a `?card=` deep link from search opens one before
 * the list has necessarily loaded — and possibly for a card on page three,
 * whose row is not mounted at all — so that one renders at the top instead. One
 * flag rather than "render in the row if it exists, else at the top", which
 * would move the editor out from under the user the moment the page it was on
 * arrived.
 */
type Composing = { kind: 'new' } | { kind: 'edit'; cardId: string; inRow: boolean } | null

/**
 * Lazy, and this is the only import of `ImportDialog` anywhere.
 *
 * That dialog reaches `tesseract.js` and its several megabytes of WASM and
 * English training data. Imported statically it would join this route's chunk
 * and be fetched by every user who opens a set, including the ones who never
 * import an image.
 */
const ImportDialog = lazy(async () => ({
  default: (await import('./ImportDialog')).ImportDialog,
}))

/**
 * Questions waiting to become cards, and which one is on screen.
 *
 * Two fields of state on this page rather than a hook: there is one consumer,
 * and a file wrapping two fields is a file to open before the feature can be
 * read.
 *
 * Each question carries the blanks the user placed in the import dialog. They
 * are offsets into that question's own `text`, so the pair travels together and
 * is never recombined with another paragraph.
 */
interface Queue {
  questions: { text: string; answers: AnswerRange[] }[]
  index: number
}

/** Decorative: the ordered list already conveys the nesting to a screen reader. */
function Crumb(): ReactElement {
  return <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 opacity-50" />
}

/**
 * The trail back up the tree.
 *
 * A fixed pair of `useSet` calls rather than a loop, because `SET_DEPTH_MAX` is
 * 3 — a set has at most two ancestors, and hooks cannot be called a variable
 * number of times.
 *
 * The ancestors are rendered all-or-nothing behind one placeholder. The
 * grandparent's id only arrives *with* the parent, so filling them in as they
 * land would draw a two-level trail and then grow a third level into the middle
 * of it. A breadcrumb whose shape changes under the pointer is worse than one
 * that is visibly still loading.
 */
function Breadcrumb({ set }: { set: StudySet }): ReactElement {
  const parent = useSet(set.parentId ?? undefined)
  const grandparentId = parent.data?.set.parentId ?? undefined
  const grandparent = useSet(grandparentId)

  // An ancestor that failed to load counts as settled, not as pending — the
  // trail drops it and still gets the user home, where waiting forever on a
  // request that already failed would not.
  const waiting =
    (set.parentId !== null && parent.data === undefined && !parent.isError) ||
    (grandparentId !== undefined && grandparent.data === undefined && !grandparent.isError)

  const ancestors = [grandparent.data?.set, parent.data?.set].filter(
    (entry): entry is StudySet => entry !== undefined,
  )

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link to="/sets" className="rounded transition-colors hover:text-foreground">
            Your sets
          </Link>
        </li>

        {waiting ? (
          <li className="flex items-center gap-1.5">
            <Crumb />
            <Skeleton className="h-4 w-20" />
          </li>
        ) : (
          ancestors.map((ancestor) => (
            <li key={ancestor.id} className="flex min-w-0 items-center gap-1.5">
              <Crumb />
              <Link
                to={`/sets/${ancestor.id}`}
                className="truncate rounded transition-colors hover:text-foreground"
              >
                {ancestor.title}
              </Link>
            </li>
          ))
        )}

        <li className="flex min-w-0 items-center gap-1.5">
          <Crumb />
          {/* Text, not a link to the page you are already on. */}
          <span aria-current="page" className="truncate font-medium text-foreground">
            {set.title}
          </span>
        </li>
      </ol>
    </nav>
  )
}

/** A set nested inside this one. The whole row navigates into it. */
function ChildSetRow({ set }: { set: StudySet }): ReactElement {
  const children = childCountLabel(set)

  return (
    // The padding lives on the link, not the card, so the tap target fills the
    // row instead of sitting in the middle of it.
    <Card as="li" interactive className={cn('border-l-4', setAccentClass(set.color))}>
      <Link
        to={`/sets/${set.id}`}
        className="flex items-center justify-between gap-3 rounded-lg p-4"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{set.title}</span>
          <span className="mt-0.5 block text-sm tabular-nums text-muted-foreground">
            {cardCountLabel(set)}
            {children !== null && ` · ${children}`}
          </span>
        </span>
        <ChevronRightIcon className="shrink-0 text-muted-foreground" />
      </Link>
    </Card>
  )
}

/**
 * A card, as a row.
 *
 * When this row is the one being edited it hands its `<li>` over to the
 * composer entirely, rather than showing the summary above an editor of the
 * same paragraph. The list markup stays valid either way, which is why the
 * `<li>` is here and not inside each branch.
 */
function CardRow({
  card,
  composer,
  onEdit,
  onDelete,
}: {
  card: StudyCardSummary
  /** Rendered in place of the row while this card is open for editing. */
  composer?: ReactNode
  onEdit: () => void
  onDelete: () => void
}): ReactElement {
  if (composer) return <li>{composer}</li>

  return (
    <Card as="li" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium">{cardLabel(card.paragraph)}</h3>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {card.answerCount} {card.answerCount === 1 ? 'blank' : 'blanks'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-1.5">
          {card.tags.map((tag) => (
            <li key={tag}>
              <Badge tone="sand">{tag}</Badge>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * This set's own study affordance.
 *
 * Shown even at zero, unlike the badge in the library — this page is where the
 * user came *to* study one set, and a button that vanishes leaves them with no
 * way in and no explanation. Disabled with the reason instead.
 *
 * The count is the set's **subtree**: `/api/study/due` rolls a parent's badge up
 * over its descendants, matching what pressing this will actually serve.
 */
function StudyAction({ setId }: { setId: string }): ReactElement {
  const due = useDueCounts()

  if (due.isPending) return <Skeleton className="h-11 w-24" />

  const entry = due.data?.counts.find((count) => count.studySetId === setId)
  const waiting = (entry?.due ?? 0) + (entry?.newCards ?? 0)

  if (waiting === 0) {
    return (
      <Button disabled title="Nothing in this set is due today.">
        Study
      </Button>
    )
  }

  return (
    <Link className={buttonClass()} to={`/study?set=${setId}`}>
      Study <span className="tabular-nums opacity-80">{waiting}</span>
    </Link>
  )
}

/**
 * Narrows the route param once.
 *
 * `/sets/:setId` cannot match without it, but typed as `string | undefined` it
 * would need a `?? ''` at every hook below — and `useSets({ parent: undefined })`
 * does not mean "wait", it means *the root sets*, so that fallback would quietly
 * list the library as this set's children.
 */
export function SetDetailPage(): ReactElement {
  const { setId } = useParams<{ setId: string }>()

  if (setId === undefined) return <Navigate to="/sets" replace />

  return <SetDetail setId={setId} />
}

function SetDetail({ setId }: { setId: string }): ReactElement {
  const [params, setParams] = useSearchParams()
  // Read once, on the first render, so closing the composer does not fight a
  // param that is still in the URL.
  const linked = useState(() => params.get(CARD_PARAM))[0]

  const [tags, setTags] = useState<string[]>([])
  const [composing, setComposing] = useState<Composing>(
    linked === null ? null : { kind: 'edit', cardId: linked, inRow: false },
  )
  const [editingSet, setEditingSet] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [deleting, setDeleting] = useState<StudyCardSummary | null>(null)
  const [importing, setImporting] = useState(false)
  const [queue, setQueue] = useState<Queue | null>(null)

  const set = useSet(setId)
  const children = useSets({ parent: setId })
  const cards = useCards(setId, tags)
  const allTags = useTags()
  const createSet = useCreateSet()
  const update = useUpdateSet()
  const remove = useDeleteCard(setId)

  const items = flattenPages(cards.data)
  const childSets = flattenPages(children.data)
  const filtering = tags.length > 0
  // Pulled out of `set.data` once: TypeScript drops narrowing on a property
  // access inside a callback, so `set.data.set.id` in the dialog's async
  // `onSubmit` would not compile even directly under a `set.data &&` guard.
  const current = set.data?.set

  const toggleTag = (tag: string): void => {
    setTags((selected) =>
      selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag],
    )
  }

  /**
   * Closes whichever composer is open, and drops `?card=` with it.
   *
   * `replace` so Back returns to wherever the user came from — search, usually —
   * rather than to this same page with the card open again, which reads as the
   * button having done nothing.
   */
  const closeComposer = (): void => {
    setComposing(null)
    // An open import ends with the composer that was working through it, and
    // "Stop importing" is the same button as Done.
    setQueue(null)

    if (params.has(CARD_PARAM)) {
      const next = new URLSearchParams(params)
      next.delete(CARD_PARAM)
      setParams(next, { replace: true })
    }
  }

  /**
   * Moves to the next imported question, or ends the import on the last.
   *
   * Saved and skipped land here alike: either way this question is done with.
   * Falling back to the ordinary empty composer rather than collapsing, so the
   * user who has just made three cards can write a fourth without hunting for
   * the button again.
   */
  const advance = (): void => {
    if (queue === null) return

    const next = queue.index + 1
    if (next < queue.questions.length) {
      setQueue({ ...queue, index: next })
      return
    }

    setQueue(null)
    setComposing({ kind: 'new' })
  }

  if (set.isError) {
    return (
      <Card role="alert" tone="danger" className="p-5">
        <p className="text-sm">That set could not be loaded. It may have been deleted.</p>
        <Link
          className={buttonClass({ variant: 'soft', size: 'sm', className: 'mt-3' })}
          to="/sets"
        >
          Back to your sets
        </Link>
      </Card>
    )
  }

  const childLabel = current ? childCountLabel(current) : null

  return (
    <div className="space-y-6">
      {current ? <Breadcrumb set={current} /> : <Skeleton className="h-4 w-48" />}

      {current ? (
        <PageHeader
          className="mb-0"
          title={current.title}
          badge={
            <>
              <Badge>{cardCountLabel(current)}</Badge>
              {childLabel !== null && <Badge tone="sand">{childLabel}</Badge>}
            </>
          }
          actions={
            <>
              <Button
                variant="soft"
                onClick={() => {
                  setEditingSet(true)
                }}
              >
                Edit set
              </Button>
              <StudyAction setId={setId} />
            </>
          }
        />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-11 w-24" />
        </div>
      )}

      {/*
        The composer sits above the list, not below it, and collapses to one
        line when closed. Above because writing a card is what this page is for
        — burying the box under fifty rows would put the app's primary action
        behind a scroll — and collapsed because an editor permanently open on a
        set the user came to read is a large empty box demanding attention.
      */}
      {queue ? (
        /*
          Keyed by the queue position, so advancing remounts the draft. Without
          the key, `useCardDraft`'s initializers would not run again and card N's
          highlights would sit on top of card N+1's paragraph.
        */
        <CardComposer
          key={`import:${String(queue.index)}`}
          setId={setId}
          onClose={closeComposer}
          importQueue={{
            paragraph: queue.questions[queue.index]?.text ?? '',
            answers: queue.questions[queue.index]?.answers ?? [],
            index: queue.index,
            total: queue.questions.length,
            onAdvance: advance,
          }}
        />
      ) : composing?.kind === 'new' ? (
        <CardComposer setId={setId} onClose={closeComposer} />
      ) : composing?.kind === 'edit' && !composing.inRow ? (
        <CardComposer setId={setId} cardId={composing.cardId} onClose={closeComposer} />
      ) : (
        <Card tone="dashed" className="flex flex-wrap items-center gap-1.5 p-1.5">
          <button
            type="button"
            onClick={() => {
              setComposing({ kind: 'new' })
            }}
            className={cn(
              'flex min-h-[52px] flex-1 items-center gap-2 rounded-md px-3.5 text-left',
              'text-muted-foreground transition-colors duration-150',
              'hover:bg-surface-muted hover:text-foreground',
            )}
          >
            <PlusIcon />
            Write a card in this set
          </button>
          {/*
            Beside the writing affordance rather than in the header: it is the
            same action — get a paragraph into a card — reached a different way,
            and a user looking for one will look here for the other.
          */}
          <button
            type="button"
            onClick={() => {
              setImporting(true)
            }}
            className={cn(
              'flex min-h-[52px] items-center gap-2 rounded-md px-3.5 text-left',
              'text-muted-foreground transition-colors duration-150',
              'hover:bg-surface-muted hover:text-foreground',
            )}
          >
            <ImageIcon />
            Import from an image
          </button>
        </Card>
      )}

      {/*
        Mounted only while open, so the chunk is fetched on the click rather than
        with the route. No fallback: the dialog's own idle state is the first
        thing the user sees, and a skeleton behind a modal that has not painted
        yet would be a flash of layout nobody can read.
      */}
      {importing && (
        <Suspense fallback={null}>
          <ImportDialog
            open
            onClose={() => {
              setImporting(false)
            }}
            onImport={(questions) => {
              setImporting(false)
              setComposing(null)
              setQueue({ questions, index: 0 })
            }}
          />
        </Suspense>
      )}

      {/*
        The sub-set affordance shrinks to a single button when there are none.
        Nesting is new and worth advertising, but a permanent empty "Sub-sets"
        heading on every leaf set is chrome on the common case.
      */}
      {childSets.length > 0 ? (
        <section aria-labelledby="sub-sets-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sub-sets-heading" className="text-lg font-semibold tracking-tight">
              Sub-sets
            </h2>
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                setAddingChild(true)
              }}
            >
              <PlusIcon />
              New sub-set
            </Button>
          </div>

          <ul className="space-y-2">
            {childSets.map((child) => (
              <ChildSetRow key={child.id} set={child} />
            ))}
          </ul>

          {children.hasNextPage && (
            <Button
              variant="soft"
              size="sm"
              disabled={children.isFetchingNextPage}
              onClick={() => {
                void children.fetchNextPage()
              }}
            >
              {children.isFetchingNextPage ? 'Loading…' : 'Load more sub-sets'}
            </Button>
          )}
        </section>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAddingChild(true)
          }}
        >
          <PlusIcon />
          New sub-set
        </Button>
      )}

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
                    'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-sm font-medium',
                    'transition-[background-color,color,box-shadow] duration-150',
                    active
                      ? 'bg-primary text-primary-foreground shadow-soft'
                      : 'bg-surface-muted text-muted-foreground hover:text-foreground',
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
            narrow the list rather than widening it, which is the opposite of
            what most filter bars do and worth stating outright.
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
            <Card as="li" key={key} className="p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1.5 h-4 w-2/3" />
            </Card>
          ))}
        </ul>
      ) : cards.isError ? (
        <Card role="alert" tone="danger" className="p-5">
          <p className="text-sm">Could not load the cards in this set.</p>
          <Button
            className="mt-3"
            variant="soft"
            size="sm"
            onClick={() => {
              void cards.refetch()
            }}
          >
            Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card tone="dashed" className="p-8 text-center">
          <p className="font-medium">{filtering ? 'No matching cards' : 'No cards yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {filtering
              ? 'No card in this set carries every tag you picked.'
              : 'Paste a paragraph, highlight the words worth recalling, and Saulado keeps the sentence around them.'}
          </p>
          {/*
            Clearing the filter is the fix when filtering; creating a card is
            not. The prompt to write one is dropped once the composer is already
            open above — it would be a button pointing at a box on screen.
          */}
          {filtering ? (
            <Button
              className="mt-5"
              variant="soft"
              onClick={() => {
                setTags([])
              }}
            >
              Clear filter
            </Button>
          ) : (
            composing === null &&
            queue === null && (
              <Button
                className="mt-5"
                onClick={() => {
                  setComposing({ kind: 'new' })
                }}
              >
                <PlusIcon />
                Add your first card
              </Button>
            )
          )}
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                composer={
                  composing?.kind === 'edit' && composing.inRow && composing.cardId === card.id ? (
                    <CardComposer setId={setId} cardId={card.id} onClose={closeComposer} />
                  ) : undefined
                }
                onEdit={() => {
                  // Ends a running import. Only one composer may be mounted at
                  // a time — see this file's header — and editing an existing
                  // card is a deliberate move away from the queue. The paragraphs
                  // left in it are re-readable from the image; a second textarea
                  // sharing `card-paragraph` is not recoverable at all.
                  setQueue(null)
                  setComposing({ kind: 'edit', cardId: card.id, inRow: true })
                }}
                onDelete={() => {
                  setDeleting(card)
                }}
              />
            ))}
          </ul>

          {cards.hasNextPage && (
            <Button
              variant="soft"
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

      {editingSet && current && (
        <SetDialog
          open
          set={current}
          onClose={() => {
            setEditingSet(false)
          }}
          pending={update.isPending}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: current.id, body: values })
          }}
        />
      )}

      {/*
        `parentId` is this set, so the dialog never asks where the sub-set goes —
        you are standing in the answer. The depth cap is enforced server-side and
        comes back as a field error the dialog surfaces.
      */}
      {addingChild && (
        <SetDialog
          open
          parentId={setId}
          onClose={() => {
            setAddingChild(false)
          }}
          pending={createSet.isPending}
          onSubmit={async (values) => {
            await createSet.mutateAsync(values)
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
            ? `“${cardLabel(deleting.paragraph)}” and its ${String(deleting.answerCount)} ${
                deleting.answerCount === 1 ? 'blank' : 'blanks'
              } will be removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete card"
        onConfirm={() => {
          if (!deleting) return
          // The row unmounts with its composer, but the state pointing at it
          // would outlive the card — cleared here so nothing holds the id of
          // something that no longer exists.
          if (composing?.kind === 'edit' && composing.cardId === deleting.id) closeComposer()

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

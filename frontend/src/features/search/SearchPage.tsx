import { useMemo, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DUE_STATES, type DueState, type SearchFilters, type SearchResponse } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, fieldChipClass } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useTags } from '@/features/cards/queries'
import { cardHref } from '@/features/cards/links'
import { Snippet } from './CommandPalette'
import { isSearchable, useSearch } from './queries'

/**
 * Full search, with filters (plan §6.1–6.2).
 *
 * The palette handles "I know what I'm looking for". This page handles "show me
 * what I have" — set, tags, date range, due state, and a sort. Every filter lives
 * in the URL rather than in component state, so a filtered view is a link: it
 * survives reload, back-navigation and being sent to yourself.
 */

const PAGE_SIZE = 20

const DUE_LABELS: Record<DueState, string> = {
  new: 'Never studied',
  due: 'Due now',
  later: 'Scheduled',
}

export function SearchPage(): ReactElement {
  const [params, setParams] = useSearchParams()

  // `text` is local so typing is instant; the URL only takes the debounced
  // value, because writing a history entry per keystroke makes the back button
  // useless.
  const [text, setText] = useState(params.get('q') ?? '')
  const debounced = useDebouncedValue(text, 300)

  const filters = useMemo((): SearchFilters => {
    const tags = params.getAll('tags')
    const due = params.get('due')
    const sort = params.get('sort')

    return {
      q: debounced.trim(),
      ...(params.get('setId') ? { setId: params.get('setId') as string } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(params.get('createdFrom') ? { createdFrom: params.get('createdFrom') as string } : {}),
      ...(params.get('createdTo') ? { createdTo: params.get('createdTo') as string } : {}),
      ...(due && DUE_STATES.includes(due as DueState) ? { due: due as DueState } : {}),
      ...(sort === 'relevance' || sort === 'recent' ? { sort } : {}),
      limit: PAGE_SIZE,
      offset: Number.parseInt(params.get('offset') ?? '0', 10) || 0,
    }
  }, [params, debounced])

  const { data, isFetching, isPlaceholderData } = useSearch(filters)
  const { data: tagData } = useTags()

  /**
   * Writes one filter and resets the page.
   *
   * Resetting `offset` is not optional: page 3 of a narrower filter usually does
   * not exist, and landing on an empty page after adding a tag reads as "no
   * results" when there are plenty on page 1.
   */
  function setFilter(key: string, value: string | string[] | null): void {
    const next = new URLSearchParams(params)
    next.delete(key)
    next.delete('offset')

    if (Array.isArray(value)) for (const item of value) next.append(key, item)
    else if (value) next.set(key, value)

    setParams(next, { replace: true })
  }

  function toggleTag(tag: string): void {
    const current = params.getAll('tags')
    setFilter('tags', current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag])
  }

  function goToOffset(offset: number): void {
    const next = new URLSearchParams(params)
    if (offset > 0) next.set('offset', String(offset))
    else next.delete('offset')
    setParams(next, { replace: false })
    window.scrollTo({ top: 0 })
  }

  const activeTags = params.getAll('tags')
  const offset = filters.offset ?? 0
  const total = data?.total ?? 0
  const hits = data?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description={
          <>
            Across every set, archived ones included. Press{' '}
            <kbd className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium">
              Ctrl K
            </kbd>{' '}
            anywhere for a quick jump.
          </>
        }
        className="mb-0"
      />

      <div className="space-y-4">
        {/*
          The icon sits in the padding rather than inside the field, so the
          input keeps its own accessible name and the glyph stays decorative.
        */}
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            <SearchIcon />
          </span>
          <Input
            type="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              const next = new URLSearchParams(params)
              next.delete('offset')
              if (event.target.value.trim()) next.set('q', event.target.value)
              else next.delete('q')
              setParams(next, { replace: true })
            }}
            placeholder="Search titles and paragraphs…"
            aria-label="Search text"
            className="pl-11"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={params.get('due') ?? ''}
            onChange={(event) => {
              setFilter('due', event.target.value || null)
            }}
            aria-label="Filter by review state"
          >
            <option value="">Any state</option>
            {DUE_STATES.map((state) => (
              <option key={state} value={state}>
                {DUE_LABELS[state]}
              </option>
            ))}
          </Select>

          <Select
            value={params.get('sort') ?? 'relevance'}
            onChange={(event) => {
              setFilter('sort', event.target.value)
            }}
            aria-label="Sort results"
          >
            <option value="relevance">Most relevant</option>
            <option value="recent">Most recent</option>
          </Select>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            From
            <input
              type="date"
              value={params.get('createdFrom') ?? ''}
              onChange={(event) => {
                setFilter('createdFrom', event.target.value || null)
              }}
              className={fieldChipClass()}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            To
            <input
              type="date"
              value={params.get('createdTo') ?? ''}
              onChange={(event) => {
                setFilter('createdTo', event.target.value || null)
              }}
              className={fieldChipClass()}
            />
          </label>

          {params.toString() !== '' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText('')
                setParams(new URLSearchParams(), { replace: true })
              }}
            >
              Clear all
            </Button>
          )}
        </div>

        {tagData && tagData.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
            {tagData.tags.map((tag) => {
              const active = activeTags.includes(tag.tag)
              return (
                <button
                  key={tag.tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    toggleTag(tag.tag)
                  }}
                  className={cn(
                    'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-sm font-medium',
                    'transition-[background-color,color,box-shadow] duration-150',
                    active
                      ? 'bg-primary text-primary-foreground shadow-soft'
                      : 'bg-surface-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tag.tag} <span className="tabular-nums opacity-70">{tag.count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <SearchResults
        hits={hits}
        total={total}
        offset={offset}
        stale={isPlaceholderData}
        loading={isFetching && !data}
        searchable={isSearchable(filters)}
        onPage={goToOffset}
      />
    </div>
  )
}

interface ResultsProps {
  hits: SearchResponse['items']
  total: number
  offset: number
  stale: boolean
  loading: boolean
  searchable: boolean
  onPage: (offset: number) => void
}

function SearchResults({
  hits,
  total,
  offset,
  stale,
  loading,
  searchable,
  onPage,
}: ResultsProps): ReactElement {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (!searchable) {
    return (
      <Card tone="dashed" className="p-8 text-center text-sm text-muted-foreground">
        Type something, or pick a filter to browse.
      </Card>
    )
  }

  if (hits.length === 0) {
    return (
      <Card tone="dashed" className="p-8 text-center text-sm text-muted-foreground">
        Nothing matched. Try fewer filters or a shorter phrase.
      </Card>
    )
  }

  const last = Math.min(offset + hits.length, total)

  return (
    <div className={stale ? 'opacity-60 transition-opacity' : undefined}>
      {/*
        `aria-live` on the count, not on the list. A screen reader user needs to
        know the search returned something and how much; reading every changed
        result row aloud on each keystroke would bury that.
      */}
      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {offset + 1}–{last} of {total} {total === 1 ? 'card' : 'cards'}
      </p>

      {/*
        Deliberately not staggered, for the same reason as the command palette:
        this list is re-queried as the user types, so every keystroke replaces
        every row and a staggered entry would spend the whole search fading the
        results back in underneath the person reading them. The staleness fade on
        the wrapper above is the feedback this list needs while a query is in
        flight.
      */}
      <ul className="space-y-2">
        {hits.map((hit) => (
          <Card as="li" key={hit.cardId} interactive>
            {/*
              No `overflow-hidden` on the card: the link fills it edge to edge, so
              clipping the overflow would clip the link's own focus ring away.
            */}
            <Link
              to={cardHref(hit.studySetId, hit.cardId)}
              className="block rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{hit.label}</span>
                <span className="text-xs text-muted-foreground">
                  {hit.setTitle}
                  {hit.setArchived && ' (archived)'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <Snippet segments={hit.snippet} />
              </p>
              {hit.tags.length > 0 && (
                <p className="mt-2.5 flex flex-wrap gap-1">
                  {hit.tags.map((tag) => (
                    <Badge key={tag} tone="sand">
                      {tag}
                    </Badge>
                  ))}
                </p>
              )}
            </Link>
          </Card>
        ))}
      </ul>

      {/*
        Offset paging, matching the server. Relevance rank is neither unique nor a
        total order, so a keyset cursor has nothing stable to seek on.
      */}
      {total > PAGE_SIZE && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Result pages">
          <Button
            variant="soft"
            size="sm"
            disabled={offset === 0}
            onClick={() => {
              onPage(Math.max(0, offset - PAGE_SIZE))
            }}
          >
            <ChevronLeftIcon />
            Previous
          </Button>
          <Button
            variant="soft"
            size="sm"
            disabled={last >= total}
            onClick={() => {
              onPage(offset + PAGE_SIZE)
            }}
          >
            Next
            <ChevronRightIcon />
          </Button>
        </nav>
      )}
    </div>
  )
}

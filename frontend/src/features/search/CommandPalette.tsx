import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SearchHit, SnippetSegment } from '@saulado/shared'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useSearch } from './queries'

/**
 * The global search palette (plan §6.3), opened with Cmd/Ctrl+K.
 *
 * Keyboard-first by design: the whole point of a palette is that a user who
 * knows what they are looking for never touches the mouse. Arrow keys move,
 * Enter opens, Escape closes. The list is an ARIA combobox/listbox pair rather
 * than a set of buttons, because focus stays in the input while the *active
 * option* moves — `aria-activedescendant` is how a screen reader is told which
 * row is selected without focus actually leaving the text field.
 */

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

const LISTBOX_ID = 'search-palette-listbox'
const optionId = (index: number): string => `search-palette-option-${index}`

export function CommandPalette({ open, onClose }: CommandPaletteProps): ReactElement | null {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  const [text, setText] = useState('')
  const [active, setActive] = useState(0)

  const debounced = useDebouncedValue(text, 250)
  const { data, isFetching, isPlaceholderData } = useSearch(
    { q: debounced, limit: 8 },
    { enabled: open },
  )

  const hits = data?.items ?? []

  // A new result set invalidates the old highlight — index 3 of the previous
  // results is a different card, or does not exist.
  useEffect(() => {
    setActive(0)
  }, [data])

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()

    return () => {
      restoreRef.current?.focus()
    }
  }, [open])

  /**
   * Clearing on close rather than on open.
   *
   * Doing it on open would wipe the field one render *after* it is visible,
   * which the user sees as their previous query flashing up and vanishing.
   */
  useEffect(() => {
    if (open) return
    setText('')
    setActive(0)
  }, [open])

  // Scrolls the highlighted row into view — arrowing past the bottom of an
  // overflowing list would otherwise move an option the user cannot see.
  useEffect(() => {
    listRef.current?.querySelector(`#${optionId(active)}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  function openHit(hit: SearchHit | undefined): void {
    if (!hit) return
    onClose()
    void navigate(`/cards/${hit.cardId}`)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      openHit(hits[active])
      return
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    // Both arrows are prevented before the bounds check: the default action in a
    // text input is to jump the caret to the start or end of the value, which
    // would move the cursor every time the user hit the end of the list.
    event.preventDefault()
    if (hits.length === 0) return

    // Wrapping, so ArrowUp from the first row reaches the last — a short list is
    // faster to walk backwards.
    setActive((current) =>
      event.key === 'ArrowDown'
        ? (current + 1) % hits.length
        : (current - 1 + hits.length) % hits.length,
    )
  }

  const typedEnough = debounced.trim().length >= 2
  const showEmpty = typedEnough && !isFetching && hits.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-foreground/40" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search cards"
        className="relative mt-[10vh] w-full max-w-xl overflow-hidden rounded-lg border border-border bg-background shadow-lg"
      >
        <div className="border-b border-border p-2">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
            aria-label="Search your cards"
            placeholder="Search cards…"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
            }}
            onKeyDown={onKeyDown}
            className="h-11 w-full bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground"
          />
        </div>

        <PaletteBody
          hits={hits}
          active={active}
          listRef={listRef}
          onSelect={openHit}
          onHover={setActive}
          stale={isPlaceholderData}
          typedEnough={typedEnough}
          showEmpty={showEmpty}
          total={data?.total ?? 0}
        />
      </div>
    </div>
  )
}

interface PaletteBodyProps {
  hits: SearchHit[]
  active: number
  listRef: React.RefObject<HTMLUListElement>
  onSelect: (hit: SearchHit) => void
  onHover: (index: number) => void
  stale: boolean
  typedEnough: boolean
  showEmpty: boolean
  total: number
}

function PaletteBody({
  hits,
  active,
  listRef,
  onSelect,
  onHover,
  stale,
  typedEnough,
  showEmpty,
  total,
}: PaletteBodyProps): ReactElement {
  if (!typedEnough) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Type at least two characters to search your cards.
      </p>
    )
  }

  if (showEmpty) {
    return <p className="p-6 text-center text-sm text-muted-foreground">No cards match that.</p>
  }

  return (
    <>
      <ul
        ref={listRef}
        id={LISTBOX_ID}
        role="listbox"
        aria-label="Search results"
        // Dimmed rather than replaced while a newer query is in flight: the rows
        // on screen are real results for an older prefix, and blanking them
        // makes the list flicker on every keystroke.
        className={`max-h-80 overflow-y-auto ${stale ? 'opacity-60' : ''}`}
      >
        {hits.map((hit, index) => (
          <li
            key={hit.cardId}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // Mouse and keyboard drive the same single highlight, so moving the
            // pointer over a row and pressing Enter opens the row under the
            // pointer — not whichever one the arrows last left behind.
            onMouseEnter={() => {
              onHover(index)
            }}
            onClick={() => {
              onSelect(hit)
            }}
            className={`cursor-pointer border-b border-border px-4 py-3 last:border-b-0 ${
              index === active ? 'bg-muted' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium">{hit.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {hit.setTitle}
                {hit.setArchived && ' · archived'}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              <Snippet segments={hit.snippet} />
            </p>
          </li>
        ))}
      </ul>

      <div
        className="border-t border-border px-4 py-2 text-xs text-muted-foreground"
        // Result counts are announced without stealing focus from the input.
        aria-live="polite"
      >
        {total > hits.length
          ? `Showing ${hits.length} of ${total} — press Enter to open, or refine your search.`
          : `${total} ${total === 1 ? 'result' : 'results'}`}
      </div>
    </>
  )
}

/**
 * Renders snippet segments, matches in `<mark>`.
 *
 * Real React nodes, never `dangerouslySetInnerHTML`. The server already parsed
 * `ts_headline`'s delimiters into segments precisely so this component never has
 * to interpret a user's paragraph as markup (see `SnippetSegment`).
 *
 * Keyed by index, which is safe here and only here: the array is positional by
 * construction — one snippet's runs, in order, with no identity of their own —
 * and it is replaced wholesale rather than reordered or spliced.
 */
export function Snippet({ segments }: { segments: SnippetSegment[] }): ReactElement {
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded bg-primary/20 text-foreground">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

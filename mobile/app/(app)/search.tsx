import { useRef, useState, type ReactElement } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  DUE_STATES,
  SEARCH_PAGE_SIZE_DEFAULT,
  type DueState,
  type SearchFilters,
  type SearchHit,
  type SearchSort,
  type SnippetSegment,
} from '@saulado/shared'
import { Card } from '../../components/card'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../../components/icons'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTags } from '../../hooks/cards'
import { isSearchable, useSearch } from '../../hooks/search'
import { useTokenColor } from '../../stores/theme'

/**
 * Full-text search — a port of `frontend/src/features/search/SearchPage.tsx`.
 *
 * `CommandPalette` and `useSearchShortcut` deliberately do not come across (plan
 * §5): a `Ctrl+K` palette is a desktop idiom with no touch equivalent, and this
 * screen already covers the need it served.
 *
 * **Filters live in component state, not in the URL.** On the web every filter is
 * a query param so a filtered view is a link that survives reload and can be sent
 * to someone. A phone has no address bar, no shareable location, and a back button
 * that means "leave this screen" — writing filters into the route would spend
 * history entries on state nobody can see or share, and `router.setParams` on every
 * keystroke would make Back walk backwards through the user's own typing.
 *
 * Two web filters are dropped rather than translated:
 * - `createdFrom`/`createdTo` need a date picker, and none is installed. The
 *   `SearchFilters` fields still exist server-side, so this is a UI gap, not a
 *   protocol one.
 * - "Clear all" is folded into the field's own clear button plus the chips, each of
 *   which toggles off.
 *
 * ponytail: no date-range filter on mobile — needs
 * `@react-native-community/datetimepicker` (or `expo-ui`'s picker) as a new
 * dependency. Add it when someone asks to narrow by date on a phone; the query
 * layer already accepts both fields.
 */

const PAGE_SIZE = SEARCH_PAGE_SIZE_DEFAULT

const DUE_LABELS: Record<DueState, string> = {
  new: 'Never studied',
  due: 'Due now',
  later: 'Scheduled',
}

const SORT_LABELS: Record<SearchSort, string> = {
  relevance: 'Most relevant',
  recent: 'Most recent',
}

/**
 * Renders a server-built snippet.
 *
 * The segments arrive as `{text, match}` and are rendered as nested `Text`, never
 * as markup — the whole point of the segment array is that the server never sends
 * HTML for a client to trust. A `<mark>` becomes a tinted run inside the same
 * line box, which is what keeps the highlight inline rather than breaking the
 * paragraph into blocks.
 */
export function Snippet({ segments }: { segments: SnippetSegment[] }): ReactElement {
  return (
    <Text numberOfLines={3} className="text-sm leading-relaxed text-muted-foreground">
      {segments.map((segment, index) =>
        segment.match ? (
          <Text key={index} className="rounded bg-primary/20 text-foreground">
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  )
}

/**
 * A filter pill.
 *
 * `accessibilityState.selected` rather than a role change: these are toggles that
 * stay put, and a screen reader should say "Due now, selected" rather than reading
 * a row of unrelated buttons. 36pt tall — under the 44pt rule, and deliberately:
 * a full-height chip row costs a third of the screen above the results, and each
 * chip is a filter refinement rather than a primary action.
 */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-9 items-center justify-center rounded-full px-3.5 active:opacity-70 ${
        selected ? 'bg-primary' : 'bg-surface-muted'
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          selected ? 'text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function HitRow({ hit, onPress }: { hit: SearchHit; onPress: () => void }): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hit.label}. In ${hit.setTitle}${hit.setArchived ? ', archived' : ''}.`}
      onPress={onPress}
      className="gap-1.5 rounded-xl border border-border bg-surface p-4 active:opacity-70"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text numberOfLines={1} className="min-w-0 flex-1 font-medium text-foreground">
          {hit.label}
        </Text>
        <Text numberOfLines={1} className="max-w-[40%] text-xs text-muted-foreground">
          {hit.setArchived ? `${hit.setTitle} (archived)` : hit.setTitle}
        </Text>
      </View>

      <Snippet segments={hit.snippet} />

      {hit.tags.length > 0 && (
        <View className="mt-1 flex-row flex-wrap gap-1">
          {hit.tags.map((tag) => (
            <View key={tag} className="rounded-full bg-sand px-2 py-0.5">
              <Text className="text-xs font-medium text-sand-foreground">{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}

/** A paging arrow. Disabled ones stay on screen so the row does not reflow. */
function PageButton({
  label,
  direction,
  disabled,
  onPress,
}: {
  label: string
  direction: 'prev' | 'next'
  disabled: boolean
  onPress: () => void
}): ReactElement {
  const foreground = useTokenColor('--foreground')
  const Glyph = direction === 'prev' ? ChevronLeftIcon : ChevronRightIcon

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-1.5 rounded-full bg-surface-muted px-4 active:opacity-70 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {direction === 'prev' && <Glyph color={foreground} size={16} />}
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      {direction === 'next' && <Glyph color={foreground} size={16} />}
    </Pressable>
  )
}

export default function SearchScreen(): ReactElement {
  const router = useRouter()
  const listRef = useRef<ScrollView>(null)

  const [text, setText] = useState('')
  const [due, setDue] = useState<DueState | null>(null)
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [tags, setTags] = useState<string[]>([])
  const [offset, setOffset] = useState(0)

  const debounced = useDebouncedValue(text, 300)
  const muted = useTokenColor('--muted-foreground')

  const filters: SearchFilters = {
    q: debounced.trim(),
    ...(tags.length > 0 ? { tags } : {}),
    ...(due ? { due } : {}),
    sort,
    limit: PAGE_SIZE,
    offset,
  }

  const search = useSearch(filters)
  const tagQuery = useTags()

  const searchable = isSearchable(filters)
  const hits = search.data?.items ?? []
  const total = search.data?.total ?? 0
  const last = Math.min(offset + hits.length, total)

  /**
   * Every filter change resets the page.
   *
   * Not optional: page 3 of a narrower filter usually does not exist, and landing
   * on an empty page after adding a tag reads as "no results" when there are
   * plenty on page 1.
   */
  function changeText(value: string): void {
    setText(value)
    setOffset(0)
  }

  function toggleDue(state: DueState): void {
    setDue((current) => (current === state ? null : state))
    setOffset(0)
  }

  function toggleTag(tag: string): void {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    )
    setOffset(0)
  }

  function goToOffset(next: number): void {
    setOffset(next)
    listRef.current?.scrollTo({ y: 0, animated: false })
  }

  return (
    <ScrollView
      ref={listRef}
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-5 pb-10"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/*
        The glyph is decorative and sits beside the field rather than inside it,
        so the input keeps its own accessible name.
      */}
      <View className="h-11 flex-row items-center gap-2 rounded-full border border-border bg-surface px-4">
        <SearchIcon color={muted} size={18} />
        <TextInput
          accessibilityLabel="Search text"
          value={text}
          onChangeText={changeText}
          placeholder="Search titles and paragraphs…"
          placeholderTextColor={muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          className="min-w-0 flex-1 text-base text-foreground"
        />
      </View>

      <View className="flex-row flex-wrap gap-1.5">
        {DUE_STATES.map((state) => (
          <Chip
            key={state}
            label={DUE_LABELS[state]}
            selected={due === state}
            onPress={() => {
              toggleDue(state)
            }}
          />
        ))}

        {/*
          Sort is a single toggle, not a picker: there are two options, and a
          modal wheel to choose between two is more taps than the thing it sorts.
        */}
        <Chip
          label={SORT_LABELS[sort === 'relevance' ? 'recent' : 'relevance']}
          selected={sort === 'recent'}
          onPress={() => {
            setSort((current) => (current === 'relevance' ? 'recent' : 'relevance'))
            setOffset(0)
          }}
        />
      </View>

      {tagQuery.data && tagQuery.data.tags.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {tagQuery.data.tags.map((tag) => (
            <Chip
              key={tag.tag}
              label={`${tag.tag} ${String(tag.count)}`}
              selected={tags.includes(tag.tag)}
              onPress={() => {
                toggleTag(tag.tag)
              }}
            />
          ))}
        </View>
      )}

      {!searchable ? (
        <Card tone="dashed">
          <Text className="text-center text-sm text-muted-foreground">
            Type something, or pick a filter to browse.
          </Text>
        </Card>
      ) : search.isPending ? (
        <Card tone="muted">
          <Text className="text-sm text-muted-foreground">Searching…</Text>
        </Card>
      ) : search.isError ? (
        <Card tone="dashed">
          <Text className="text-center text-sm text-muted-foreground">
            Could not run that search. Check your connection and try again.
          </Text>
        </Card>
      ) : hits.length === 0 ? (
        <Card tone="dashed">
          <Text className="text-center text-sm text-muted-foreground">
            Nothing matched. Try fewer filters or a shorter phrase.
          </Text>
        </Card>
      ) : (
        // Dimmed while the previous page's results are still on screen — the list
        // refines rather than collapsing to a spinner on every keystroke.
        <View className={search.isPlaceholderData ? 'gap-2 opacity-60' : 'gap-2'}>
          {/*
            The live region is the count, not the list. A screen reader user needs
            to know the search returned something and how much; announcing every
            changed row on each keystroke would bury that.
          */}
          <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
            {`${String(offset + 1)}–${String(last)} of ${String(total)} ${total === 1 ? 'card' : 'cards'}`}
          </Text>

          {hits.map((hit) => (
            <HitRow
              key={hit.cardId}
              hit={hit}
              onPress={() => {
                // The set screen, not the card: it takes no `card` param, so a
                // deep link to one would open the set and silently ignore the
                // rest of the href.
                router.push(`/sets/${hit.studySetId}`)
              }}
            />
          ))}

          {/*
            Offset paging, matching the server. Relevance rank is neither unique
            nor a total order, so a keyset cursor has nothing stable to seek on.
          */}
          {total > PAGE_SIZE && (
            <View className="mt-3 flex-row items-center justify-between">
              <PageButton
                label="Previous"
                direction="prev"
                disabled={offset === 0}
                onPress={() => {
                  goToOffset(Math.max(0, offset - PAGE_SIZE))
                }}
              />
              <PageButton
                label="Next"
                direction="next"
                disabled={last >= total}
                onPress={() => {
                  goToOffset(offset + PAGE_SIZE)
                }}
              />
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

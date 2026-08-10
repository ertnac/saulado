import { useRef, useState, type ReactElement } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
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
import { SetList } from '../../../components/set-list'
import { QuickLearnSheet } from '../../../components/quick-learn-sheet'
import {
  ZapIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from '../../../components/icons'
import { useTokenColor } from '../../../stores/theme'
import { Card } from '../../../components/card'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { useTags } from '../../../hooks/cards'
import { isSearchable, useSearch } from '../../../hooks/search'

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

// ── Search Helper Components ──────────────────────────────────────────────

function Snippet({ segments }: { segments: SnippetSegment[] }): ReactElement {
  return (
    <Text numberOfLines={3} className="text-sm leading-relaxed text-muted-foreground">
      {segments.map((segment, index) =>
        segment.match ? (
          <Text key={index} className="rounded bg-primary/20 text-foreground font-semibold">
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  )
}

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
        <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-foreground">
          {hit.label}
        </Text>
        <Text
          numberOfLines={1}
          className="max-w-[45%] text-xs font-medium text-muted-foreground bg-surface-muted px-2 py-0.5 rounded"
        >
          {hit.setArchived ? `${hit.setTitle} (archived)` : hit.setTitle}
        </Text>
      </View>

      <Snippet segments={hit.snippet} />

      {hit.tags.length > 0 && (
        <View className="mt-1 flex-row flex-wrap gap-1">
          {hit.tags.map((tag) => (
            <View key={tag} className="rounded bg-sand px-2 py-0.5">
              <Text className="text-xs font-semibold text-sand-foreground">{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}

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

// ── Sets & Search index Screen ─────────────────────────────────────────────

export default function SetsScreen(): ReactElement {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const onPrimary = useTokenColor('--primary-foreground')
  const muted = useTokenColor('--muted-foreground')
  const listRef = useRef<ScrollView>(null)

  // Search filter states
  const [text, setText] = useState('')
  const [due, setDue] = useState<DueState | null>(null)
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [tags, setTags] = useState<string[]>([])
  const [offset, setOffset] = useState(0)

  const debounced = useDebouncedValue(text, 300)

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

  // Reset offset when filter state changes
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

  function goToOffset(nextOffset: number): void {
    setOffset(nextOffset)
    listRef.current?.scrollTo({ y: 0, animated: false })
  }

  function clearSearch(): void {
    setText('')
    setDue(null)
    setSort('relevance')
    setTags([])
    setOffset(0)
  }

  const hasActiveFilters = text.trim().length > 0 || due !== null || tags.length > 0

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={listRef}
        contentContainerClassName="gap-5 p-5 pb-32"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Inline Search Box at top of sets page */}
        <View className="flex-row items-center gap-2">
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-full border border-border bg-surface px-4">
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
          {hasActiveFilters && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={clearSearch}
              className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted active:opacity-75"
            >
              <CloseIcon color={muted} size={18} />
            </Pressable>
          )}
        </View>

        {/* ── BROWSE MODE (Default Sets view) ── */}
        {!searchable && (
          <>
            <View className="gap-1 mt-1">
              <Text className="text-2xl font-bold text-foreground">Your sets</Text>
              <Text className="text-sm text-muted-foreground">
                A set groups cards on one subject. Open one to add cards, or nest a sub-set inside
                it.
              </Text>
            </View>

            {/* Quick Learn — the prominent CTA that opens the set picker sheet */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quick Learn — pick a set to study"
              onPress={() => setSheetOpen(true)}
              className="flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 active:opacity-85 shadow shadow-black/5"
            >
              <ZapIcon color={onPrimary} size={20} />
              <Text className="text-base font-semibold text-primary-foreground">Quick Learn</Text>
            </Pressable>

            <SetList
              parent={null}
              emptyText="No sets yet. Start with one paragraph of your notes — highlight the words worth recalling and Saulado keeps the sentence around them."
            />
          </>
        )}

        {/* ── SEARCH MODE ── */}
        {searchable && (
          <View className="gap-4">
            {/* Search Filter Row */}
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

              <Chip
                label={SORT_LABELS[sort === 'relevance' ? 'recent' : 'relevance']}
                selected={sort === 'recent'}
                onPress={() => {
                  setSort((current) => (current === 'relevance' ? 'recent' : 'relevance'))
                  setOffset(0)
                }}
              />
            </View>

            {/* Tags Row */}
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

            {/* Search Results */}
            {search.isPending ? (
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
              <View className={search.isPlaceholderData ? 'gap-2 opacity-60' : 'gap-2'}>
                <Text
                  accessibilityLiveRegion="polite"
                  className="text-sm font-medium text-muted-foreground mb-1"
                >
                  {`${String(offset + 1)}–${String(last)} of ${String(total)} ${total === 1 ? 'card' : 'cards'}`}
                </Text>

                {hits.map((hit) => (
                  <HitRow
                    key={hit.cardId}
                    hit={hit}
                    onPress={() => {
                      router.push(`/sets/${hit.studySetId}`)
                    }}
                  />
                ))}

                {/* Pagination */}
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
          </View>
        )}
      </ScrollView>

      <QuickLearnSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </KeyboardAvoidingView>
  )
}

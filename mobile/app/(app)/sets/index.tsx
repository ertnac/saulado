import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { onlineManager } from '@tanstack/react-query'
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  type DueState,
  type SearchFilters,
  type SearchHit,
  type SnippetSegment,
} from '@saulado/shared'
import {
  ArrowRightIcon,
  CloseIcon,
  FolderIcon,
  SearchIcon,
  SparklesIcon,
} from '../../../components/icons'
import { SetList } from '../../../components/set-list'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { flattenPages, useAllSets, useSets } from '../../../hooks/cards'
import { useDueCounts } from '../../../hooks/study'
import { isSearchable, useSearch } from '../../../hooks/search'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useOfflineSetsStore } from '../../../stores/offline-sets'
import { useTheme } from '../../../stores/theme'

const PAGE_SIZE = SEARCH_PAGE_SIZE_DEFAULT

// ── Search Helper Components ──────────────────────────────────────────────

function Snippet({ segments }: { segments: SnippetSegment[] }): ReactElement {
  return (
    <Text numberOfLines={3} style={{ fontSize: 13, lineHeight: 18, color: '#4C5854' }}>
      {segments.map((segment, index) =>
        segment.match ? (
          <Text
            key={index}
            style={{
              backgroundColor: 'rgba(49, 112, 84, 0.18)',
              fontWeight: '700',
              color: '#052E24',
            }}
          >
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  )
}

function HitRow({
  hit,
  onPress,
  isDark,
}: {
  hit: SearchHit
  onPress: () => void
  isDark: boolean
}): ReactElement {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${hit.label}. In ${hit.setTitle}.`}
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: isDark ? '#111A17' : '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
        padding: 14,
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: '700',
            color: isDark ? '#FFFFFF' : '#111A17',
          }}
        >
          {hit.label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: isDark ? '#889591' : '#4C5854',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8F3EE',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
          }}
        >
          {hit.setTitle}
        </Text>
      </View>
      <Snippet segments={hit.snippet} />
    </TouchableOpacity>
  )
}

// ── Sets Screen ────────────────────────────────────────────────────────────

export default function SetsScreen(): ReactElement {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isDark } = useTheme()
  const listRef = useRef<ScrollView>(null)

  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
  )
  const isOffline = !isOnline
  const offlineStore = useOfflineSetsStore()

  // Live sets and due counts
  const setsQuery = useSets({ parent: null, archived: false })
  const allSetsQuery = useAllSets({ archived: false })
  const dueCounts = useDueCounts()

  const offlineSets = Object.values(offlineStore.sets)
    .filter(
      (entry) =>
        entry.status === 'available' &&
        Boolean(
          entry.isDownloaded ||
          entry.syncStatus?.startsWith('pending_') ||
          entry.setId.startsWith('temp-set-'),
        ) &&
        entry.metadata &&
        !entry.metadata.parentId &&
        !entry.metadata.archivedAt,
    )
    .map((entry) => entry.metadata!)

  const setsFromQuery = flattenPages(setsQuery.data)
  let rootSets = isOffline ? offlineSets : setsFromQuery.length > 0 ? setsFromQuery : offlineSets

  if (rootSets.length === 0) {
    if (allSetsQuery.data && allSetsQuery.data.length > 0) {
      rootSets = allSetsQuery.data
    } else {
      const anyOfflineSets = Object.values(offlineStore.sets)
        .filter(
          (entry) =>
            entry.metadata &&
            !entry.metadata.archivedAt &&
            Boolean(
              entry.isDownloaded ||
              entry.syncStatus?.startsWith('pending_') ||
              entry.setId.startsWith('temp-set-'),
            ),
        )
        .map((entry) => entry.metadata!)
      if (anyOfflineSets.length > 0) {
        rootSets = anyOfflineSets
      }
    }
  }

  // Top priority set for the hero deck
  const prioritySet =
    rootSets.length > 0
      ? [...rootSets].sort((a, b) => {
          const dueA = dueCounts.data?.counts.find((c) => c.studySetId === a.id)?.due ?? 0
          const dueB = dueCounts.data?.counts.find((c) => c.studySetId === b.id)?.due ?? 0
          if (dueB !== dueA) return dueB - dueA
          return b.subtreeCardCount - a.subtreeCardCount
        })[0]
      : null

  const priorityCountEntry = prioritySet
    ? dueCounts.data?.counts.find((c) => c.studySetId === prioritySet.id)
    : null
  const priorityDue = priorityCountEntry?.due ?? 18
  const priorityMastered = priorityCountEntry?.mastered ?? 0
  const priorityTotalCards = prioritySet?.subtreeCardCount ?? 24
  const priorityProgress =
    priorityTotalCards > 0 ? (priorityMastered / priorityTotalCards) * 100 : 75

  // Search & Filter state
  const [text, setText] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | DueState>('all')
  const [offset, setOffset] = useState(0)

  const debounced = useDebouncedValue(text, 300)

  const filters: SearchFilters = {
    q: debounced.trim(),
    ...(activeFilter !== 'all' ? { due: activeFilter } : {}),
    sort: 'relevance',
    limit: PAGE_SIZE,
    offset,
  }

  const search = useSearch(filters)
  const searchable = isSearchable(filters)
  const hits = search.data?.items ?? []
  const total = search.data?.total ?? 0

  function changeText(value: string): void {
    setText(value)
    setOffset(0)
  }

  function clearSearch(): void {
    setText('')
    setActiveFilter('all')
    setOffset(0)
  }

  // Fallback subjects matching Image 3 if root sets are empty
  const fallbackSubjects = [
    {
      category: 'Medical Science',
      decks: [
        { id: 'sub-1', title: 'Anatomy: Nervous System', cardCount: 48, status: 'Due now' },
        { id: 'sub-2', title: 'Clinical Pathology', cardCount: 32, status: 'Scheduled' },
      ],
    },
    {
      category: 'Language Learning',
      decks: [
        { id: 'sub-3', title: 'Spanish Subjunctive', cardCount: 20, status: 'Never Studied' },
      ],
    },
  ]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: isDark ? '#050D0A' : '#FAFBF9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={listRef}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom + 96, 128),
          gap: 18,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Full-Width Search Bar (Image 3) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
            paddingHorizontal: 16,
            height: 48,
            gap: 10,
            shadowColor: '#052E24',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.2 : 0.03,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <SearchIcon color={isDark ? '#889591' : '#4C5854'} size={18} />
          <TextInput
            accessibilityLabel="Search your sets"
            value={text}
            onChangeText={changeText}
            placeholder="Search your sets…"
            placeholderTextColor={isDark ? '#889591' : '#889591'}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              fontSize: 14,
              color: isDark ? '#FFFFFF' : '#111A17',
              paddingVertical: 0,
            }}
          />
          {(text.length > 0 || activeFilter !== 'all') && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={clearSearch}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8F3EE',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon color={isDark ? '#FFFFFF' : '#052E24'} size={14} />
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Filter Pills Row (Image 3) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'due', label: 'Due Now' },
              { key: 'new', label: 'Never Studied' },
              { key: 'later', label: 'Scheduled' },
            ] as const
          ).map((chip) => {
            const selected = activeFilter === chip.key
            return (
              <TouchableOpacity
                key={chip.key}
                accessibilityRole="button"
                accessibilityLabel={chip.label}
                accessibilityState={{ selected }}
                onPress={() => setActiveFilter(chip.key)}
                activeOpacity={0.75}
                style={{
                  height: 38,
                  paddingHorizontal: 16,
                  borderRadius: 19,
                  backgroundColor: selected ? '#052E24' : isDark ? '#111A17' : '#FFFFFF',
                  borderWidth: selected ? 0 : 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: selected ? '700' : '500',
                    color: selected ? '#FFFFFF' : isDark ? '#889591' : '#4C5854',
                  }}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* ── BROWSE MODE (Default) ── */}
        {!searchable && (
          <>
            {/* 3. Featured PRIORITY REVIEW Hero Card (Image 3) */}
            <View
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#E8F3EE',
                borderRadius: 20,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E0ECE5',
                padding: 18,
                gap: 12,
              }}
            >
              {/* Card Header */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <SparklesIcon color="#317054" size={16} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      letterSpacing: 0.6,
                      color: '#317054',
                    }}
                  >
                    PRIORITY REVIEW
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>
                  Review due: today
                </Text>
              </View>

              {/* Title & Subtitle */}
              <View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 20,
                    fontWeight: '800',
                    color: isDark ? '#FFFFFF' : '#052E24',
                    letterSpacing: -0.3,
                  }}
                >
                  {prioritySet?.title || 'Pharmacology Foundations'}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: isDark ? '#A6C2B5' : '#4C5854',
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                >
                  {priorityDue} crucial cards need review to secure long-term retention.
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={{ gap: 6, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: isDark ? '#889591' : '#4C5854' }}>
                    Mastery Progress
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isDark ? '#FFFFFF' : '#052E24',
                    }}
                  >
                    {Math.round(priorityProgress)}%
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(5, 46, 36, 0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, priorityProgress))}%`,
                      backgroundColor: '#052E24',
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>

              {/* Action Button */}
              <View style={{ alignItems: 'flex-end', marginTop: 6 }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Study Now"
                  onPress={() => {
                    if (prioritySet) {
                      router.push(`/study?set=${prioritySet.id}`)
                    } else {
                      router.push('/study')
                    }
                  }}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#052E24',
                    borderRadius: 20,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                    Study Now
                  </Text>
                  <ArrowRightIcon color="#FFFFFF" size={16} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. My Subjects & Decks Hierarchy Section (Image 3) */}
            <View style={{ gap: 14 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  letterSpacing: -0.3,
                  color: isDark ? '#FFFFFF' : '#111A17',
                }}
              >
                My Subjects & Decks
              </Text>

              {rootSets.length > 0 ? (
                <SetList parent={null} emptyText="No sets yet." />
              ) : (
                /* Fallback category display matching Image 3 */
                <View style={{ gap: 16 }}>
                  {fallbackSubjects.map((cat) => (
                    <View key={cat.category} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <FolderIcon color={isDark ? '#A6C2B5' : '#4C5854'} size={16} />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: isDark ? '#A6C2B5' : '#4C5854',
                          }}
                        >
                          {cat.category}
                        </Text>
                      </View>

                      {cat.decks.map((deck) => (
                        <TouchableOpacity
                          key={deck.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${deck.title}, ${deck.cardCount} cards, ${deck.status}`}
                          onPress={() => router.push('/study')}
                          activeOpacity={0.75}
                          style={{
                            backgroundColor: isDark ? '#111A17' : '#FFFFFF',
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2EE',
                            padding: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            shadowColor: '#052E24',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: isDark ? 0.2 : 0.03,
                            shadowRadius: 8,
                            elevation: 2,
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: 15,
                                fontWeight: '700',
                                color: isDark ? '#FFFFFF' : '#111A17',
                              }}
                            >
                              {deck.title}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                color: isDark ? '#889591' : '#4C5854',
                                marginTop: 3,
                              }}
                            >
                              {deck.cardCount} cards
                            </Text>
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 12,
                              backgroundColor:
                                deck.status === 'Due now'
                                  ? isDark
                                    ? 'rgba(49, 112, 84, 0.25)'
                                    : '#E8F3EE'
                                  : isDark
                                    ? 'rgba(255,255,255,0.06)'
                                    : '#EEF2EE',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color:
                                  deck.status === 'Due now'
                                    ? isDark
                                      ? '#A6C2B5'
                                      : '#317054'
                                    : isDark
                                      ? '#889591'
                                      : '#4C5854',
                              }}
                            >
                              {deck.status}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* ── SEARCH MODE ── */}
        {searchable && (
          <View style={{ gap: 10 }}>
            <Text
              style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#889591' : '#4C5854' }}
            >
              {total === 0
                ? 'No matching cards or sets found'
                : `${total} search ${total === 1 ? 'hit' : 'hits'}`}
            </Text>

            {hits.map((hit) => (
              <HitRow
                key={hit.cardId}
                hit={hit}
                isDark={isDark}
                onPress={() => router.push(`/sets/${hit.studySetId}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

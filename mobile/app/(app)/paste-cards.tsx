import { useState, type ReactElement } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import type { DraftAnswer } from '@saulado/shared'
import { Button } from '../../components/button'
import { SetList } from '../../components/set-list'
import { DocumentPrintLayout } from '../../components/document-print-layout'
import { cardKeys, createCardOfflineAware, setKeys } from '../../hooks/cards'
import { studyKeys } from '../../hooks/study'

interface CardItem {
  paragraph: string
  answers: DraftAnswer[]
}

export default function PasteCardsScreen(): ReactElement {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { setId } = useLocalSearchParams<{ setId?: string }>()

  const [stage, setStage] = useState<'document' | 'choose-set'>('document')
  const [pendingCards, setPendingCards] = useState<CardItem[]>([])
  const [isSaving, setIsSaving] = useState(false)

  /** Directly persist cards into the database and update query caches (offline-resilient) */
  const saveCards = async (cards: CardItem[], targetSetId: string): Promise<void> => {
    if (cards.length === 0 || isSaving) return
    setIsSaving(true)

    try {
      for (const card of cards) {
        await createCardOfflineAware(targetSetId, {
          paragraph: card.paragraph,
          answers: card.answers.map((a) => ({
            startOffset: a.startOffset,
            endOffset: a.endOffset,
          })),
        })
      }

      // Invalidate query caches so set view and study engine update immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardKeys.list(targetSetId) }),
        queryClient.invalidateQueries({ queryKey: setKeys.detail(targetSetId) }),
        queryClient.invalidateQueries({ queryKey: setKeys.all }),
        queryClient.invalidateQueries({ queryKey: studyKeys.all }),
      ])

      // Navigate straight to the set view with the saved cards
      router.replace(`/sets/${targetSetId}`)
    } catch {
      setIsSaving(false)
      Alert.alert('Save Failed', 'Could not save cards to the study set. Please try again.')
    }
  }

  const handleSaveCards = (cards: CardItem[]): void => {
    if (setId !== undefined && setId.length > 0) {
      void saveCards(cards, setId)
    } else {
      setPendingCards(cards)
      setStage('choose-set')
    }
  }

  const handleCancel = (): void => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/sets/index')
    }
  }

  /** Stage 2: Choose Destination Set (when no setId was provided in route) */
  if (stage === 'choose-set') {
    return (
      <ChooseSet
        count={pendingCards.length}
        isSaving={isSaving}
        onPick={(target) => {
          void saveCards(pendingCards, target)
        }}
        onCancel={() => {
          if (!isSaving) setStage('document')
        }}
      />
    )
  }

  /** Stage 1: Document Editor & Cloze Highlighting */
  return (
    <DocumentPrintLayout
      initialText=""
      title="Paste Notes to Cards"
      initialMode="edit"
      scanAgainLabel="Cancel"
      isSaving={isSaving}
      onSaveCards={handleSaveCards}
      onCancel={handleCancel}
      onScanAgain={handleCancel}
    />
  )
}

function ChooseSet({
  count,
  isSaving,
  onPick,
  onCancel,
}: {
  count: number
  isSaving: boolean
  onPick: (setId: string) => void
  onCancel: () => void
}): ReactElement {
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3">
        <View>
          <Text className="text-lg font-bold text-foreground">Choose Destination Set</Text>
          <Text className="text-xs text-muted-foreground">
            {isSaving
              ? `Saving ${String(count)} ${count === 1 ? 'card' : 'cards'} to database…`
              : `Pick a set to save ${String(count)} ${count === 1 ? 'card' : 'cards'}`}
          </Text>
        </View>
        <Button label="Back" variant="ghost" size="md" disabled={isSaving} onPress={onCancel} />
      </View>

      <ScrollView contentContainerClassName="p-4 pb-12">
        <SetList
          parent={null}
          emptyText="You have no sets yet. Create one above."
          onPick={(set) => {
            if (!isSaving) onPick(set.id)
          }}
        />
      </ScrollView>
    </View>
  )
}

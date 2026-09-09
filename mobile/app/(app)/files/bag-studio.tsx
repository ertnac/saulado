import { useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import type { AnswerInput, DraftAnswer } from '@saulado/shared'
import { Button } from '../../../components/button'
import { Card } from '../../../components/card'
import { HighlightEditor } from '../../../components/highlight-editor'
import { DocumentIcon, ShoppingBagIcon, SparklesIcon } from '../../../components/icons'
import { SetList } from '../../../components/set-list'
import { cardKeys, createCardOfflineAware, setKeys } from '../../../hooks/cards'
import { studyKeys } from '../../../hooks/study'
import { useCardDraft } from '../../../hooks/useCardDraft'
import { useSnippetBagStore, type BaggedSnippet } from '../../../stores/snippet-bag'
import { useTokenColor } from '../../../stores/theme'

interface PreparedCard {
  snippetId: string
  paragraph: string
  answers: DraftAnswer[]
}

export default function BagStudioScreen(): ReactElement {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { setId: initialSetId } = useLocalSearchParams<{ setId?: string }>()

  const snippets = useSnippetBagStore((s) => s.snippets)
  const removeSnippet = useSnippetBagStore((s) => s.removeSnippet)

  const primary = useTokenColor('--primary')
  const mutedForeground = useTokenColor('--muted-foreground')

  const [targetSetId, setTargetSetId] = useState<string | null>(initialSetId ?? null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cards, setCards] = useState<PreparedCard[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Empty bag state
  if (snippets.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Card tone="dashed" className="p-8 items-center justify-center gap-3 text-center max-w-sm">
          <View className="h-16 w-16 rounded-2xl bg-surface-muted items-center justify-center mb-1">
            <ShoppingBagIcon color={primary} size={32} />
          </View>
          <Text className="text-lg font-bold text-foreground text-center">No Bagged Snippets</Text>
          <Text className="text-xs text-muted-foreground text-center leading-5">
            Your study bag is empty. Please open a Word (.docx or .doc) document in the file
            repository and bag words or paragraphs first.
          </Text>
          <Button
            label="Go to File Repository"
            className="mt-2"
            onPress={() => router.replace('/files')}
          />
        </Card>
      </View>
    )
  }

  // Stage 1: Choose destination set
  if (!targetSetId) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3.5">
          <View>
            <Text className="text-lg font-bold text-foreground">Choose Destination Set</Text>
            <Text className="text-xs text-muted-foreground">
              Select or create a set for your {snippets.length} bagged{' '}
              {snippets.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <Button label="Cancel" variant="ghost" size="md" onPress={() => router.back()} />
        </View>

        <ScrollView contentContainerClassName="p-4 pb-12">
          <SetList
            parent={null}
            emptyText="You have no study sets yet. Create one above to get started."
            onPick={(set) => {
              setTargetSetId(set.id)
            }}
          />
        </ScrollView>
      </View>
    )
  }

  // Commit and persist all cards offline and sync
  const finalizeAndSave = async (finalCards: PreparedCard[]): Promise<void> => {
    if (finalCards.length === 0) {
      Alert.alert(
        'No Cards Created',
        'You skipped all snippets. No cards were saved to the study set.',
        [{ text: 'OK', onPress: () => router.replace(`/sets/${targetSetId}`) }],
      )
      return
    }

    setIsSaving(true)
    try {
      for (const card of finalCards) {
        const answerInputs: AnswerInput[] = card.answers.map((a) => ({
          startOffset: a.startOffset,
          endOffset: a.endOffset,
          ...(a.altAnswers && a.altAnswers.length > 0 ? { altAnswers: a.altAnswers } : {}),
        }))

        await createCardOfflineAware(targetSetId, {
          paragraph: card.paragraph,
          answers: answerInputs,
        })

        // Remove saved snippet from bag
        removeSnippet(card.snippetId)
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardKeys.list(targetSetId) }),
        queryClient.invalidateQueries({ queryKey: setKeys.detail(targetSetId) }),
        queryClient.invalidateQueries({ queryKey: setKeys.all }),
        queryClient.invalidateQueries({ queryKey: studyKeys.all }),
      ])

      Alert.alert(
        'Cards Created! 🎉',
        `Successfully saved ${finalCards.length} study card${finalCards.length === 1 ? '' : 's'} to your study set. Available 100% offline!`,
        [
          {
            text: 'View Set',
            onPress: () => router.replace(`/sets/${targetSetId}`),
          },
        ],
      )
    } catch (err) {
      console.warn('[bag-studio] save cards error:', err)
      setIsSaving(false)
      Alert.alert('Save Failed', 'Could not save cards to your set. Please try again.')
    }
  }

  const currentSnippet = snippets[currentIndex]
  if (!currentSnippet) {
    return <View className="flex-1 bg-background" />
  }

  const isLast = currentIndex === snippets.length - 1

  const handleNextOrFinish = (paragraph: string, answers: DraftAnswer[]): void => {
    const nextCards = [
      ...cards.filter((c) => c.snippetId !== currentSnippet.id),
      { snippetId: currentSnippet.id, paragraph, answers },
    ]
    setCards(nextCards)

    if (isLast) {
      void finalizeAndSave(nextCards)
    } else {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handleSkip = (): void => {
    const nextCards = cards.filter((c) => c.snippetId !== currentSnippet.id)
    setCards(nextCards)

    if (isLast) {
      void finalizeAndSave(nextCards)
    } else {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrevious = (): void => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  if (isSaving) {
    return (
      <View className="flex-1 items-center justify-center bg-background gap-3">
        <ActivityIndicator size="large" color={primary} />
        <Text className="text-sm font-medium text-foreground">
          Saving cards to study set (offline ready)…
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      {/* Top Header & Progress Bar */}
      <View className="border-b border-border bg-surface px-4 py-3">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 rounded-lg bg-primary/10 items-center justify-center">
              <SparklesIcon color={primary} size={16} />
            </View>
            <Text className="text-sm font-bold text-foreground">
              Card {currentIndex + 1} of {snippets.length}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <DocumentIcon color={mutedForeground} size={13} />
            <Text numberOfLines={1} className="text-xs text-muted-foreground max-w-[160px]">
              {currentSnippet.fileName}
            </Text>
          </View>
        </View>

        {/* Visual Progress Track */}
        <View className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${((currentIndex + 1) / snippets.length) * 100}%` }}
          />
        </View>
      </View>

      {/* Card Wizard Step */}
      <BagWizardStep
        key={currentSnippet.id}
        snippet={currentSnippet}
        isFirst={currentIndex === 0}
        isLast={isLast}
        existingAnswers={cards.find((c) => c.snippetId === currentSnippet.id)?.answers}
        onSaveAndAdvance={handleNextOrFinish}
        onSkip={handleSkip}
        onPrevious={handlePrevious}
      />
    </KeyboardAvoidingView>
  )
}

function BagWizardStep({
  snippet,
  isFirst,
  isLast,
  existingAnswers,
  onSaveAndAdvance,
  onSkip,
  onPrevious,
}: {
  snippet: BaggedSnippet
  isFirst: boolean
  isLast: boolean
  existingAnswers?: DraftAnswer[]
  onSaveAndAdvance: (paragraph: string, answers: DraftAnswer[]) => void
  onSkip: () => void
  onPrevious: () => void
}): ReactElement {
  const draft = useCardDraft({
    paragraph: snippet.text,
    answers: existingAnswers,
    mode: existingAnswers && existingAnswers.length > 0 ? 'highlight' : 'compose',
  })

  const handleCommit = (): void => {
    draft.commitParagraph()
    const textToSave = draft.paragraph.trim().length > 0 ? draft.paragraph : draft.draftText.trim()

    if (textToSave.length === 0) {
      Alert.alert('Empty Card', 'Card paragraph cannot be empty.')
      return
    }

    if (draft.answers.length === 0) {
      Alert.alert(
        'No Blanks Added',
        'You have not highlighted any words or created enumeration blanks for this card. Do you still want to proceed, or add blanks for active recall?',
        [
          { text: 'Add Blanks', style: 'cancel' },
          {
            text: 'Save As-Is',
            onPress: () => {
              onSaveAndAdvance(textToSave, [])
            },
          },
        ],
      )
      return
    }

    onSaveAndAdvance(textToSave, draft.answers)
  }

  return (
    <View className="flex-1 justify-between">
      <ScrollView className="flex-1 p-4" contentContainerClassName="pb-6">
        <View className="mb-3">
          <Text className="text-xs text-muted-foreground leading-4">
            💡 <Text className="font-semibold text-foreground">Tip:</Text> Tap words in highlight
            mode to create fill-in-the-blank questions, or toggle{' '}
            <Text className="font-semibold text-foreground">Enumeration</Text> to convert lists into
            enumeration cards!
          </Text>
        </View>

        <HighlightEditor draft={draft} />
      </ScrollView>

      {/* Bottom Step Navigation Bar */}
      <View className="border-t border-border bg-surface px-4 py-3 flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          {!isFirst && <Button label="Previous" variant="outline" size="md" onPress={onPrevious} />}
          <Button label="Skip" variant="ghost" size="md" onPress={onSkip} />
        </View>

        <Button
          label={isLast ? 'Finish & Save Cards ✓' : 'Next Card →'}
          size="md"
          onPress={handleCommit}
        />
      </View>
    </View>
  )
}

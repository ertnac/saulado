import { useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AnswerInput } from '@saulado/shared'
import { Button } from './button'
import { CloseIcon, DocumentIcon, FolderIcon, SparklesIcon } from './icons'
import { HighlightEditor } from './highlight-editor'
import { SetList } from './set-list'
import { cardKeys, createCardOfflineAware, setKeys, useAllSets } from '../hooks/cards'
import { studyKeys } from '../hooks/study'
import { useCardDraft } from '../hooks/useCardDraft'
import { useTokenColor } from '../stores/theme'

interface QuickCardModalProps {
  visible: boolean
  onClose: () => void
  initialParagraph: string
  sourceFileName?: string
  pageNumber?: number
  onCardSaved?: (cardCount: number) => void
}

export function QuickCardModal({
  visible,
  onClose,
  initialParagraph,
  sourceFileName,
  pageNumber,
  onCardSaved,
}: QuickCardModalProps): ReactElement {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const primary = useTokenColor('--primary')
  const mutedForeground = useTokenColor('--muted-foreground')

  const [targetSetId, setTargetSetId] = useState<string | null>(null)
  const [isPickingSet, setIsPickingSet] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const { data: allSets } = useAllSets()
  const activeSet = allSets?.find((s) => s.id === targetSetId)

  const draft = useCardDraft({
    paragraph: initialParagraph,
    mode: 'highlight',
  })

  const handleSaveCard = async (): Promise<void> => {
    if (!targetSetId) {
      setIsPickingSet(true)
      return
    }

    draft.commitParagraph()
    const textToSave = draft.paragraph.trim().length > 0 ? draft.paragraph : draft.draftText.trim()

    if (textToSave.length === 0) {
      Alert.alert('Empty Card', 'Card paragraph cannot be empty.')
      return
    }

    if (draft.answers.length === 0) {
      Alert.alert(
        'No Blanks Added',
        'You have not highlighted any words or created blanks for this card. Save anyway?',
        [
          { text: 'Add Blanks', style: 'cancel' },
          {
            text: 'Save As-Is',
            onPress: () => {
              void executeSave(textToSave, [])
            },
          },
        ],
      )
      return
    }

    await executeSave(textToSave, draft.answers)
  }

  const executeSave = async (paragraph: string, answers: typeof draft.answers): Promise<void> => {
    if (!targetSetId) return
    setIsSaving(true)
    try {
      const answerInputs: AnswerInput[] = answers.map((a) => ({
        startOffset: a.startOffset,
        endOffset: a.endOffset,
        ...(a.altAnswers && a.altAnswers.length > 0 ? { altAnswers: a.altAnswers } : {}),
      }))

      await createCardOfflineAware(targetSetId, {
        paragraph,
        answers: answerInputs,
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardKeys.list(targetSetId) }),
        queryClient.invalidateQueries({ queryKey: setKeys.detail(targetSetId) }),
        queryClient.invalidateQueries({ queryKey: setKeys.all }),
        queryClient.invalidateQueries({ queryKey: studyKeys.all }),
      ])

      setIsSaving(false)
      onCardSaved?.(1)
      onClose()
    } catch (err) {
      console.warn('[quick-card-modal] save error:', err)
      setIsSaving(false)
      Alert.alert('Save Failed', 'Could not save card to your study set. Please try again.')
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3">
          <View className="flex-row items-center gap-2.5 flex-1 mr-2">
            <View className="h-8 w-8 rounded-xl bg-primary/10 items-center justify-center">
              <SparklesIcon color={primary} size={18} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-foreground">Generate Study Card</Text>
              <View className="flex-row items-center gap-1 mt-0.5">
                <DocumentIcon color={mutedForeground} size={11} />
                <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
                  {sourceFileName || 'PDF Document'}
                  {pageNumber ? ` · Page ${pageNumber}` : ''}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={onClose}
            className="h-8 w-8 items-center justify-center rounded-md active:opacity-60"
            accessibilityLabel="Close"
          >
            <CloseIcon color={mutedForeground} size={20} />
          </Pressable>
        </View>

        {isSaving ? (
          <View className="flex-1 items-center justify-center bg-background gap-3">
            <ActivityIndicator size="large" color={primary} />
            <Text className="text-sm font-medium text-foreground">
              Saving card to study set (offline ready)…
            </Text>
          </View>
        ) : isPickingSet || !targetSetId ? (
          <View className="flex-1 bg-background">
            <View className="border-b border-border bg-surface px-4 py-3 flex-row items-center justify-between">
              <View>
                <Text className="text-base font-bold text-foreground">Choose Destination Set</Text>
                <Text className="text-xs text-muted-foreground">
                  Select which study set to add this card to:
                </Text>
              </View>
              {targetSetId ? (
                <Button
                  label="Done"
                  variant="ghost"
                  size="md"
                  onPress={() => setIsPickingSet(false)}
                />
              ) : null}
            </View>
            <ScrollView contentContainerClassName="p-4 pb-12">
              <SetList
                parent={null}
                emptyText="You have no study sets yet. Create one above to get started."
                onPick={(set) => {
                  setTargetSetId(set.id)
                  setIsPickingSet(false)
                }}
              />
            </ScrollView>
          </View>
        ) : (
          <View className="flex-1 justify-between">
            {/* Target Set Selector Strip */}
            <View className="px-4 py-2 bg-surface-muted/60 border-b border-border flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5 flex-1 mr-2">
                <FolderIcon color={primary} size={14} />
                <Text className="text-xs text-muted-foreground">Target Set:</Text>
                <Text numberOfLines={1} className="text-xs font-bold text-foreground flex-1">
                  {activeSet?.title || 'Selected Set'}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsPickingSet(true)}
                className="px-2.5 py-1 rounded-md bg-surface border border-border active:opacity-75"
              >
                <Text className="text-xs font-semibold text-primary">Change</Text>
              </Pressable>
            </View>

            {/* Editor Body */}
            <ScrollView className="flex-1 p-4" contentContainerClassName="pb-6">
              <View className="mb-3">
                <Text className="text-xs text-muted-foreground leading-4">
                  💡 <Text className="font-semibold text-foreground">Tip:</Text> Tap words in
                  highlight mode to create fill-in-the-blank questions, or toggle{' '}
                  <Text className="font-semibold text-foreground">Enumeration</Text> to convert
                  lists into enumeration cards!
                </Text>
              </View>

              <HighlightEditor draft={draft} />
            </ScrollView>

            {/* Bottom Actions */}
            <View className="border-t border-border bg-surface px-4 py-3 flex-row items-center justify-between gap-2">
              <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
              <Button
                label="Save Card ✓"
                size="md"
                onPress={() => {
                  void handleSaveCard()
                }}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

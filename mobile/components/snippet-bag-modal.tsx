import { useState, type ReactElement } from 'react'
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './button'
import { Card } from './card'
import { CloseIcon, DocumentIcon, PencilIcon, ShoppingBagIcon, TrashIcon } from './icons'
import { useSnippetBagStore } from '../stores/snippet-bag'
import { useTokenColor } from '../stores/theme'

interface SnippetBagModalProps {
  visible: boolean
  onClose: () => void
}

export function SnippetBagModal({ visible, onClose }: SnippetBagModalProps): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const snippets = useSnippetBagStore((s) => s.snippets)
  const removeSnippet = useSnippetBagStore((s) => s.removeSnippet)
  const updateSnippetText = useSnippetBagStore((s) => s.updateSnippetText)
  const clearBag = useSnippetBagStore((s) => s.clearBag)

  const primary = useTokenColor('--primary')
  const mutedForeground = useTokenColor('--muted-foreground')
  const danger = useTokenColor('--danger')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const handleStartEdit = (id: string, currentText: string): void => {
    setEditingId(id)
    setEditText(currentText)
  }

  const handleSaveEdit = (id: string): void => {
    if (editText.trim().length === 0) {
      Alert.alert('Empty Snippet', 'Snippet text cannot be completely empty.')
      return
    }
    updateSnippetText(id, editText.trim())
    setEditingId(null)
    setEditText('')
  }

  const handleClearAll = (): void => {
    Alert.alert(
      'Clear Study Bag?',
      'Are you sure you want to remove all bagged snippets from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearBag()
          },
        },
      ],
    )
  }

  const handleProceedToCreateCards = (): void => {
    if (snippets.length === 0) return
    onClose()
    router.push('/files/bag-studio')
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3.5">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 rounded-xl bg-primary/10 items-center justify-center">
              <ShoppingBagIcon color={primary} size={20} />
            </View>
            <View>
              <View className="flex-row items-center gap-2">
                <Text className="text-base font-bold text-foreground">Study Bag</Text>
                <View className="rounded-full bg-primary/15 px-2 py-0.5">
                  <Text className="text-[11px] font-bold text-primary">{snippets.length}</Text>
                </View>
              </View>
              <Text className="text-[11px] text-muted-foreground">
                Bagged words & paragraphs from Word documents
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {snippets.length > 0 && (
              <Pressable
                onPress={handleClearAll}
                className="px-2 py-1 rounded-md active:opacity-60"
                accessibilityLabel="Clear all snippets"
              >
                <Text className="text-xs font-semibold text-rose-500 dark:text-rose-400">
                  Clear
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-md active:opacity-60"
              accessibilityLabel="Close"
            >
              <CloseIcon color={mutedForeground} size={20} />
            </Pressable>
          </View>
        </View>

        {/* Content Body */}
        {snippets.length === 0 ? (
          <View className="flex-1 items-center justify-center p-6">
            <Card
              tone="dashed"
              className="p-8 items-center justify-center gap-3 text-center max-w-sm"
            >
              <View className="h-16 w-16 rounded-2xl bg-surface-muted items-center justify-center mb-1">
                <ShoppingBagIcon color={mutedForeground} size={32} />
              </View>
              <Text className="text-base font-bold text-foreground text-center">
                Your Bag is Empty
              </Text>
              <Text className="text-xs text-muted-foreground text-center leading-5">
                Open any Word (.docx or .doc) document in the repository, then select words or
                paragraphs to bag them into your study cart.
              </Text>
              <Text className="text-[11px] text-muted-foreground/80 text-center italic mt-1">
                Note: PDF files are excluded from snippet bagging.
              </Text>
              <Button
                label="Back to Documents"
                variant="outline"
                className="mt-2"
                onPress={onClose}
              />
            </Card>
          </View>
        ) : (
          <ScrollView className="flex-1 p-4" contentContainerClassName="gap-3 pb-8">
            <Text className="text-xs text-muted-foreground font-medium px-1">
              Review and curate your bagged snippets before converting them to flashcards:
            </Text>

            {snippets.map((snippet, index) => {
              const isEditing = editingId === snippet.id
              const wordsCount = snippet.text.trim().split(/\s+/).filter(Boolean).length

              return (
                <Card key={snippet.id} className="p-4 bg-surface border border-border gap-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2 flex-1 mr-2">
                      <DocumentIcon color={primary} size={15} />
                      <Text
                        numberOfLines={1}
                        className="text-xs font-semibold text-foreground flex-1"
                      >
                        {snippet.fileName}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <View className="rounded px-1.5 py-0.5 bg-surface-muted border border-border/60">
                        <Text className="text-[10px] text-muted-foreground">
                          Item #{index + 1} · {wordsCount} {wordsCount === 1 ? 'word' : 'words'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeSnippet(snippet.id)}
                        className="p-1 active:opacity-60"
                        accessibilityLabel="Delete snippet"
                      >
                        <TrashIcon color={danger} size={16} />
                      </Pressable>
                    </View>
                  </View>

                  {isEditing ? (
                    <View className="gap-2.5 mt-1">
                      <TextInput
                        value={editText}
                        onChangeText={setEditText}
                        multiline
                        autoFocus
                        className="rounded-xl border border-primary bg-background p-3 text-sm text-foreground min-h-[90px]"
                        style={{ textAlignVertical: 'top' }}
                      />
                      <View className="flex-row justify-end gap-2">
                        <Button
                          label="Cancel"
                          variant="ghost"
                          size="md"
                          onPress={() => setEditingId(null)}
                        />
                        <Button label="Save" size="md" onPress={() => handleSaveEdit(snippet.id)} />
                      </View>
                    </View>
                  ) : (
                    <View className="gap-2">
                      <Text className="text-sm text-foreground leading-6">{snippet.text}</Text>
                      <View className="flex-row items-center justify-end">
                        <Pressable
                          onPress={() => handleStartEdit(snippet.id, snippet.text)}
                          className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-muted active:opacity-75"
                        >
                          <PencilIcon color={mutedForeground} size={13} />
                          <Text className="text-xs text-muted-foreground font-medium">
                            Edit text
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </Card>
              )
            })}
          </ScrollView>
        )}

        {/* Footer Checkout Action */}
        {snippets.length > 0 && (
          <View className="border-t border-border bg-surface px-4 py-3 gap-2">
            <Button
              label={`Proceed to Card Creation (${snippets.length} ${snippets.length === 1 ? 'item' : 'items'}) →`}
              onPress={handleProceedToCreateCards}
            />
          </View>
        )}
      </View>
    </Modal>
  )
}

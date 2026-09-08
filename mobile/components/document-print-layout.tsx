import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native'
import {
  ANSWERS_MAX_PER_CARD,
  assignOrdinals,
  createAnswer,
  enhanceOcrText,
  type DraftAnswer,
} from '@saulado/shared'
import {
  compileEnumeration,
  isEnumeratedQuestion,
  parseEnumeration,
  stripBulletMarker,
} from '../lib/enumeration'
import { Button } from './button'
import { HighlightSurface } from './highlight-surface'
import { EditIcon, SparklesIcon, RotateCwIcon, FileTextIcon } from './icons'
import { useTokenColor } from '../stores/theme'

interface DocumentPrintLayoutProps {
  initialText: string
  onSaveCards: (cards: { paragraph: string; answers: DraftAnswer[] }[]) => void
  onScanAgain: () => void
  title?: string
  isSaving?: boolean
  initialMode?: 'edit' | 'highlight'
  scanAgainLabel?: string
}

/** Commonly missed symbols that users can insert with one tap */
const QUICK_SYMBOLS = [
  { label: '•', value: '• ', title: 'Bullet' },
  { label: '—', value: '—', title: 'Em Dash' },
  { label: '→', value: '→', title: 'Arrow' },
  { label: '±', value: '±', title: 'Plus-Minus' },
  { label: '²', value: '²', title: 'Squared' },
  { label: '³', value: '³', title: 'Cubed' },
  { label: '°', value: '°', title: 'Degree' },
  { label: '≈', value: '≈', title: 'Approx' },
  { label: '≠', value: '≠', title: 'Not Equal' },
  { label: '≤', value: '≤', title: 'Less or Equal' },
  { label: '≥', value: '≥', title: 'Greater or Equal' },
  { label: '℃', value: '℃', title: 'Celsius' },
  { label: 'π', value: 'π', title: 'Pi' },
  { label: '✓', value: '✓', title: 'Check' },
]

export function DocumentPrintLayout({
  initialText,
  onSaveCards,
  onScanAgain,
  title = 'Scanned Document',
  isSaving = false,
  initialMode,
  scanAgainLabel = 'Scan another page',
}: DocumentPrintLayoutProps): ReactElement {
  const [text, setText] = useState(initialText)
  const [isEditingFullDoc, setIsEditingFullDoc] = useState(
    initialText.trim().length === 0 || initialMode === 'edit',
  )
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)
  const [editingQuestionText, setEditingQuestionText] = useState('')
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, DraftAnswer[]>>({})
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: text.length,
    end: text.length,
  })
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  const fullInputRef = useRef<TextInput>(null)
  const mutedForeground = useTokenColor('--muted-foreground')
  const primary = useTokenColor('--primary')

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true)
      setKeyboardHeight(e.endCoordinates.height)
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false)
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  // Split document into question blocks via line jump spaces (\n\n)
  const questions = text
    .split(/\n\s*\n+/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0)

  const wordsCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const totalBlanks = Object.values(questionAnswers).reduce((sum, list) => sum + list.length, 0)

  const selStart = Math.min(selection.start, selection.end)
  const selEnd = Math.max(selection.start, selection.end)
  const hasSelection = selEnd > selStart

  function updateText(newText: string): void {
    setText(newText)
    // Clear out answers if entire text modified
    setQuestionAnswers({})
  }

  function handleInsertSymbol(symbol: string): void {
    if (editingQuestionIndex !== null) {
      setEditingQuestionText((prev) => prev + symbol)
      return
    }

    const start = selection.start ?? text.length
    const end = selection.end ?? text.length
    const updated = text.slice(0, start) + symbol + text.slice(end)
    updateText(updated)

    const nextCursor = start + symbol.length
    setSelection({ start: nextCursor, end: nextCursor })
  }

  function handleFormatClean(): void {
    const formatted = enhanceOcrText(text)
    updateText(formatted)
  }

  function handleReset(): void {
    updateText(initialText)
    setEditingQuestionIndex(null)
    setEditingQuestionText('')
    setIsEditingFullDoc(initialText.trim().length === 0)
  }

  /**
   * Creates an Enumerated Card from the user's dragged/selected text:
   * 1. Strips any leading 1., 2., 3., etc. from the notes to avoid duplicate numbers.
   * 2. Automatically isolates this card from previous and subsequent paragraphs (with \n\n)
   *    so the next paragraph of notes is NOT included in this enumeration card.
   * 3. Automatically highlights all enumerated notes in the highlights section.
   * 4. Closes full doc editor so the user sees the highlighted card immediately.
   */
  function handleCreateEnumerationCardFromSelection(): void {
    if (!hasSelection) return

    const rawChunk = text.slice(selStart, selEnd).trim()
    if (!rawChunk) return

    // 1. Parse the selected chunk into title and items
    const parsed = parseEnumeration(rawChunk)
    // Strip bullet / number markers (1., 2., 3., etc.) from each item
    const cleanItems = parsed.items
      .map((item) => stripBulletMarker(item))
      .filter((item) => item.length > 0)

    // 2. Compile into clean card paragraph without duplicated numbers (includeNumberPrefix = false)
    const compiled = compileEnumeration(parsed.title, cleanItems, { includeNumberPrefix: false })
    const formattedCardParagraph = compiled.paragraph

    // 3. Separate from previous and next paragraphs so they are not included in this card
    const beforeText = text.slice(0, selStart).trimEnd()
    const afterText = text.slice(selEnd).trimStart()

    const parts: string[] = []
    if (beforeText.length > 0) {
      parts.push(beforeText)
    }
    parts.push(formattedCardParagraph)
    if (afterText.length > 0) {
      parts.push(afterText)
    }

    const updatedDocumentText = parts.join('\n\n')

    // 4. Determine the question index of this newly created card in the document
    const beforeQuestionsCount =
      beforeText.length > 0
        ? beforeText.split(/\n\s*\n+/).filter((q) => q.trim().length > 0).length
        : 0
    const targetQuestionIndex = beforeQuestionsCount

    // 5. Generate blanks for the enumerated notes
    const targetBlanks = compiled.blanks.slice(0, ANSWERS_MAX_PER_CARD)
    const generatedAnswers = targetBlanks.map((b) =>
      createAnswer(formattedCardParagraph, b.startOffset, b.endOffset),
    )

    // 6. Update text and answers state
    setText(updatedDocumentText)
    setQuestionAnswers((prev) => ({
      ...prev,
      [targetQuestionIndex]: generatedAnswers,
    }))

    // 7. Clear selection
    const newCursor = (beforeText ? beforeText.length + 2 : 0) + formattedCardParagraph.length
    setSelection({ start: newCursor, end: newCursor })

    // 8. Dismiss keyboard and show the live highlighted cards
    Keyboard.dismiss()
    setIsEditingFullDoc(false)
  }

  function handleConvertSelectionToEnumeration(): void {
    if (hasSelection) {
      handleCreateEnumerationCardFromSelection()
    } else {
      // No active selection range: format the paragraph block containing the cursor
      if (text.trim().length === 0) {
        updateText('Topic:\n1. \n2. \n3. ')
        return
      }

      const cursor = selStart
      const beforeCursor = text.slice(0, cursor)
      const afterCursor = text.slice(cursor)

      const blockStart = beforeCursor.lastIndexOf('\n\n')
      const effectiveStart = blockStart === -1 ? 0 : blockStart + 2

      const nextBlockIndex = afterCursor.indexOf('\n\n')
      const effectiveEnd = nextBlockIndex === -1 ? text.length : cursor + nextBlockIndex

      const currentBlock = text.slice(effectiveStart, effectiveEnd).trim()

      if (currentBlock.length > 0) {
        const parsed = parseEnumeration(currentBlock)
        const cleanItems = parsed.items
          .map((item) => stripBulletMarker(item))
          .filter((item) => item.length > 0)
        const compiled = compileEnumeration(parsed.title, cleanItems, {
          includeNumberPrefix: false,
        })
        const updated =
          text.slice(0, effectiveStart) + compiled.paragraph + text.slice(effectiveEnd)
        updateText(updated)

        const nextCursor = effectiveStart + compiled.paragraph.length
        setSelection({ start: nextCursor, end: nextCursor })
      } else {
        const template = 'Topic:\nNote 1\nNote 2\nNote 3'
        const updated = text.slice(0, cursor) + template + text.slice(cursor)
        updateText(updated)
        setSelection({ start: cursor + template.length, end: cursor + template.length })
      }
    }
  }

  function handleStartEditingQuestion(index: number): void {
    setEditingQuestionIndex(index)
    setEditingQuestionText(questions[index] ?? '')
    setIsEditingFullDoc(false)
  }

  function handleDoneEditing(): void {
    Keyboard.dismiss()

    // 1. If currently editing a single question inline:
    if (editingQuestionIndex !== null) {
      const idx = editingQuestionIndex
      const updatedQuestions = [...questions]
      let newParagraph = editingQuestionText.trim()

      let newAnswers = questionAnswers[idx] ?? []
      if (isEnumeratedQuestion(newParagraph)) {
        const parsed = parseEnumeration(newParagraph)
        const cleanItems = parsed.items
          .map((item) => stripBulletMarker(item))
          .filter((item) => item.length > 0)

        if (cleanItems.length > 0) {
          const compiled = compileEnumeration(parsed.title, cleanItems, {
            includeNumberPrefix: false,
          })
          newParagraph = compiled.paragraph

          // If this question had no blanks, auto-blank the clean notes
          if (newAnswers.length === 0 && compiled.blanks.length > 0) {
            const targetBlanks = compiled.blanks.slice(0, ANSWERS_MAX_PER_CARD)
            newAnswers = targetBlanks.map((b) =>
              createAnswer(compiled.paragraph, b.startOffset, b.endOffset),
            )
          }
        }
      }

      if (newParagraph.length > 0) {
        updatedQuestions[idx] = newParagraph
      } else {
        updatedQuestions.splice(idx, 1)
      }

      setText(updatedQuestions.join('\n\n'))
      setQuestionAnswers((prev) => ({
        ...prev,
        [idx]: newAnswers,
      }))
      setEditingQuestionIndex(null)
      setEditingQuestionText('')
      return
    }

    // 2. If editing full document:
    const currentQuestions = text
      .split(/\n\s*\n+/)
      .map((q) => q.trim())
      .filter((q) => q.length > 0)

    const updatedParagraphs = [...currentQuestions]
    const updatedAnswers: Record<number, DraftAnswer[]> = { ...questionAnswers }
    let hasTextChanges = false

    // Only auto-blank questions that are formatted as enumerations and don't already have answers
    currentQuestions.forEach((paragraph, index) => {
      if (updatedAnswers[index] && updatedAnswers[index].length > 0) {
        return
      }

      if (isEnumeratedQuestion(paragraph)) {
        const parsed = parseEnumeration(paragraph)
        const cleanItems = parsed.items
          .map((item) => stripBulletMarker(item))
          .filter((item) => item.length > 0)

        if (cleanItems.length > 0) {
          const compiled = compileEnumeration(parsed.title, cleanItems, {
            includeNumberPrefix: false,
          })
          if (compiled.blanks.length > 0) {
            updatedParagraphs[index] = compiled.paragraph
            hasTextChanges = true

            const targetBlanks = compiled.blanks.slice(0, ANSWERS_MAX_PER_CARD)
            updatedAnswers[index] = targetBlanks.map((b) =>
              createAnswer(compiled.paragraph, b.startOffset, b.endOffset),
            )
          }
        }
      }
    })

    if (hasTextChanges) {
      setText(updatedParagraphs.join('\n\n'))
    }

    setQuestionAnswers(updatedAnswers)
    setIsEditingFullDoc(false)
  }

  function handleSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>): void {
    setSelection(e.nativeEvent.selection)
  }

  function handleAddBlank(
    questionIndex: number,
    paragraphText: string,
    range: { startOffset: number; endOffset: number },
  ): void {
    const current = questionAnswers[questionIndex] ?? []
    const newAnswer = createAnswer(paragraphText, range.startOffset, range.endOffset)
    setQuestionAnswers((prev) => ({
      ...prev,
      [questionIndex]: [...current, newAnswer],
    }))
  }

  function handleRemoveBlank(questionIndex: number, ordinal: number): void {
    const current = questionAnswers[questionIndex] ?? []
    const assigned = assignOrdinals(current)
    const target = assigned.find((a) => a.ordinal === ordinal)
    if (target === undefined) return

    setQuestionAnswers((prev) => ({
      ...prev,
      [questionIndex]: current.filter((a) => a.startOffset !== target.startOffset),
    }))
  }

  function handleCommitCards(): void {
    const validCards = questions
      .map((paragraph, index) => ({
        paragraph,
        answers: questionAnswers[index] ?? [],
      }))
      .filter((card) => card.answers.length > 0)

    if (validCards.length > 0) {
      onSaveCards(validCards)
    }
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Top Header Bar */}
        <View className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3">
          <View className="flex-row items-center gap-2">
            <FileTextIcon color={primary} size={20} />
            <View>
              <Text className="text-base font-bold text-foreground" numberOfLines={1}>
                {title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {`${String(questions.length)} ${questions.length === 1 ? 'question' : 'questions'} • ${String(totalBlanks)} blanks • ${String(wordsCount)} words`}
              </Text>
            </View>
          </View>

          {/* Quick Actions in Header */}
          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={() => {
                setIsEditingFullDoc((prev) => !prev)
                setEditingQuestionIndex(null)
              }}
              className={`flex-row items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 ${
                isEditingFullDoc ? 'bg-primary/20 border-primary/50' : 'bg-background'
              }`}
            >
              <EditIcon color={isEditingFullDoc ? primary : mutedForeground} size={14} />
              <Text
                className={`text-xs font-semibold ${
                  isEditingFullDoc ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {isEditingFullDoc ? 'Hide Editor' : 'Paste Notes'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleFormatClean}
              className="flex-row items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 active:bg-surface"
            >
              <SparklesIcon color={mutedForeground} size={13} />
              <Text className="text-xs text-muted-foreground">Clean</Text>
            </Pressable>

            <Pressable
              onPress={handleReset}
              className="rounded-lg border border-border bg-background p-1.5 active:bg-surface"
            >
              <RotateCwIcon color={mutedForeground} size={14} />
            </Pressable>
          </View>
        </View>

        {/* Scrollable Content: Unified Notes Editor + Question Cards */}
        <ScrollView
          contentContainerStyle={{
            paddingBottom: isKeyboardVisible ? keyboardHeight + 80 : 32,
          }}
          contentContainerClassName="gap-4 p-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* 1. Full Document / Notes Paste Section (Collapsible / Accordion) */}
          {(isEditingFullDoc || questions.length === 0) && (
            <View className="overflow-hidden rounded-xl border border-primary/40 bg-[#16171b] shadow-2xl">
              <View className="flex-row items-center justify-between border-b border-border/40 bg-[#1b1d22] px-4 py-2.5">
                <View className="flex-row items-center gap-2">
                  <SparklesIcon color={primary} size={15} />
                  <Text className="text-xs font-bold uppercase tracking-wider text-primary">
                    Pasted Notes & Document Editor
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={handleConvertSelectionToEnumeration}
                    className={`flex-row items-center gap-1 rounded px-2 py-1 ${
                      hasSelection ? 'bg-primary/20' : 'active:bg-surface'
                    }`}
                  >
                    <Text className="text-xs font-semibold text-primary">
                      {hasSelection ? '✨ 1.2.3. Enum Selection' : '+ 1.2.3. Template'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="p-4 gap-3">
                {questions.length === 0 && (
                  <Text className="text-xs leading-5 text-muted-foreground">
                    Paste lecture summaries, outlines, or textbook passages below. Leave an empty
                    line (press Enter twice) to split notes into separate Question cards.
                  </Text>
                )}

                <TextInput
                  ref={fullInputRef}
                  value={text}
                  onChangeText={updateText}
                  onSelectionChange={handleSelectionChange}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  className="min-h-[160px] text-base leading-7 text-foreground font-normal"
                  placeholder="Paste or type notes here. Press Enter twice to create separate Questions..."
                  placeholderTextColor={mutedForeground}
                />

                {/* Quick Symbol Inserter Bar */}
                <View className="border-t border-border/40 pt-2.5">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="flex-row gap-1.5 py-0.5"
                  >
                    {QUICK_SYMBOLS.map((s) => (
                      <Pressable
                        key={s.label}
                        onPress={() => handleInsertSymbol(s.value)}
                        className="h-8 min-w-[32px] items-center justify-center rounded-lg border border-border bg-background px-2 active:bg-primary/20"
                      >
                        <Text className="text-xs font-semibold text-foreground">{s.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
          )}

          {/* 2. Questions List with Merged Edit & Live Highlighting */}
          {questions.length > 0 && (
            <View className="gap-4">
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Reviewer Cards ({questions.length})
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  Tap text to blank • Tap edit to modify
                </Text>
              </View>

              {questions.map((paragraph, index) => {
                const isEditingThis = editingQuestionIndex === index
                const currentAnswers = assignOrdinals(questionAnswers[index] ?? [])
                const isEnum = isEnumeratedQuestion(paragraph)

                return (
                  <View
                    key={index}
                    className="overflow-hidden rounded-xl border border-border/80 bg-[#16171b] shadow-lg"
                  >
                    {/* Card Header with Question Badge and Inline Edit Toggle */}
                    <View className="flex-row items-center justify-between border-b border-border/40 bg-[#1b1d22] px-4 py-2.5">
                      <View className="flex-row items-center gap-2">
                        <View className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5">
                          <Text className="text-[10px] font-bold tracking-wider text-primary uppercase">
                            {`QUESTION ${String(index + 1)}`}
                          </Text>
                        </View>
                        <Text className="text-xs font-medium text-muted-foreground">
                          {`${String(currentAnswers.length)} ${currentAnswers.length === 1 ? 'blank' : 'blanks'}`}
                        </Text>
                        {isEnum && (
                          <View className="rounded bg-surface px-1.5 py-0.5">
                            <Text className="text-[10px] text-muted-foreground">1.2.3. Enum</Text>
                          </View>
                        )}
                      </View>

                      {/* Edit / Done Toggle Button on Card Header */}
                      <View className="flex-row items-center gap-1.5">
                        {isEditingThis ? (
                          <Pressable
                            onPress={handleDoneEditing}
                            className="flex-row items-center gap-1 rounded-md bg-primary px-2.5 py-1 active:opacity-85 shadow-sm"
                          >
                            <Text className="text-xs font-bold text-primary-foreground">
                              ✓ Done
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => handleStartEditingQuestion(index)}
                            className="flex-row items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 active:bg-surface-muted"
                          >
                            <EditIcon color={mutedForeground} size={12} />
                            <Text className="text-xs font-semibold text-muted-foreground">
                              Edit Text
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* Card Body: Either Inline TextInput or Interactive HighlightSurface */}
                    <View className="p-4">
                      {isEditingThis ? (
                        <View className="gap-2.5">
                          <TextInput
                            value={editingQuestionText}
                            onChangeText={setEditingQuestionText}
                            multiline
                            scrollEnabled={false}
                            textAlignVertical="top"
                            autoFocus
                            className="min-h-[100px] rounded-lg border border-primary/40 bg-background p-3 text-base leading-6 text-foreground"
                            placeholder="Edit question card text..."
                            placeholderTextColor={mutedForeground}
                          />
                          <View className="flex-row items-center justify-between">
                            <Text className="text-[11px] text-muted-foreground">
                              💡 Tap Done when finished to resume highlighting blanks.
                            </Text>
                            <Pressable
                              onPress={() => {
                                setEditingQuestionIndex(null)
                                setEditingQuestionText('')
                              }}
                              className="rounded px-2 py-1 active:bg-surface"
                            >
                              <Text className="text-xs text-muted-foreground">Cancel</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <View className="gap-2">
                          <HighlightSurface
                            paragraph={paragraph}
                            answers={currentAnswers}
                            max={ANSWERS_MAX_PER_CARD}
                            onAddHighlight={(range) => {
                              handleAddBlank(index, paragraph, range)
                            }}
                            onRemoveHighlight={(ordinal) => {
                              handleRemoveBlank(index, ordinal)
                            }}
                          />
                          {currentAnswers.length === 0 && (
                            <Text className="pt-1 text-center text-[11px] text-muted-foreground">
                              💡 Tap or drag words above to create blanks for this card
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>

        {/* Normal Bottom Action Bar (When keyboard is closed) */}
        {!isKeyboardVisible && (
          <View className="gap-2.5 border-t border-border bg-surface p-3 sm:p-4">
            <Button
              label={
                isSaving
                  ? 'Saving cards to set…'
                  : totalBlanks === 0
                    ? 'Highlight at least 1 blank to add cards'
                    : `Add ${String(Object.values(questionAnswers).filter((q) => q.length > 0).length)} Cards to Set (${String(totalBlanks)} blanks) →`
              }
              size="lg"
              disabled={totalBlanks === 0 || isSaving}
              loading={isSaving}
              onPress={handleCommitCards}
            />
            <Button label={scanAgainLabel} variant="ghost" onPress={onScanAgain} />
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Sticky Bar Pinned Directly Above Keyboard (Ensures Done Editing never gets stacked behind keyboard) */}
      {isKeyboardVisible && (
        <View
          style={{
            position: 'absolute',
            bottom: Platform.OS === 'android' ? keyboardHeight : 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            elevation: 25,
          }}
          className="border-t border-border/80 bg-[#1e2029] p-2.5 shadow-2xl"
        >
          {/* If user dragged/selected text in full editor, show quick Enum Card creation right above keyboard! */}
          {hasSelection && isEditingFullDoc && (
            <View className="mb-2 flex-row items-center justify-between rounded-xl border border-primary/40 bg-primary/20 px-3 py-2">
              <View className="flex-1 pr-2">
                <Text className="text-xs font-bold text-foreground">
                  Selected ({String(selEnd - selStart)} chars)
                </Text>
                <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                  Auto-removes 1.2.3. prefixes & highlights notes
                </Text>
              </View>
              <Pressable
                onPress={handleCreateEnumerationCardFromSelection}
                className="rounded-lg bg-primary px-3 py-1.5 active:opacity-85 shadow-sm"
              >
                <Text className="text-xs font-bold text-primary-foreground">
                  ✨ 1.2.3. Enum Card
                </Text>
              </Pressable>
            </View>
          )}

          {/* Sticky Done Editing and Hide Keyboard Actions */}
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => Keyboard.dismiss()}
              className="flex-row items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 active:bg-surface-muted"
            >
              <Text className="text-xs font-semibold text-muted-foreground">⌨️ Hide</Text>
            </Pressable>

            <View className="flex-1">
              <Button
                label={
                  editingQuestionIndex !== null
                    ? `✓ Done Editing Question ${String(editingQuestionIndex + 1)}`
                    : `✓ Done Editing (${String(questions.length)} ${questions.length === 1 ? 'Card' : 'Cards'})`
                }
                size="md"
                onPress={handleDoneEditing}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

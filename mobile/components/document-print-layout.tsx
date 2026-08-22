import { useState, useRef, type ReactElement } from 'react'
import {
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
}: DocumentPrintLayoutProps): ReactElement {
  const [text, setText] = useState(initialText)
  const [mode, setMode] = useState<'edit' | 'highlight'>('highlight')
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, DraftAnswer[]>>({})
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: text.length,
    end: text.length,
  })

  const inputRef = useRef<TextInput>(null)
  const mutedForeground = useTokenColor('--muted-foreground')
  const primary = useTokenColor('--primary')

  // Split document into question blocks via line jump spaces (\n\n)
  const questions = text
    .split(/\n\s*\n+/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0)

  const wordsCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const totalBlanks = Object.values(questionAnswers).reduce((sum, list) => sum + list.length, 0)

  function updateText(newText: string): void {
    setText(newText)
    // Clear out answers if text modified
    setQuestionAnswers({})
  }

  function handleInsertSymbol(symbol: string): void {
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
    // Only import questions that have at least 1 blank, or all questions if user confirmed
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      {/* Top Document Header */}
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

        {/* View Mode Toggle Button: Edit vs Highlight */}
        <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-background p-1">
          <Pressable
            onPress={() => {
              setMode('edit')
              setTimeout(() => {
                inputRef.current?.focus()
              }, 100)
            }}
            className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
              mode === 'edit' ? 'bg-primary/20' : 'bg-transparent'
            }`}
          >
            <EditIcon color={mode === 'edit' ? primary : mutedForeground} size={15} />
            <Text
              className={`text-xs font-semibold ${
                mode === 'edit' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              Edit
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setMode('highlight')
            }}
            className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
              mode === 'highlight' ? 'bg-primary/20' : 'bg-transparent'
            }`}
          >
            <SparklesIcon color={mode === 'highlight' ? primary : mutedForeground} size={15} />
            <Text
              className={`text-xs font-semibold ${
                mode === 'highlight' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              Highlight
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main Document Body */}
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
        {/* Document Print Canvas (Google Docs Dark Paper Style) */}
        <View className="overflow-hidden rounded-xl border border-border/80 bg-[#16171b] shadow-2xl">
          {/* Top Paper Header Accent */}
          <View className="flex-row items-center justify-between border-b border-border/40 bg-[#1b1d22] px-5 py-2.5">
            <Text className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {mode === 'highlight'
                ? 'Print Layout • Highlight Blanks'
                : 'Print Layout • Document Editor'}
            </Text>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleFormatClean}
                className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-surface"
              >
                <SparklesIcon color={mutedForeground} size={14} />
                <Text className="text-xs text-muted-foreground">Clean</Text>
              </Pressable>
              <Pressable
                onPress={handleReset}
                className="flex-row items-center gap-1 rounded px-2 py-1 active:bg-surface"
              >
                <RotateCwIcon color={mutedForeground} size={14} />
                <Text className="text-xs text-muted-foreground">Reset</Text>
              </Pressable>
            </View>
          </View>

          {/* Paper Content Canvas */}
          <View className="min-h-[380px] p-6">
            {mode === 'highlight' ? (
              <View className="gap-5">
                {questions.map((paragraph, index) => {
                  const currentAnswers = assignOrdinals(questionAnswers[index] ?? [])
                  return (
                    <View key={index} className="gap-3">
                      {/* Question Section Divider */}
                      <View className="my-2 flex-row items-center gap-3">
                        <View className="h-px flex-1 bg-border/60" />
                        <View className="flex-row items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-0.5">
                          <Text className="text-[11px] font-bold tracking-widest text-primary uppercase">
                            {`QUESTION ${String(index + 1)}`}
                          </Text>
                        </View>
                        <View className="h-px flex-1 bg-border/60" />
                      </View>

                      {/* Embedded Highlighting Surface for this Question */}
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
                    </View>
                  )
                })}

                <View className="mt-2 rounded-lg bg-surface/50 p-3">
                  <Text className="text-center text-xs text-muted-foreground">
                    💡 Tap or drag words above to create blanks for each Question. To split or add
                    questions, switch to Edit mode and leave an empty line.
                  </Text>
                </View>
              </View>
            ) : (
              <View className="gap-3">
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={updateText}
                  onSelectionChange={handleSelectionChange}
                  multiline
                  scrollEnabled={false}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  className="min-h-[300px] text-base leading-7 text-foreground font-normal"
                  placeholder="Edit your scanned notes here. Press Enter twice to split into separate Questions..."
                  placeholderTextColor={mutedForeground}
                />
                <View className="rounded-lg bg-surface/40 p-2.5">
                  <Text className="text-xs text-muted-foreground">
                    💡 <Text className="font-semibold text-foreground">Tip:</Text> Leave a blank row
                    (press Enter twice) to create Question 1, Question 2, Question 3, etc.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Quick Symbol Inserter Bar (Shown in Edit Mode) */}
        {mode === 'edit' && (
          <View className="gap-2 rounded-xl border border-border bg-surface p-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Quick Symbol Inserter
              </Text>
              <Text className="text-[11px] text-muted-foreground">Tap to insert at cursor</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="flex-row gap-1.5 py-1"
            >
              {QUICK_SYMBOLS.map((s) => (
                <Pressable
                  key={s.label}
                  onPress={() => {
                    handleInsertSymbol(s.value)
                  }}
                  className="h-9 min-w-[36px] items-center justify-center rounded-lg border border-border bg-background px-2.5 active:bg-primary/20 active:border-primary"
                >
                  <Text className="text-sm font-semibold text-foreground">{s.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="gap-3 border-t border-border bg-surface p-4">
        {mode === 'highlight' ? (
          <>
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
            <Button
              label="Switch to Edit Mode"
              variant="outline"
              onPress={() => {
                setMode('edit')
                setTimeout(() => {
                  inputRef.current?.focus()
                }, 100)
              }}
            />
          </>
        ) : (
          <>
            <Button
              label={`Done Editing → Highlight Blanks (${String(questions.length)} ${questions.length === 1 ? 'Question' : 'Questions'})`}
              size="lg"
              disabled={questions.length === 0}
              onPress={() => {
                setMode('highlight')
              }}
            />
            <Button label="Scan another page" variant="ghost" onPress={onScanAgain} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

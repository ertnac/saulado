import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  ANSWERS_MAX_PER_CARD,
  codePointLength,
  codeUnitToCodePoint,
  PARAGRAPH_MAX_CODE_POINTS,
  snapToWordBoundaries,
  type DraftAnswer,
} from '@saulado/shared'
import { compileEnumeration, parseEnumeration } from '../lib/enumeration'
import type { CardDraftActions, CardDraftState } from '../hooks/useCardDraft'
import { useTokenColor } from '../stores/theme'
import { Button } from './button'
import { HighlightSurface } from './highlight-surface'
import { AlertIcon } from './icons'

/**
 * Compose, highlight, preview — a port of
 * `frontend/src/features/cards/HighlightEditor.tsx`.
 *
 * The two modes are the same two, and for the same reason: a `TextInput` cannot
 * render styled spans, so composing and highlighting happen on different
 * elements and the mode switch is the commit boundary where the paragraph is
 * normalized and the answers are re-anchored.
 *
 * State-agnostic on purpose. It takes {@link useCardDraft}'s state and actions as
 * props rather than owning them, so the create and edit flows share one editor
 * and one state machine instead of two of each.
 */

export function HighlightEditor({
  draft,
}: {
  draft: CardDraftState & CardDraftActions
}): ReactElement {
  const {
    paragraph,
    draftText,
    answers,
    orphaned,
    setDraftText,
    commitParagraph,
    addHighlight,
    setHighlights,
    removeHighlight,
    dismissOrphans,
  } = draft

  const placeholder = useTokenColor('--muted-foreground')
  const length = codePointLength(draftText)
  const overLimit = length > PARAGRAPH_MAX_CODE_POINTS

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isEnumerationMode, setIsEnumerationMode] = useState(false)
  const [enumTitle, setEnumTitle] = useState('')
  const [enumItems, setEnumItems] = useState<string[]>(['', '', ''])
  const [selectionPopup, setSelectionPopup] = useState<{
    start: number
    end: number
    text: string
  } | null>(null)

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
      }
    }
  }, [])

  const applySelectionAsBlank = (start: number, end: number): void => {
    const raw = draftText.slice(start, end)
    const trimmed = raw.trim()
    if (trimmed.length === 0) return

    const leadingSpaces = raw.length - raw.trimStart().length
    const actualStart = start + leadingSpaces
    const actualEnd = actualStart + trimmed.length

    let startOffset = codeUnitToCodePoint(draftText, actualStart)
    let endOffset = codeUnitToCodePoint(draftText, actualEnd)

    // Snapping outward to word boundaries ensures hold/drag captures complete words
    const snapped = snapToWordBoundaries(paragraph, startOffset, endOffset)
    startOffset = snapped.startOffset
    endOffset = snapped.endOffset

    if (startOffset >= endOffset) return

    // 1. Exact match with an existing blank: toggle off
    const exactMatch = answers.find(
      (a) => a.startOffset === startOffset && a.endOffset === endOffset,
    )
    if (exactMatch) {
      removeHighlight(exactMatch.ordinal)
      return
    }

    // 2. Double-tap on a single word inside an existing multi-word blank: toggle off that blank
    const isSingleWord = !/\s/.test(trimmed)
    if (isSingleWord) {
      const enclosingMatch = answers.find(
        (a) => a.startOffset <= startOffset && a.endOffset >= endOffset,
      )
      if (enclosingMatch) {
        removeHighlight(enclosingMatch.ordinal)
        return
      }
    }

    // 3. Otherwise add highlight (single word if double-tapped, multi-word if dragged)
    addHighlight({ startOffset, endOffset })
  }

  const handleSelectionChange = (e: {
    nativeEvent: { selection: { start: number; end: number } }
  }): void => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (isTypingRef.current) return

    const { start, end } = e.nativeEvent.selection
    if (start === end) {
      setSelectionPopup(null)
      return
    }

    const sStart = Math.min(start, end)
    const sEnd = Math.max(start, end)
    const raw = draftText.slice(sStart, sEnd).trim()
    if (raw.length > 0) {
      setSelectionPopup({ start: sStart, end: sEnd, text: raw })
    }

    // Debounce to allow user to hold and drag selection handles across multiple words
    debounceTimerRef.current = setTimeout(() => {
      applySelectionAsBlank(sStart, sEnd)
    }, 350)
  }

  const handleTextChange = (text: string): void => {
    isTypingRef.current = true
    setSelectionPopup(null)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
    }
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
    }, 250)

    setDraftText(text)
  }

  const handleToggleEnumerationMode = (): void => {
    if (!isEnumerationMode) {
      const parsed = parseEnumeration(draftText)
      const title = parsed.title
      const items = parsed.items.length > 0 ? parsed.items : ['', '', '']

      setEnumTitle(title)
      setEnumItems(items)
      setIsEnumerationMode(true)

      if (draftText.trim().length > 0) {
        const compiled = compileEnumeration(title, items)
        setDraftText(compiled.paragraph)
        setHighlights(compiled.blanks, compiled.paragraph)
      }
    } else {
      setIsEnumerationMode(false)
    }
  }

  const handleConvertSelectionToEnumeration = (): void => {
    if (!selectionPopup) return
    const textToConvert = selectionPopup.text
    const parsed = parseEnumeration(textToConvert)

    const title = parsed.title
    const items = parsed.items.length > 0 ? parsed.items : ['', '', '']

    setEnumTitle(title)
    setEnumItems(items)
    setIsEnumerationMode(true)

    const compiled = compileEnumeration(title, items)
    setDraftText(compiled.paragraph)
    setHighlights(compiled.blanks, compiled.paragraph)

    setSelectionPopup(null)
  }

  const handleEnumTitleChange = (newTitle: string): void => {
    setEnumTitle(newTitle)
    const compiled = compileEnumeration(newTitle, enumItems)
    setDraftText(compiled.paragraph)
    setHighlights(compiled.blanks, compiled.paragraph)
  }

  const handleEnumItemChange = (index: number, newText: string): void => {
    const nextItems = [...enumItems]
    nextItems[index] = newText
    setEnumItems(nextItems)
    const compiled = compileEnumeration(enumTitle, nextItems)
    setDraftText(compiled.paragraph)
    setHighlights(compiled.blanks, compiled.paragraph)
  }

  const handleAddEnumItem = (): void => {
    const nextItems = [...enumItems, '']
    setEnumItems(nextItems)
  }

  const handleRemoveEnumItem = (index: number): void => {
    if (enumItems.length <= 1) return
    const nextItems = enumItems.filter((_, i) => i !== index)
    setEnumItems(nextItems)
    const compiled = compileEnumeration(enumTitle, nextItems)
    setDraftText(compiled.paragraph)
    setHighlights(compiled.blanks, compiled.paragraph)
  }

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-bold text-foreground">Card Content</Text>
          <Pressable
            onPress={handleToggleEnumerationMode}
            accessibilityRole="button"
            accessibilityLabel="Toggle enumeration mode"
            className={`flex-row items-center gap-1 rounded-full border px-3 py-1 active:opacity-80 ${
              isEnumerationMode ? 'border-primary bg-primary' : 'border-primary/30 bg-primary/10'
            }`}
          >
            <Text
              className={`text-xs font-black ${
                isEnumerationMode ? 'text-primary-foreground' : 'text-primary'
              }`}
            >
              1. 2. 3. Enumeration
            </Text>
          </Pressable>
        </View>

        <Text
          className={`text-xs ${overLimit ? 'font-medium text-warning' : 'text-muted-foreground'}`}
        >
          {length.toLocaleString()} / {PARAGRAPH_MAX_CODE_POINTS.toLocaleString()}
        </Text>
      </View>

      {/* Floating Action Popup when selecting or dragging text */}
      {!isEnumerationMode && selectionPopup !== null && (
        <View className="flex-row items-center justify-between rounded-2xl border border-primary/40 bg-foreground p-2 shadow-xl shadow-black/30">
          <Pressable
            onPress={handleConvertSelectionToEnumeration}
            accessibilityRole="button"
            accessibilityLabel="Format selected text as enumeration"
            className="flex-row items-center gap-2 rounded-xl bg-primary px-3.5 py-2 active:opacity-90"
          >
            <Text className="text-sm">📋</Text>
            <Text className="text-xs font-black text-primary-foreground">
              Format as Enumeration
            </Text>
          </Pressable>
          <View className="mx-2.5 flex-1 overflow-hidden">
            <Text numberOfLines={1} className="text-xs font-medium text-background/80">
              "{selectionPopup.text}"
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectionPopup(null)}
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-full bg-surface-muted/20 active:opacity-70"
          >
            <Text className="text-xs font-bold text-background">✕</Text>
          </Pressable>
        </View>
      )}

      {/* ── Editor Body: Structured Enumeration vs Freeform Paragraph ── */}
      {isEnumerationMode ? (
        <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-primary">
              Structured Enumeration
            </Text>
            <Pressable
              onPress={() => setIsEnumerationMode(false)}
              className="rounded-lg bg-surface-muted px-2.5 py-1 active:opacity-70"
            >
              <Text className="text-xs font-semibold text-foreground">Switch to Paragraph</Text>
            </Pressable>
          </View>

          {/* Dedicated Title input — no movable "Title:" in text */}
          <View className="gap-1">
            <Text className="text-xs font-bold text-muted-foreground">Topic / Question Prompt</Text>
            <TextInput
              value={enumTitle}
              onChangeText={handleEnumTitleChange}
              placeholder="e.g. Three Primary Colors..."
              placeholderTextColor={placeholder}
              className="rounded-xl border border-border bg-surface-muted/30 px-3.5 py-2.5 text-base font-semibold text-foreground"
            />
          </View>

          {/* List of items with fixed, unmovable numbering badges */}
          <View className="gap-2 pt-1">
            <Text className="text-xs font-bold text-muted-foreground">
              Enumerated Notes (Auto-Blanked)
            </Text>
            {enumItems.map((item, index) => (
              <View key={index} className="flex-row items-center gap-2">
                <View className="h-9 w-9 items-center justify-center rounded-xl border border-primary/40 bg-primary/10">
                  <Text className="text-xs font-black text-primary">{index + 1}.</Text>
                </View>

                <TextInput
                  value={item}
                  onChangeText={(text) => handleEnumItemChange(index, text)}
                  placeholder={`Item ${String(index + 1)}...`}
                  placeholderTextColor={placeholder}
                  className="flex-1 rounded-xl border border-border bg-surface-muted/30 px-3.5 py-2 text-base text-foreground"
                />

                {enumItems.length > 1 && (
                  <Pressable
                    onPress={() => handleRemoveEnumItem(index)}
                    hitSlop={8}
                    className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted/40 active:bg-warning/20"
                  >
                    <Text className="text-xs font-bold text-muted-foreground">✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          {/* Add item button */}
          <Pressable
            onPress={handleAddEnumItem}
            className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-2.5 active:bg-primary/10"
          >
            <Text className="text-xs font-black text-primary">+ Add Next Item</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-2">
          <TextInput
            value={draftText}
            onChangeText={handleTextChange}
            onBlur={commitParagraph}
            onSelectionChange={handleSelectionChange}
            accessibilityLabel="Paragraph"
            multiline
            textAlignVertical="top"
            placeholder="Type or paste your notes here..."
            placeholderTextColor={placeholder}
            style={{ fontSize: 17, lineHeight: 28 }}
            className={`min-h-32 rounded-xl border bg-surface p-4 text-foreground ${
              overLimit ? 'border-warning' : 'border-border'
            }`}
          />
          <Text className="text-xs text-muted-foreground">
            Double-tap or drag to blank words. Select text to pop up "Format as Enumeration".
          </Text>
        </View>
      )}

      {/* Active Blanks Badges */}
      {answers.length > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Question Blanks ({answers.length}/{ANSWERS_MAX_PER_CARD})
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {answers.map((ans) => (
              <Pressable
                key={ans.ordinal}
                onPress={() => {
                  removeHighlight(ans.ordinal)
                }}
                className="flex-row items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 active:bg-primary/20"
              >
                <View className="h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Text className="text-[10px] font-black text-primary-foreground">
                    {ans.ordinal + 1}
                  </Text>
                </View>
                <Text className="text-xs font-bold text-foreground">{ans.answerText}</Text>
                <Text className="text-xs text-muted-foreground">✕</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {draftText.trim().length > 0 && !overLimit && (
        <View className="gap-2 mt-2">
          <Text className="text-sm font-bold text-foreground">Tap word to toggle blank</Text>
          <HighlightSurface
            paragraph={paragraph.trim().length > 0 ? paragraph : draftText}
            answers={answers}
            onAddHighlight={addHighlight}
            onRemoveHighlight={removeHighlight}
          />
        </View>
      )}

      <OrphanedNotice orphaned={orphaned} onDismiss={dismissOrphans} />
    </View>
  )
}

/**
 * Tells the user which highlights an edit destroyed.
 *
 * `reanchorAnswers` relocates a highlight by searching for its exact text in the
 * edited paragraph; when the highlighted word itself was rewritten there is
 * nothing to find, and that case is genuinely ambiguous, so the engine escalates
 * rather than guessing. The rule this enforces is that the escalation is
 * *visible* — dropping the highlight silently is the easy path and the wrong one,
 * because the user would discover it missing during a review weeks later with no
 * idea when it went.
 */
function OrphanedNotice({
  orphaned,
  onDismiss,
}: {
  orphaned: readonly DraftAnswer[]
  onDismiss: () => void
}): ReactElement | null {
  const warning = useTokenColor('--warning')
  if (orphaned.length === 0) return null

  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className="gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4"
    >
      {/* Icon as well as the tint — the border colour alone says nothing. */}
      <View className="flex-row items-start gap-1.5">
        <AlertIcon color={warning} size={16} />
        <Text className="flex-1 text-sm font-medium text-warning">
          {orphaned.length === 1
            ? '1 highlight no longer matches your text'
            : `${String(orphaned.length)} highlights no longer match your text`}
        </Text>
      </View>

      <Text className="text-sm text-muted-foreground">
        The words below were edited or removed, so their blanks were dropped. Highlight them again
        if you still want them.
      </Text>

      <View className="flex-row flex-wrap gap-2">
        {orphaned.map((answer, index) => (
          <Text
            key={`${answer.answerText}-${String(index)}`}
            className="rounded-full bg-surface px-3 py-1 text-sm text-foreground"
          >
            {answer.answerText}
          </Text>
        ))}
      </View>

      <Button label="Got it" variant="outline" onPress={onDismiss} className="self-start" />
    </View>
  )
}

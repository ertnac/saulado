import { useState, type ReactElement } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  ANSWERS_MAX_PER_CARD,
  codePointLength,
  codeUnitToCodePoint,
  PARAGRAPH_MAX_CODE_POINTS,
  type DraftAnswer,
} from '@saulado/shared'
import type { CardDraftActions, CardDraftState } from '../hooks/useCardDraft'
import { useTokenColor } from '../stores/theme'
import { Button } from './button'
import { ClozePreview } from './cloze-preview'
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
 *
 * What does not port: `Ctrl/Cmd+H`, Tab-through, and the `snap` prop. There is no
 * hardware keyboard to bind and no free selection to snap — the tap gesture is
 * already word-aligned, which is what `snap` existed to arrange.
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
    removeHighlight,
    dismissOrphans,
  } = draft

  const placeholder = useTokenColor('--muted-foreground')
  const length = codePointLength(draftText)
  const overLimit = length > PARAGRAPH_MAX_CODE_POINTS

  const [activeSelection, setActiveSelection] = useState<{
    start: number
    end: number
    text: string
    rawSelection: string
  } | null>(null)

  const handleSelectionChange = (e: {
    nativeEvent: { selection: { start: number; end: number } }
  }): void => {
    const { start, end } = e.nativeEvent.selection
    if (start !== end) {
      const sStart = Math.min(start, end)
      const sEnd = Math.max(start, end)
      const raw = draftText.slice(sStart, sEnd)
      const trimmed = raw.trim()
      if (trimmed.length > 0) {
        setActiveSelection({
          start: sStart,
          end: sEnd,
          text: trimmed,
          rawSelection: raw,
        })
      }
    }
  }

  const handleTextChange = (text: string): void => {
    setDraftText(text)
    if (activeSelection !== null && !text.includes(activeSelection.text)) {
      setActiveSelection(null)
    }
  }

  const handleMakeBlankFromSelection = (): void => {
    if (activeSelection === null) return

    const { start, rawSelection, text } = activeSelection
    const leadingSpaces = rawSelection.length - rawSelection.trimStart().length
    const actualStart = start + leadingSpaces
    const actualEnd = actualStart + text.length

    // Commit paragraph first so normalized text is up to date
    commitParagraph()

    const startOffset = codeUnitToCodePoint(draftText, actualStart)
    const endOffset = codeUnitToCodePoint(draftText, actualEnd)

    addHighlight({ startOffset, endOffset })
    setActiveSelection(null)
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-lg font-bold text-foreground">Card Content</Text>

        <Text
          className={`text-xs ${overLimit ? 'font-medium text-warning' : 'text-muted-foreground'}`}
        >
          {length.toLocaleString()} / {PARAGRAPH_MAX_CODE_POINTS.toLocaleString()}
        </Text>
      </View>

      {/* Custom Context Menu Floating Bar */}
      {activeSelection !== null && (
        <View className="flex-row items-center justify-between rounded-2xl bg-foreground p-2 shadow-xl shadow-black/30">
          <Pressable
            onPress={handleMakeBlankFromSelection}
            className="flex-row items-center gap-2 rounded-xl bg-primary px-4 py-2.5 active:opacity-90"
          >
            <Text className="text-sm font-black text-primary-foreground">✨ Make a Question</Text>
          </Pressable>
          <View className="mx-2.5 flex-1 overflow-hidden">
            <Text numberOfLines={1} className="text-xs font-medium text-background/80">
              "{activeSelection.text}"
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setActiveSelection(null)
            }}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted/20 active:opacity-70"
          >
            <Text className="text-xs font-bold text-background">✕</Text>
          </Pressable>
        </View>
      )}

      <View className="gap-2">
        <TextInput
          value={draftText}
          onChangeText={handleTextChange}
          onBlur={commitParagraph}
          onSelectionChange={handleSelectionChange}
          contextMenuHidden={true}
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
          Select words above to click "✨ Make a Question", or tap words below to create blanks.
        </Text>
      </View>

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

      <View className="gap-2">
        <Text className="text-sm font-medium text-foreground">
          Preview
          <Text className="font-normal text-muted-foreground">
            {answers.length === 0
              ? '  no blanks yet'
              : `  ${String(answers.length)} of ${String(ANSWERS_MAX_PER_CARD)} blanks`}
          </Text>
        </Text>
        <ClozePreview paragraph={paragraph} answers={answers} />
      </View>
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

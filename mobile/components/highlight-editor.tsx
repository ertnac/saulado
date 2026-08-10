import type { ReactElement } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  ANSWERS_MAX_PER_CARD,
  codePointLength,
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
    mode,
    paragraph,
    draftText,
    answers,
    orphaned,
    setMode,
    setDraftText,
    commitParagraph,
    addHighlight,
    removeHighlight,
    dismissOrphans,
  } = draft

  const placeholder = useTokenColor('--muted-foreground')
  const length = codePointLength(draftText)
  const overLimit = length > PARAGRAPH_MAX_CODE_POINTS

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Editor mode"
          className="flex-row gap-1 rounded-full bg-surface-muted p-1"
        >
          <ModeTab
            label="Write"
            active={mode === 'compose'}
            onPress={() => {
              setMode('compose')
            }}
          />
          <ModeTab
            label="Highlight"
            active={mode === 'highlight'}
            // Nothing to highlight in an empty or over-long paragraph, and
            // committing one would only produce an empty surface.
            disabled={draftText.trim().length === 0 || overLimit}
            onPress={() => {
              commitParagraph()
              setMode('highlight')
            }}
          />
        </View>

        <Text
          className={`text-xs ${overLimit ? 'font-medium text-warning' : 'text-muted-foreground'}`}
        >
          {length.toLocaleString()} / {PARAGRAPH_MAX_CODE_POINTS.toLocaleString()}
        </Text>
      </View>

      {mode === 'compose' ? (
        <View className="gap-2">
          <TextInput
            value={draftText}
            onChangeText={setDraftText}
            // Committing on blur means a user who taps straight to Save still gets
            // their text normalized and their answers re-anchored.
            onBlur={commitParagraph}
            accessibilityLabel="Paragraph"
            multiline
            textAlignVertical="top"
            placeholder="Paste or write the paragraph you want to study, then switch to Highlight."
            placeholderTextColor={placeholder}
            style={{ fontSize: 17, lineHeight: 28 }}
            className={`min-h-40 rounded-md border bg-surface p-4 text-foreground ${
              overLimit ? 'border-warning' : 'border-border'
            }`}
          />
          <Text className="text-xs text-muted-foreground">
            {answers.length > 0
              ? 'Your existing blanks follow their words as you edit. If you delete a highlighted word, you will be told.'
              : 'Write it the way you want to read it back — the context is what makes recall work.'}
          </Text>
        </View>
      ) : (
        <HighlightSurface
          paragraph={paragraph}
          answers={answers}
          onAddHighlight={addHighlight}
          onRemoveHighlight={removeHighlight}
        />
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

function ModeTab({
  label,
  active,
  disabled = false,
  onPress,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onPress: () => void
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      className={`h-9 justify-center rounded-full px-4 ${active ? 'bg-primary' : ''} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Text
        className={`text-sm font-medium ${active ? 'text-primary-foreground' : 'text-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
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

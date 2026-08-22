import { useState, type ReactElement } from 'react'
import { Text, View } from 'react-native'
import { ANSWERS_MAX_PER_CARD, rangesOverlap, type AnswerRange } from '@saulado/shared'
import { spanBetween, toPieces, tokenize, type WordToken } from '../lib/highlight-offsets'
import { useTokenColor } from '../stores/theme'
import { AlertIcon } from './icons'

/**
 * The paragraph the user highlights against — the mobile counterpart of
 * `frontend/src/features/cards/HighlightSurface.tsx`.
 *
 * The web resolves a DOM selection; there is no selection API here, so the
 * gesture is plan §4.1's: tap the first word of the span, tap the last. Tapping
 * one word twice makes a single-word blank. `spanBetween` normalises the order,
 * so bottom-then-top is the same span as top-then-bottom — the user is naming
 * two ends, not a direction.
 *
 * Two things the web gets from CSS and this has to arrange:
 *
 * **The armed word has to be visible.** A two-tap gesture with no feedback after
 * the first tap is indistinguishable from a dead control, so the anchor renders
 * underlined and in the accent colour until the second tap resolves it.
 *
 * **A highlight is one `<Text>`, not one per word.** Rendering from
 * {@link toPieces} rather than from the token list is what keeps a multi-word
 * blank's background continuous across the spaces inside it; only the *plain*
 * runs are tokenized, because only they need per-word press targets.
 *
 * One divergence, deliberate: tapping a highlight removes it, where the web opens
 * a popover offering remove and alternative answers. Alt-answers have no mobile
 * surface yet, and removal is what the popover is mostly used for — the paragraph
 * text is untouched, so re-highlighting is two taps away.
 */

/** Matches `study-card.tsx`, so a paragraph does not resize between editing and study. */
const FONT_SIZE = 17
const LINE_HEIGHT = 28

export interface HighlightSurfaceProps {
  paragraph: string
  answers: readonly (AnswerRange & { ordinal: number })[]
  onAddHighlight: (range: Pick<AnswerRange, 'startOffset' | 'endOffset'>) => void
  onRemoveHighlight: (ordinal: number) => void
  /**
   * What a highlight is, in the words shown to the user. Defaults to `blank`.
   *
   * The scanner's first stage highlights *questions* out of a whole recognized
   * page, and telling that user their selection "overlaps blank 2" describes
   * something they have not done yet. Two words and a cap are the entire
   * difference between the two stages, which is why this is a prop rather than a
   * second surface.
   */
  noun?: 'blank' | 'question'
  /**
   * How many highlights this surface allows. Defaults to a card's blank limit.
   *
   * A page of notes can easily hold more than twelve question spans, and the
   * per-card limit applied there would refuse selections for a reason that is not
   * true of the thing being selected.
   */
  max?: number
}

export function HighlightSurface({
  paragraph,
  answers,
  onAddHighlight,
  onRemoveHighlight,
  noun = 'blank',
  max = ANSWERS_MAX_PER_CARD,
}: HighlightSurfaceProps): ReactElement {
  const [armed, setArmed] = useState<WordToken | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const warning = useTokenColor('--warning')

  function handleAddHighlight(range: Pick<AnswerRange, 'startOffset' | 'endOffset'>): void {
    const collisions = answers.filter((answer) => rangesOverlap(range, answer))
    if (collisions.length > 0) {
      const names = collisions.map((answer) => String(answer.ordinal + 1)).join(', ')
      setMessage(
        collisions.length === 1
          ? `That overlaps ${noun} ${names}. Remove it first, or select different words.`
          : `That overlaps ${noun}s ${names}. Remove them first, or select different words.`,
      )
      return
    }

    if (answers.length >= max) {
      setMessage(`You have reached the limit of ${String(max)} ${noun}s.`)
      return
    }

    onAddHighlight(range)
    setMessage(null)
    setArmed(null)
  }

  function handleWordPress(token: WordToken): void {
    if (armed === null) {
      // First tap arms the word
      setArmed(token)
      setMessage(null)
    } else if (armed.start === token.start) {
      // Second tap on the same word creates a 1-word blank
      handleAddHighlight({ startOffset: token.start, endOffset: token.end })
    } else {
      // Tap on a second word creates a multi-word blank
      handleAddHighlight(spanBetween(armed, token))
    }
  }

  function handleWordLongPress(token: WordToken): void {
    // Quick single-word blank on long press
    handleAddHighlight({ startOffset: token.start, endOffset: token.end })
  }

  return (
    <View className="gap-2.5">
      <View className="rounded-md border border-border bg-surface p-4">
        <View className="flex-row flex-wrap items-center">
          {toPieces(paragraph, answers).map((piece) => {
            const { ordinal } = piece

            if (ordinal === null) {
              return (
                <PlainRun
                  key={piece.start}
                  text={piece.text}
                  offset={piece.start}
                  armed={armed}
                  onWordPress={handleWordPress}
                  onWordLongPress={handleWordLongPress}
                />
              )
            }

            return (
              <HighlightMark
                key={piece.start}
                ordinal={ordinal}
                text={piece.text}
                noun={noun}
                onPress={() => {
                  onRemoveHighlight(ordinal)
                  setMessage(null)
                }}
              />
            )
          })}
        </View>
      </View>

      {/* Armed Selection Guide */}
      {armed !== null && (
        <View className="flex-row items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
          <Text className="flex-1 text-xs text-primary font-medium">
            {`Selected "${armed.text}". Tap it again for 1 word, or tap another word to highlight a phrase.`}
          </Text>
          <Text
            onPress={() => setArmed(null)}
            className="ml-2 text-xs font-bold text-muted-foreground uppercase underline"
          >
            Cancel
          </Text>
        </View>
      )}

      {message !== null && (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row items-start gap-1.5 rounded-lg bg-warning/10 p-2.5"
        >
          <AlertIcon color={warning} size={16} />
          <Text className="flex-1 text-xs font-semibold text-warning">{message}</Text>
        </View>
      )}

      <Text className="text-xs text-muted-foreground">
        {`Tap a word twice or tap two words to create a ${noun}. Tap a ${noun} to remove it.`}
      </Text>
    </View>
  )
}

function PlainRun({
  text,
  offset,
  armed,
  onWordPress,
  onWordLongPress,
}: {
  text: string
  offset: number
  armed: WordToken | null
  onWordPress: (token: WordToken) => void
  onWordLongPress: (token: WordToken) => void
}): ReactElement {
  return (
    <>
      {tokenize(text).map((token) => {
        const absolute: WordToken = {
          ...token,
          start: token.start + offset,
          end: token.end + offset,
        }

        if (!token.isWord) {
          // Render spaces/newlines
          return token.text === '\n' ? (
            <View key={absolute.start} style={{ width: '100%', height: 8 }} />
          ) : (
            <Text
              key={absolute.start}
              style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }}
              className="text-foreground"
            >
              {' '}
            </Text>
          )
        }

        const isArmed = armed !== null && armed.start === absolute.start

        return (
          <Text
            key={absolute.start}
            onPress={() => onWordPress(absolute)}
            onLongPress={() => onWordLongPress(absolute)}
            style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }}
            className={`rounded px-1 text-foreground ${
              isArmed
                ? 'bg-amber-400/30 text-amber-300 font-bold underline'
                : 'active:bg-surface-muted'
            }`}
          >
            {token.text}
          </Text>
        )
      })}
    </>
  )
}

/**
 * One highlighted run and its numbered badge.
 *
 * The badge is a trailing superscript, as on the web — RN cannot absolutely
 * position a `<Text>` inside a `<Text>`, and a leading badge would push the first
 * word of every blank off its natural position in the line. It is hidden from the
 * accessibility tree because the label already carries the number in words.
 */
function HighlightMark({
  ordinal,
  text,
  noun,
  onPress,
}: {
  ordinal: number
  text: string
  noun: 'blank' | 'question'
  onPress: () => void
}): ReactElement {
  const label = String(ordinal + 1)

  return (
    <View className="mb-1">
      <Text
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${noun === 'blank' ? 'Blank' : 'Question'} ${label}: ${text}. Tap to remove.`}
        style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }}
        className="rounded bg-highlight px-1 font-medium text-highlight-foreground"
      >
        {text}
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{ fontSize: 11, lineHeight: LINE_HEIGHT }}
          className="font-semibold opacity-70"
        >
          {label}
        </Text>
      </Text>
    </View>
  )
}

import { useState, useRef, type ReactElement } from 'react'
import { Text, View, PanResponder, type LayoutRectangle } from 'react-native'
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
  const [message, setMessage] = useState<string | null>(null)
  const warning = useTokenColor('--warning')

  // Track layouts and tokens of words for drag selection
  const wordLayouts = useRef<Record<number, LayoutRectangle>>({})
  const wordTokens = useRef<Record<number, WordToken>>({})
  const dragRangeRef = useRef<{ start: WordToken; current: WordToken } | null>(null)

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
  }

  // PanResponder to handle drag across words
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent
        const word = findWordAt(locationX, locationY)
        if (word) {
          dragRangeRef.current = { start: word, current: word }
        }
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent
        const word = findWordAt(locationX, locationY)
        if (word && dragRangeRef.current) {
          dragRangeRef.current.current = word
        }
      },
      onPanResponderRelease: (evt) => {
        const { locationX, locationY } = evt.nativeEvent
        const endWord = findWordAt(locationX, locationY)
        const prev = dragRangeRef.current
        dragRangeRef.current = null

        if (prev) {
          const finalEnd = endWord || prev.current
          // If it's a single word tap, just toggle it
          if (prev.start.start === finalEnd.start) {
            const range = { startOffset: prev.start.start, endOffset: prev.start.end }
            // Check if tapped on existing blank to remove it
            const hit = answers.find((a) => rangesOverlap(range, a))
            if (hit) {
              onRemoveHighlight(hit.ordinal)
              setMessage(null)
            } else {
              handleAddHighlight(range)
            }
          } else {
            // Multi-word drag
            const range = spanBetween(prev.start, finalEnd)
            handleAddHighlight(range)
          }
        }
      },
    }),
  ).current

  function findWordAt(x: number, y: number): WordToken | null {
    for (const [key, layout] of Object.entries(wordLayouts.current)) {
      if (
        x >= layout.x &&
        x <= layout.x + layout.width &&
        y >= layout.y &&
        y <= layout.y + layout.height
      ) {
        return wordTokens.current[Number(key)] || null
      }
    }
    return null
  }

  return (
    <View className="gap-3">
      <View
        className="rounded-md border border-border bg-surface p-4"
        {...panResponder.panHandlers}
      >
        <View className="flex-row flex-wrap">
          {toPieces(paragraph, answers).map((piece) => {
            // Bound to a `const` before the branch: TypeScript drops a narrowing
            // on a parameter once it is read inside a closure, and the remove
            // handler below is one.
            const { ordinal } = piece

            if (ordinal === null) {
              return (
                <PlainRun
                  key={piece.start}
                  text={piece.text}
                  offset={piece.start}
                  onWordLayout={(token, layout) => {
                    wordLayouts.current[token.start] = layout
                    wordTokens.current[token.start] = token
                  }}
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
        {`Tap a word to create a blank. Drag across words to group them. Tap a ${noun} to remove it.`}
      </Text>
    </View>
  )
}

function PlainRun({
  text,
  offset,
  onWordLayout,
}: {
  text: string
  offset: number
  onWordLayout: (token: WordToken, layout: LayoutRectangle) => void
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
            <View key={absolute.start} style={{ width: 4 }} />
          )
        }

        return (
          <View
            key={absolute.start}
            onLayout={(e) => onWordLayout(absolute, e.nativeEvent.layout)}
            className="mb-1"
          >
            <Text
              style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }}
              className="text-foreground"
            >
              {token.text}
            </Text>
          </View>
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

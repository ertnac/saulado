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
  const [anchor, setAnchor] = useState<WordToken | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const warning = useTokenColor('--warning')

  function pressWord(token: WordToken): void {
    if (anchor === null) {
      setAnchor(token)
      setMessage(null)
      return
    }

    setAnchor(null)
    const range = spanBetween(anchor, token)

    // Overlaps are named, never a silent no-op — the user otherwise reads the
    // surface as broken (saulado-ux §3). Copy is the web's verbatim.
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

    // Checked here rather than left to `addHighlight`, which caps silently.
    if (answers.length >= max) {
      setMessage(`You have reached the limit of ${String(max)} ${noun}s.`)
      return
    }

    onAddHighlight(range)
    setMessage(null)
  }

  return (
    <View className="gap-3">
      {/* No wrapper label: React Native has no `group` role, and a `View` label
          is only announced when the view is `accessible`, which would collapse
          every word into one unreachable target. The visible hint below carries
          the same instruction and is announced as ordinary text. */}
      <View className="rounded-md border border-border bg-surface p-4">
        <Text style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }} className="text-foreground">
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
                  anchor={anchor}
                  onPressWord={pressWord}
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
                  // The removed blank may be the one the anchor was measured
                  // against; dropping it avoids a span across a gap the user can
                  // no longer see.
                  setAnchor(null)
                  setMessage(null)
                }}
              />
            )
          })}
        </Text>
      </View>

      {/* Icon as well as colour: a rejection whose colour is invisible still has
          to read as a rejection (saulado-ux §1.3). */}
      <View accessibilityLiveRegion="polite" className="min-h-5">
        {message !== null && (
          <View className="flex-row items-start gap-1.5">
            <AlertIcon color={warning} size={16} />
            <Text className="flex-1 text-sm text-warning">{message}</Text>
          </View>
        )}
      </View>

      <Text className="text-xs text-muted-foreground">
        {anchor === null
          ? `Tap the first word of a phrase, then the last. Tap a ${noun} to remove it.`
          : `Now tap the last word of the phrase — or "${anchor.text}" again for a single word.`}
      </Text>
    </View>
  )
}

/**
 * A run of unhighlighted paragraph, split into tappable words.
 *
 * Whitespace tokens render as plain text: they carry the spacing the paragraph
 * needs and are not blankable on their own, so making them press targets would
 * only let the user arm an anchor on a space.
 */
function PlainRun({
  text,
  offset,
  anchor,
  onPressWord,
}: {
  text: string
  /** Where this run starts in the paragraph — token offsets are relative to the run. */
  offset: number
  anchor: WordToken | null
  onPressWord: (token: WordToken) => void
}): ReactElement {
  return (
    <Text>
      {tokenize(text).map((token) => {
        const absolute: WordToken = {
          ...token,
          start: token.start + offset,
          end: token.end + offset,
        }

        if (!token.isWord) return <Text key={absolute.start}>{token.text}</Text>

        const armed = anchor !== null && anchor.start === absolute.start
        return (
          <Text
            key={absolute.start}
            onPress={() => {
              onPressWord(absolute)
            }}
            accessibilityRole="button"
            accessibilityLabel={
              armed
                ? `${token.text}, selected. Tap another word to finish the blank.`
                : `${token.text}. Tap to start a blank.`
            }
            className={armed ? 'font-semibold text-accent-strong underline' : ''}
          >
            {token.text}
          </Text>
        )
      })}
    </Text>
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
    <Text
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${noun === 'blank' ? 'Blank' : 'Question'} ${label}: ${text}. Tap to remove.`}
      className="rounded bg-highlight font-medium text-highlight-foreground"
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
  )
}
